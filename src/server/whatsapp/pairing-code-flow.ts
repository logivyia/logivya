/**
 * STABLE WHATSAPP/MESSAGE CORE - DO NOT MODIFY WITHOUT EXPLICIT APPROVAL.
 * Centralized phone pairing orchestration. Repeated web/mobile requests must
 * reuse an active code or in-flight job instead of resetting the socket.
 */
import { AccountStatus, type WhatsAppAccount } from "@prisma/client";
import { resetAccountForConnection } from "@/lib/whatsapp/account-status-machine";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { enqueueWhatsAppJob } from "@/server/queues/producer";
import { withWhatsAppAccountLock } from "@/server/whatsapp/account-lock";
import { waitForPairingCode } from "@/server/whatsapp/worker-health";

const ACTIVE_PAIRING_STATUSES = new Set<AccountStatus>([
  AccountStatus.PENDING_PAIRING,
  AccountStatus.PAIRING_CODE_READY,
  AccountStatus.CONNECTING,
]);
const PAIRING_CODE_MIN_TTL_MS = Number(process.env.WHATSAPP_PAIRING_CODE_MIN_TTL_MS || 30_000);
const PAIRING_IN_FLIGHT_MS = Number(process.env.WHATSAPP_PAIRING_IN_FLIGHT_MS || 90_000);

type PairingRequestSource = "web" | "mobile";

type RequestPhonePairingCodeInput = {
  accountId: string;
  phoneNumber: string;
  source: PairingRequestSource;
  companyId?: string;
  userId?: string;
  correlationId?: string;
};

function maskPhoneNumber(phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
}

function samePhone(account: Pick<WhatsAppAccount, "phoneNumber">, phoneNumber: string) {
  return account.phoneNumber === phoneNumber;
}

function hasReusableCode(account: Pick<WhatsAppAccount, "phoneNumber" | "pairingCode" | "pairingCodeExpiresAt">, phoneNumber: string) {
  return Boolean(
    samePhone(account, phoneNumber) &&
      account.pairingCode &&
      account.pairingCodeExpiresAt &&
      account.pairingCodeExpiresAt.getTime() - Date.now() > PAIRING_CODE_MIN_TTL_MS,
  );
}

function hasInFlightPairing(account: Pick<WhatsAppAccount, "phoneNumber" | "status" | "updatedAt" | "lastError">, phoneNumber: string) {
  return Boolean(
    samePhone(account, phoneNumber) &&
      ACTIVE_PAIRING_STATUSES.has(account.status) &&
      Date.now() - account.updatedAt.getTime() < PAIRING_IN_FLIGHT_MS &&
      !account.lastError,
  );
}

export async function requestPhonePairingCode(input: RequestPhonePairingCodeInput) {
  const startedAt = Date.now();
  const baseLog = {
    accountId: input.accountId,
    companyId: input.companyId,
    userId: input.userId,
    source: input.source,
    correlationId: input.correlationId,
    phoneNumber: maskPhoneNumber(input.phoneNumber),
  };

  logger.info("WA_PAIRING_START", baseLog);

  const decision = await withWhatsAppAccountLock(
    input.accountId,
    "pairing-code-request",
    async () => {
      const existing = await prisma.whatsAppAccount.findUniqueOrThrow({
        where: { id: input.accountId },
      });

      if (existing.status === AccountStatus.CONNECTED) {
        logger.info("WA_PAIRING_ALREADY_CONNECTED", { ...baseLog, durationMs: Date.now() - startedAt });
        return { reused: true, alreadyConnected: true };
      }

      if (hasReusableCode(existing, input.phoneNumber)) {
        logger.info("WA_PAIRING_CODE_REUSED", {
          ...baseLog,
          status: existing.status,
          expiresAt: existing.pairingCodeExpiresAt?.toISOString(),
          durationMs: Date.now() - startedAt,
        });
        return { reused: true, alreadyConnected: false };
      }

      if (hasInFlightPairing(existing, input.phoneNumber)) {
        logger.info("WA_PAIRING_IN_FLIGHT_REUSED", {
          ...baseLog,
          status: existing.status,
          updatedAt: existing.updatedAt.toISOString(),
          durationMs: Date.now() - startedAt,
        });
        return { reused: true, alreadyConnected: false };
      }

      await resetAccountForConnection(input.accountId, AccountStatus.PENDING_PAIRING, { phoneNumber: input.phoneNumber });
      const jobBucket = Math.floor(Date.now() / 10_000);
      const job = await enqueueWhatsAppJob(
        "pairing",
        { action: "pairing", accountId: input.accountId, phoneNumber: input.phoneNumber },
        { jobId: `pairing-${input.accountId}-${jobBucket}` },
      );
      logger.info("WA_PAIRING_JOB_ENQUEUED", {
        ...baseLog,
        jobId: job.id,
        durationMs: Date.now() - startedAt,
      });
      return { reused: false, alreadyConnected: false };
    },
    { ttlMs: 30_000, timeoutMs: 12_000, correlationId: input.correlationId },
  );

  if (decision.alreadyConnected) return { ...decision, ready: null };

  const ready = await waitForPairingCode(input.accountId);
  logger.info("WA_PAIRING_CODE_READY_RETURNED", {
    ...baseLog,
    reused: decision.reused,
    status: ready.status,
    expiresAt: ready.pairingCodeExpiresAt?.toISOString(),
    durationMs: Date.now() - startedAt,
  });
  return { ...decision, ready };
}
