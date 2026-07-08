/**
 * STABLE WHATSAPP/MESSAGE CORE - DO NOT MODIFY WITHOUT EXPLICIT APPROVAL.
 * Read-side restore probes must never turn a linked WhatsApp account into
 * AUTH_REQUIRED; only explicit logout/auth failure paths may do that.
 */
import { AccountStatus } from "@prisma/client";
import { hasRestorableWhatsAppCredentials } from "@/lib/whatsapp/session-manager";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { enqueueWhatsAppJob } from "@/server/queues/producer";

const FATAL_SESSION_ERRORS = new Set(["WHATSAPP_LOGGED_OUT"]);
const RESTORE_CANDIDATE_STATUSES = new Set<AccountStatus>([
  AccountStatus.CONNECTED,
  AccountStatus.CONNECTING,
  AccountStatus.DISCONNECTED,
  AccountStatus.RECONNECT_REQUIRED,
  AccountStatus.FAILED,
  AccountStatus.ERROR,
]);
const STALE_CONNECTED_MS = Number(process.env.WHATSAPP_ON_DEMAND_RESTORE_STALE_MS || 90_000);
const RESTORE_THROTTLE_MS = Number(process.env.WHATSAPP_ON_DEMAND_RESTORE_THROTTLE_MS || 45_000);

export type WhatsAppRestoreAccount = {
  id: string;
  userId: string | null;
  companyId: string;
  phoneNumber: string | null;
  status: AccountStatus;
  lastError: string | null;
  archivedAt: Date | null;
  updatedAt: Date;
  lastHeartbeatAt?: Date | null;
  sessionSnapshotAt?: Date | null;
};

type RestoreContext = {
  userId?: string | null;
  companyId?: string | null;
  correlationId?: string;
};

function maskPhoneNumber(phoneNumber?: string | null) {
  if (!phoneNumber) return null;
  const digits = phoneNumber.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
}

export function isFatalWhatsAppSessionError(lastError?: string | null) {
  return Boolean(lastError && FATAL_SESSION_ERRORS.has(lastError));
}

function baseLog(account: WhatsAppRestoreAccount, context: RestoreContext, source: string, reason: string, stateAfter?: string) {
  return {
    correlationId: context.correlationId ?? `wa-restore-${account.id}-${Date.now()}`,
    userId: context.userId ?? account.userId ?? undefined,
    companyId: context.companyId ?? account.companyId,
    whatsappAccountId: account.id,
    phoneNumber: maskPhoneNumber(account.phoneNumber),
    stateBefore: account.status,
    stateAfter,
    reason,
    source,
  };
}

function shouldAttemptRestore(account: WhatsAppRestoreAccount) {
  if (account.archivedAt) return false;
  if (isFatalWhatsAppSessionError(account.lastError)) return false;
  if (account.lastError === "WHATSAPP_CREDENTIALS_MISSING" && !account.sessionSnapshotAt && !account.phoneNumber) return false;
  if (!RESTORE_CANDIDATE_STATUSES.has(account.status)) return false;

  const updatedRecently = Date.now() - account.updatedAt.getTime() < RESTORE_THROTTLE_MS;
  if (account.status === AccountStatus.CONNECTING && updatedRecently) return false;

  if (account.status === AccountStatus.CONNECTED) {
    const heartbeatFresh = account.lastHeartbeatAt && Date.now() - account.lastHeartbeatAt.getTime() < STALE_CONNECTED_MS;
    return !heartbeatFresh;
  }

  return true;
}

export async function requestWhatsAppSessionRestoreIfNeeded(
  account: WhatsAppRestoreAccount,
  context: RestoreContext,
  source: string,
) {
  const reason = "on_demand_status_restore";
  if (!shouldAttemptRestore(account)) return false;

  const attemptLog = baseLog(account, context, source, reason, "CHECKING_RESTORABLE_SESSION");
  logger.info("WA_SOCKET_MISSING_RESTORE_ATTEMPT", attemptLog);

  let restorable = false;
  try {
    restorable = await hasRestorableWhatsAppCredentials(account.id);
  } catch (error) {
    logger.error("WA_SESSION_RESTORE_FAILED", error, {
      ...attemptLog,
      stateAfter: account.status,
      reason: "restorable_check_failed",
    });
    return false;
  }

  if (!restorable) {
    logger.warn("WA_RESTORE_SKIPPED_NO_RESTORABLE_SESSION", {
      ...attemptLog,
      stateAfter: account.status,
      reason: "no_restorable_credentials_read_probe",
      hasSessionSnapshot: Boolean(account.sessionSnapshotAt),
    });
    return false;
  }

  await prisma.whatsAppAccount.updateMany({
    where: {
      id: account.id,
      archivedAt: null,
      OR: [{ lastError: null }, { lastError: { notIn: [...FATAL_SESSION_ERRORS] } }],
    },
    data: {
      status: AccountStatus.CONNECTING,
      lastError: null,
      qrCode: null,
      qrExpiresAt: null,
      pairingCode: null,
      pairingCodeExpiresAt: null,
      recoveryLevel: 2,
      healthScore: 65,
    },
  });

  const bucket = Math.floor(Date.now() / RESTORE_THROTTLE_MS);
  try {
    const job = await enqueueWhatsAppJob(
      "reconnect",
      { action: "reconnect", accountId: account.id },
      { jobId: `restore-${account.id}-${bucket}`, removeOnComplete: 50, removeOnFail: 100 },
    );
    logger.info("WA_RECONNECT_SCHEDULED", {
      ...attemptLog,
      correlationId: job.id ?? attemptLog.correlationId,
      stateAfter: AccountStatus.CONNECTING,
      reason: "restorable_session_found",
    });
    return true;
  } catch (error) {
    logger.error("WA_SESSION_RESTORE_FAILED", error, {
      ...attemptLog,
      stateAfter: AccountStatus.CONNECTING,
      reason: "reconnect_enqueue_failed",
    });
    return false;
  }
}

export async function requestWhatsAppSessionRestoreForAccounts(
  accounts: WhatsAppRestoreAccount[],
  context: RestoreContext,
  source: string,
) {
  let requested = 0;
  for (const account of accounts) {
    if (await requestWhatsAppSessionRestoreIfNeeded(account, context, source)) requested += 1;
  }
  return requested;
}
