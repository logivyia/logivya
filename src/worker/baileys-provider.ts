/**
 * STABLE WHATSAPP/MESSAGE CORE - DO NOT MODIFY WITHOUT EXPLICIT APPROVAL.
 * CRITICAL LOGIVYA WHATSAPP CONNECTION MODULE.
 * Do not modify without running the full WhatsApp regression test suite.
 */
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, fetchLatestWaWebVersion, getPlatformId, useMultiFileAuthState, type WAMessageKey, type WASocket } from "@whiskeysockets/baileys";
import { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { enqueueWhatsAppJob } from "@/server/queues/producer";
import { computeWhatsAppHealthScore } from "@/server/whatsapp/connection-health";
import { canExposePhonePairingCode } from "@/server/whatsapp/pairing-code-state";
import { hasActivePhonePairing, isPhonePairingActive } from "@/server/whatsapp/pairing-guard";
import { pairingUserMessage } from "@/server/whatsapp/pairing-errors";
import { normalizeWhatsAppPhoneNumber } from "@/server/whatsapp/phone";
import {
  backupWhatsAppSessionToDatabase,
  clearWhatsAppSession,
  ensureWhatsAppSessionRoot,
  hasRestorableWhatsAppCredentials,
  restoreWhatsAppSessionFromDatabase,
  whatsappSessionDirectory,
} from "@/lib/whatsapp/session-manager";
import type { DeleteGroupMessageInput, DeleteResult, GroupResult, RequestPairingCodeOptions, SendGroupMessageInput, SendResult, SessionResult, WhatsAppProvider } from "@/server/whatsapp/provider";

type SessionMode = "PAIR_QR" | "PAIR_PHONE" | "RESTORE" | "RECONNECT";
type WhatsAppWebVersion = [number, number, number];
type WhatsAppVersionInfo = {
  version: WhatsAppWebVersion;
  source: "wa-web" | "baileys-default";
  isLatest: boolean;
  fallbackReason?: string;
};

const sockets = new Map<string, WASocket>();
const intentionallyStoppedSockets = new WeakSet<WASocket>();
const sessionModes = new Map<string, SessionMode>();
const sessionRestarts = new Map<string, Promise<WASocket>>();
const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const qrTransientRetries = new Map<string, number>();
const pairingTransientRetries = new Map<string, number>();
const pairingRegisteredReconnects = new Map<string, number>();
const pairingRetryScheduledAt = new Map<string, number>();
const SOCKET_INITIALIZATION_TIMEOUT_MS = Number(process.env.WHATSAPP_SOCKET_INITIALIZATION_TIMEOUT_MS || 30_000);
const PAIRING_SOCKET_BOOTSTRAP_MS = Number(process.env.WHATSAPP_PAIRING_SOCKET_BOOTSTRAP_MS || 5_000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.WHATSAPP_HEARTBEAT_INTERVAL_MS || 30_000);
const QR_TRANSIENT_RETRY_LIMIT = Number(process.env.WHATSAPP_QR_TRANSIENT_RETRY_LIMIT || 3);
const PAIRING_TRANSIENT_RETRY_LIMIT = Number(process.env.WHATSAPP_PAIRING_TRANSIENT_RETRY_LIMIT || 5);
const PAIRING_REGISTERED_RECONNECT_LIMIT = Number(process.env.WHATSAPP_PAIRING_REGISTERED_RECONNECT_LIMIT || 3);
const PAIRING_CODE_TTL_MS = Number(process.env.WHATSAPP_PAIRING_CODE_TTL_MS || 5 * 60_000);
const PAIRING_CODE_REFRESH_MIN_TTL_MS = Number(process.env.WHATSAPP_PAIRING_CODE_MIN_TTL_MS || 120_000);
const PHONE_PAIRING_QR_REF_TIMEOUT_MS = Number(process.env.WHATSAPP_PHONE_PAIRING_QR_REF_TIMEOUT_MS || 60_000);
const PAIRING_CODE_REISSUE_RETRY_MS = Number(process.env.WHATSAPP_PAIRING_CODE_REISSUE_RETRY_MS || process.env.WHATSAPP_PAIRING_PRESERVED_CODE_RETRY_MS || 10_000);
const PAIRING_RETRY_SCHEDULED_ERROR = "WHATSAPP_PAIRING_RETRY_SCHEDULED";
const MISSING_CREDENTIALS_GRACE_ATTEMPTS = Number(process.env.WHATSAPP_MISSING_CREDENTIALS_GRACE_ATTEMPTS || 6);
const RECONNECT_BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 60_000, 120_000] as const;
const WHATSAPP_PAIRING_COUNTRY_CODE = (process.env.WHATSAPP_PAIRING_COUNTRY_CODE || process.env.WHATSAPP_COUNTRY_CODE || "TR").toUpperCase();
const WHATSAPP_PAIRING_BROWSER_NAME = process.env.WHATSAPP_PAIRING_BROWSER_NAME || "Chrome";
const WHATSAPP_PAIRING_BROWSER_OS = (process.env.WHATSAPP_PAIRING_BROWSER_OS || "ubuntu").toLowerCase();

function resolveWhatsAppBrowser() {
  if (WHATSAPP_PAIRING_BROWSER_OS === "macos") return Browsers.macOS(WHATSAPP_PAIRING_BROWSER_NAME);
  if (WHATSAPP_PAIRING_BROWSER_OS === "windows") return Browsers.windows(WHATSAPP_PAIRING_BROWSER_NAME);
  return Browsers.ubuntu(WHATSAPP_PAIRING_BROWSER_NAME);
}

const WHATSAPP_BROWSER = resolveWhatsAppBrowser();
const WHATSAPP_COMPANION_PLATFORM_ID = getPlatformId(WHATSAPP_BROWSER[1]);
const WHATSAPP_COMPANION_PLATFORM_DISPLAY = `${WHATSAPP_BROWSER[1]} (${WHATSAPP_BROWSER[0]})`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchCurrentWhatsAppWebVersion(): Promise<WhatsAppVersionInfo> {
  const live = await fetchLatestWaWebVersion({}).catch((error: unknown) => ({
    version: undefined,
    isLatest: false,
    error,
  }));
  if (live.version) {
    return {
      version: live.version,
      source: "wa-web",
      isLatest: live.isLatest,
      fallbackReason: "error" in live && live.error ? errorMessage(live.error) : undefined,
    };
  }

  const fallback = await fetchLatestBaileysVersion();
  return {
    version: fallback.version,
    source: "baileys-default",
    isLatest: fallback.isLatest,
    fallbackReason: "error" in live && live.error ? errorMessage(live.error) : "wa_web_version_unavailable",
  };
}

function maskPhoneNumber(phoneNumber?: string | null) {
  if (!phoneNumber) return null;
  const digits = phoneNumber.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
}

function disconnectCode(error: unknown) {
  return (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
}

function isLoggedOutError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return disconnectCode(error) === DisconnectReason.loggedOut || message.includes("logged out") || message.includes("whatsapp_logged_out");
}

async function auditAccount(accountId: string, action: string, metadata: Record<string, unknown> = {}) {
  const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId }, select: { companyId: true } });
  if (!account) return;
  const auditMetadata = JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue;
  await prisma.auditLog.create({ data: { companyId: account.companyId, action, entityType: "WhatsAppAccount", entityId: accountId, metadata: auditMetadata } });
}

export class BaileysWhatsAppProvider implements WhatsAppProvider {
  private async waitForConnectedSocket(accountId: string, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const socket = sockets.get(accountId);
      if (socket?.user) return socket;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("WHATSAPP_SESSION_CONNECTION_TIMEOUT");
  }

  private stopHeartbeat(accountId: string) {
    const timer = heartbeatTimers.get(accountId);
    if (timer) clearInterval(timer);
    heartbeatTimers.delete(accountId);
  }

  private scheduleReconnect(accountId: string, reason: string) {
    if (reconnectTimers.has(accountId)) return;
    void prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { status: true, pairingCode: true, pairingCodeExpiresAt: true, updatedAt: true, reconnectRetryCount: true, archivedAt: true, lastError: true },
    }).then((account) => {
      if (!account || account.archivedAt || account.lastError === "WHATSAPP_LOGGED_OUT") return;
      if (hasActivePhonePairing(account)) {
        logger.warn("whatsapp.session.reconnect_skipped_active_pairing", { accountId, reason, status: account.status });
        return;
      }
      const attempt = Math.max(0, account.reconnectRetryCount);
      const baseDelay = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)];
      const delay = baseDelay + Math.floor(Math.random() * Math.min(baseDelay, 5_000));
      logger.warn("whatsapp.session.reconnect_scheduled", { accountId, attempt: attempt + 1, delayMs: delay, reason });
      const timer = setTimeout(() => {
        reconnectTimers.delete(accountId);
        void isPhonePairingActive(accountId)
          .then((activePairing) => {
            if (activePairing) {
              logger.warn("whatsapp.session.auto_reconnect_skipped_active_pairing", { accountId, attempt: attempt + 1, reason });
              return null;
            }
            return prisma.whatsAppAccount.updateMany({
              where: { id: accountId, archivedAt: null },
              data: { status: "CONNECTING", reconnectRetryCount: { increment: 1 }, lastError: "WHATSAPP_TRANSIENT_DISCONNECT" },
            }).then(() => this.ensureConnectedSocket(accountId));
          })
          .catch((error) => {
            logger.error("whatsapp.session.auto_reconnect_failed", error, { accountId, attempt: attempt + 1 });
            this.scheduleReconnect(accountId, errorMessage(error));
          });
      }, delay);
      timer.unref?.();
      reconnectTimers.set(accountId, timer);
    }).catch((error) => logger.error("whatsapp.session.reconnect_schedule_failed", error, { accountId }));
  }

  private async markTransientConnectionLoss(accountId: string, reason: string, recoveryLevel = 2) {
    if (await isPhonePairingActive(accountId)) {
      logger.warn("whatsapp.connection.transient_loss_skipped_active_pairing", { accountId, reason, recoveryLevel });
      return;
    }
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null, OR: [{ lastError: null }, { lastError: { not: "WHATSAPP_LOGGED_OUT" } }] },
      data: {
        status: "CONNECTING",
        lastError: "WHATSAPP_TRANSIENT_DISCONNECT",
        recoveryLevel,
        healthScore: 65,
        qrCode: null,
        qrExpiresAt: null,
        pairingCode: null,
        pairingCodeExpiresAt: null,
      },
    });
    await prisma.whatsAppSession.updateMany({ where: { accountId }, data: { status: "CONNECTING", qrCode: null, expiresAt: null } }).catch(() => undefined);
    logger.warn("whatsapp.connection.transient_loss", { accountId, reason, recoveryLevel });
  }

  private async markFreshPairingRequired(accountId: string, reason: string) {
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_CREDENTIALS_MISSING", recoveryLevel: 5, healthScore: 0 },
    });
    logger.error("whatsapp.session.fresh_pairing_required", new Error(reason), { accountId, reason });
  }

  private shouldRetryMissingCredentials(account: { status: string; lastError: string | null; phoneNumber: string | null; lastConnectedAt: Date | null; sessionSnapshotAt: Date | null; recoveryLevel: number | null }) {
    if (account.lastError === "WHATSAPP_LOGGED_OUT") return false;
    const wasLinked = Boolean(
      account.phoneNumber ||
      account.lastConnectedAt ||
      account.sessionSnapshotAt ||
      ["CONNECTED", "CONNECTING", "DISCONNECTED", "RECONNECT_REQUIRED"].includes(account.status),
    );
    return wasLinked && Math.max(0, account.recoveryLevel ?? 0) < MISSING_CREDENTIALS_GRACE_ATTEMPTS;
  }

  private async handleMissingCredentials(accountId: string, reason: string): Promise<never> {
    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { status: true, lastError: true, phoneNumber: true, lastConnectedAt: true, sessionSnapshotAt: true, recoveryLevel: true, archivedAt: true },
    });
    if (!account || account.archivedAt) throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");
    if (await isPhonePairingActive(accountId)) {
      logger.warn("whatsapp.session.missing_credentials_skipped_active_pairing", { accountId, reason, status: account.status });
      throw new Error("WHATSAPP_PAIRING_IN_PROGRESS");
    }

    if (this.shouldRetryMissingCredentials(account)) {
      const recoveryLevel = Math.min(MISSING_CREDENTIALS_GRACE_ATTEMPTS, Math.max(0, account.recoveryLevel ?? 0) + 1);
      await this.markTransientConnectionLoss(accountId, reason, recoveryLevel);
      this.scheduleReconnect(accountId, reason);
      throw new Error("WHATSAPP_RECONNECT_REQUIRED");
    }

    await this.markFreshPairingRequired(accountId, reason);
    throw new Error("WHATSAPP_RECONNECT_REQUIRED");
  }

  private async keepAliveSocket(accountId: string, socket: WASocket) {
    if (sockets.get(accountId) !== socket || !socket.user) return false;
    try {
      await socket.sendPresenceUpdate("available");
      return sockets.get(accountId) === socket && Boolean(socket.user);
    } catch (error) {
      logger.warn("whatsapp.keepalive.failed", { accountId, reason: errorMessage(error) });
      return false;
    }
  }

  private startHeartbeat(accountId: string, socket: WASocket) {
    this.stopHeartbeat(accountId);
    const beat = async () => {
      const now = new Date();
      const healthy = await this.keepAliveSocket(accountId, socket);
      const groupCount = await prisma.whatsAppGroup.count({ where: { accountId, isArchived: false } }).catch(() => 0);
      const healthScore = computeWhatsAppHealthScore({
        status: healthy ? "CONNECTED" : "DISCONNECTED",
        lastHeartbeatAt: now,
        lastPongAt: healthy ? now : null,
        groupCount,
        hasSessionSnapshot: true,
      });
      await prisma.whatsAppAccount.updateMany({
        where: { id: accountId, archivedAt: null },
        data: {
          lastHeartbeatAt: now,
          lastPingAt: now,
          lastPongAt: healthy ? now : undefined,
          healthScore,
          ...(healthy ? { status: "CONNECTED" as const, lastError: null, reconnectRetryCount: 0, recoveryLevel: 0 } : { recoveryLevel: 1 }),
        },
      });
      await prisma.whatsAppSession.updateMany({ where: { accountId }, data: { lastHeartbeatAt: now } });
      if (!healthy) {
        logger.warn("whatsapp.heartbeat_fail", { accountId });
        this.stopHeartbeat(accountId);
        await this.markTransientConnectionLoss(accountId, "heartbeat_fail", 1);
        this.scheduleReconnect(accountId, "heartbeat_fail");
      }
    };
    void beat().catch((error) => logger.error("whatsapp.heartbeat.failed", error, { accountId }));
    const timer = setInterval(() => void beat().catch((error) => logger.error("whatsapp.heartbeat.failed", error, { accountId })), HEARTBEAT_INTERVAL_MS);
    timer.unref?.();
    heartbeatTimers.set(accountId, timer);
  }

  private async ensureConnectedSocket(accountId: string) {
    const activeSocket = sockets.get(accountId);
    if (activeSocket?.user) return activeSocket;
    if (await isPhonePairingActive(accountId)) throw new Error("WHATSAPP_PAIRING_IN_PROGRESS");

    const existingRestart = sessionRestarts.get(accountId);
    if (existingRestart) return existingRestart;

    const restart = (async () => {
      const account = await prisma.whatsAppAccount.findUnique({
        where: { id: accountId },
        select: { id: true, archivedAt: true, status: true, lastError: true, phoneNumber: true, lastConnectedAt: true, sessionSnapshotAt: true, recoveryLevel: true },
      });
      if (!account || account.archivedAt) throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");

      if (!(await hasRestorableWhatsAppCredentials(accountId))) {
        await this.handleMissingCredentials(accountId, "ensure_connected_socket_missing_credentials");
      }
      await restoreWhatsAppSessionFromDatabase(accountId);

      logger.info("SESSION_RESTORED", { accountId, level: 3 });
      logger.info("whatsapp.session.recovery_started", { accountId });
      await prisma.whatsAppAccount.updateMany({
        where: { id: accountId, archivedAt: null, status: { in: ["DISCONNECTED", "RECONNECT_REQUIRED", "FAILED", "ERROR"] } },
        data: { status: "CONNECTING", lastError: null, recoveryLevel: 2 },
      });
      const existingSocket = sockets.get(accountId);
      if (existingSocket && !existingSocket.user) {
        await this.stopSocket(accountId, "Replace stale WhatsApp socket");
      }
      if (!sockets.has(accountId)) {
        const { initialized } = await this.startSession(accountId, "RECONNECT");
        await initialized;
      }
      const socket = await this.waitForConnectedSocket(accountId);
      logger.info("SESSION_RECONNECTED", { accountId });
      logger.info("whatsapp.session.recovery_completed", { accountId });
      return socket;
    })().finally(() => sessionRestarts.delete(accountId));

    sessionRestarts.set(accountId, restart);
    return restart;
  }

  private async stopSocket(accountId: string, reason: string) {
    this.stopHeartbeat(accountId);
    const reconnectTimer = reconnectTimers.get(accountId);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimers.delete(accountId);
    const socket = sockets.get(accountId);
    if (socket) {
      intentionallyStoppedSockets.add(socket);
      socket.end(new Error(reason));
      sockets.delete(accountId);
    }
    sessionModes.delete(accountId);
  }

  private async clearTemporaryAuth(accountId: string) {
    await this.stopSocket(accountId, "Fresh pairing session reset");
    await clearWhatsAppSession(accountId);
  }

  private async hasActivePairingCode(accountId: string) {
    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { status: true, phoneNumber: true, pairingCode: true, pairingCodeExpiresAt: true, lastError: true },
    });

    return account ? canExposePhonePairingCode(account) : false;
  }

  private async refreshPairingCodeSocket(accountId: string, phoneNumber: string, pairingCode: string, expiresAt: Date, attempt: number) {
    if (expiresAt.getTime() - Date.now() <= 10_000) {
      logger.warn("whatsapp.pairing.same_code_refresh_skipped_expiring", { accountId, attempt });
      return;
    }

    await this.clearTemporaryAuth(accountId);
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: {
        status: "PAIRING_CODE_READY",
        phoneNumber,
        pairingCode,
        pairingCodeExpiresAt: expiresAt,
        lastError: null,
        recoveryLevel: Math.min(attempt, 5),
        healthScore: 40,
      },
    });

    const session = await this.startSession(accountId, "PAIR_PHONE");
    if (session.registered) return;
    const readiness = session.initialized
      .then(() => true)
      .catch((error) => {
        logger.warn("whatsapp.pairing.same_code_refresh_initialization_deferred_failed", {
          accountId,
          attempt,
          reason: errorMessage(error),
        });
        return false;
      });
    const ready = await Promise.race([readiness, sleep(PAIRING_SOCKET_BOOTSTRAP_MS).then(() => false)]);
    if (!ready) logger.warn("whatsapp.pairing.same_code_refresh_bootstrap_wait_timeout", { accountId, attempt });
    const activeSocket = sockets.get(accountId) ?? session.socket;
    await activeSocket.requestPairingCode(phoneNumber, pairingCode);
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: {
        status: "PAIRING_CODE_READY",
        phoneNumber,
        pairingCode,
        pairingCodeExpiresAt: expiresAt,
        lastError: null,
        recoveryLevel: Math.min(attempt, 5),
        healthScore: 45,
      },
    });
    const refreshMetadata = {
      attempt,
      expiresAt: expiresAt.toISOString(),
      qrRefTimeoutMs: PHONE_PAIRING_QR_REF_TIMEOUT_MS,
      browser: WHATSAPP_BROWSER,
      countryCode: WHATSAPP_PAIRING_COUNTRY_CODE,
      companionPlatformId: WHATSAPP_COMPANION_PLATFORM_ID,
      companionPlatformDisplay: WHATSAPP_COMPANION_PLATFORM_DISPLAY,
    };
    logger.warn("whatsapp.pairing.same_code_refreshed", { accountId, ...refreshMetadata });
    await auditAccount(accountId, "whatsapp.pairing.code_refreshed", refreshMetadata).catch((error) =>
      logger.warn("whatsapp.pairing.refresh_audit_failed", { accountId, reason: errorMessage(error) }),
    );
  }

  private async refreshPairingCodeAfterSocketClose(accountId: string, reason: string, code?: number) {
    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { archivedAt: true, phoneNumber: true, pairingCode: true, pairingCodeExpiresAt: true },
    });
    if (!account || account.archivedAt || !account.phoneNumber || !account.pairingCode || !account.pairingCodeExpiresAt || account.pairingCodeExpiresAt <= new Date()) return false;
    const phoneNumber = account.phoneNumber;
    const pairingCode = account.pairingCode;
    const expiresAt = account.pairingCodeExpiresAt;

    const nextAttempt = (pairingTransientRetries.get(accountId) ?? 0) + 1;
    pairingTransientRetries.set(accountId, nextAttempt);
    const shouldRefresh = nextAttempt <= PAIRING_TRANSIENT_RETRY_LIMIT;
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: {
        status: shouldRefresh ? "PAIRING_CODE_READY" : "FAILED",
        pairingCode: shouldRefresh ? pairingCode : null,
        pairingCodeExpiresAt: shouldRefresh ? expiresAt : null,
        lastError: shouldRefresh ? null : pairingUserMessage(reason),
        recoveryLevel: Math.min(nextAttempt, 5),
        healthScore: shouldRefresh ? 35 : 0,
      },
    });
    logger.warn("whatsapp.pairing.same_code_refresh_scheduled", {
      accountId,
      code,
      attempt: nextAttempt,
      maxAttempts: PAIRING_TRANSIENT_RETRY_LIMIT,
      reason,
      refresh: shouldRefresh,
      expiresAt: expiresAt.toISOString(),
    });
    await auditAccount(accountId, "whatsapp.pairing.code_refresh_scheduled", { code, attempt: nextAttempt, reason, refresh: shouldRefresh, expiresAt: expiresAt.toISOString() }).catch((error) =>
      logger.warn("whatsapp.pairing.refresh_schedule_audit_failed", { accountId, reason: errorMessage(error) }),
    );

    if (shouldRefresh) {
      const fastRetryDelay = Math.min(1_000 * nextAttempt, 5_000);
      const delay = Math.min(fastRetryDelay, PAIRING_CODE_REISSUE_RETRY_MS);
      setTimeout(() => {
        void this.refreshPairingCodeSocket(accountId, phoneNumber, pairingCode, expiresAt, nextAttempt)
          .catch((error) => logger.error("whatsapp.pairing.same_code_refresh_failed", error, { accountId, attempt: nextAttempt }));
      }, delay);
    } else {
      logger.warn("whatsapp.pairing.same_code_refresh_limit_reached", { accountId, code, attempts: nextAttempt });
    }
    return true;
  }

  private hasRecentPairingRetryScheduled(accountId: string) {
    const scheduledAt = pairingRetryScheduledAt.get(accountId);
    return Boolean(scheduledAt && Date.now() - scheduledAt < Math.max(PAIRING_CODE_REISSUE_RETRY_MS, 5_000));
  }

  private async schedulePairingCodeRequestRetry(accountId: string, phoneNumber: string | null | undefined, reason: string, code?: number) {
    if (this.hasRecentPairingRetryScheduled(accountId)) {
      logger.warn("whatsapp.pairing.retry_already_scheduled", { accountId, reason, code });
      return true;
    }

    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { archivedAt: true, phoneNumber: true },
    });
    const resolvedPhoneNumber = phoneNumber || account?.phoneNumber;
    if (!account || account.archivedAt || !resolvedPhoneNumber) return false;

    const nextAttempt = (pairingTransientRetries.get(accountId) ?? 0) + 1;
    pairingTransientRetries.set(accountId, nextAttempt);
    const shouldRetry = nextAttempt <= PAIRING_TRANSIENT_RETRY_LIMIT;

    await this.clearTemporaryAuth(accountId);
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: {
        status: shouldRetry ? "PENDING_PAIRING" : "FAILED",
        phoneNumber: resolvedPhoneNumber,
        pairingCode: null,
        pairingCodeExpiresAt: null,
        lastError: shouldRetry ? null : pairingUserMessage(reason),
        recoveryLevel: Math.min(nextAttempt, 5),
        healthScore: shouldRetry ? 35 : 0,
      },
    });

    if (!shouldRetry) {
      logger.warn("whatsapp.pairing.retry_limit_reached", { accountId, code, attempts: nextAttempt, reason });
      await auditAccount(accountId, "whatsapp.pairing.failed", { reason, code, attempts: nextAttempt }).catch((error) =>
        logger.warn("whatsapp.pairing.failed_audit_failed", { accountId, reason: errorMessage(error) }),
      );
      return false;
    }

    const delay = Math.min(1_000 * nextAttempt, PAIRING_CODE_REISSUE_RETRY_MS, 5_000);
    pairingRetryScheduledAt.set(accountId, Date.now());
    logger.warn("whatsapp.pairing.code_request_retry_scheduled", {
      accountId,
      code,
      attempt: nextAttempt,
      maxAttempts: PAIRING_TRANSIENT_RETRY_LIMIT,
      delayMs: delay,
      reason,
    });
    await auditAccount(accountId, "whatsapp.pairing.retry_scheduled", { code, attempt: nextAttempt, reason, delayMs: delay }).catch((error) =>
      logger.warn("whatsapp.pairing.retry_audit_failed", { accountId, reason: errorMessage(error) }),
    );
    setTimeout(() => {
      pairingRetryScheduledAt.delete(accountId);
      void enqueueWhatsAppJob(
        "pairing",
        { action: "pairing", accountId, phoneNumber: resolvedPhoneNumber, preserveRetryCounter: true },
        { jobId: `pairing-retry-${accountId}-${nextAttempt}-${Math.floor(Date.now() / 1_000)}` },
      ).catch((error) => logger.error("whatsapp.pairing.retry_enqueue_failed", error, { accountId, attempt: nextAttempt }));
    }, delay);
    return true;
  }

  private async recoverRegisteredPairingClose(accountId: string, reason: string, code?: number) {
    const nextAttempt = (pairingRegisteredReconnects.get(accountId) ?? 0) + 1;
    pairingRegisteredReconnects.set(accountId, nextAttempt);
    if (nextAttempt > PAIRING_REGISTERED_RECONNECT_LIMIT) return false;

    await backupWhatsAppSessionToDatabase(accountId, "pairing.registered.close").catch((error) =>
      logger.warn("whatsapp.pairing.registered_close_backup_failed", { accountId, reason: errorMessage(error) }),
    );
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: {
        status: "CONNECTING",
        pairingCode: null,
        pairingCodeExpiresAt: null,
        lastError: "WHATSAPP_TRANSIENT_DISCONNECT",
        recoveryLevel: Math.min(nextAttempt, 3),
        healthScore: 65,
      },
    });
    await auditAccount(accountId, "whatsapp.pairing.registered_close_reconnect", { code, attempt: nextAttempt, reason }).catch((error) =>
      logger.warn("whatsapp.pairing.registered_reconnect_audit_failed", { accountId, reason: errorMessage(error) }),
    );
    logger.warn("whatsapp.pairing.registered_close_reconnect_scheduled", {
      accountId,
      code,
      attempt: nextAttempt,
      maxAttempts: PAIRING_REGISTERED_RECONNECT_LIMIT,
      reason,
    });
    setTimeout(() => {
      void this.startSession(accountId, "RECONNECT")
        .then(({ initialized: nextInitialized }) => nextInitialized)
        .catch((error) => logger.error("whatsapp.pairing.registered_reconnect_failed", error, { accountId, attempt: nextAttempt }));
    }, Math.min(1_000 * nextAttempt, 5_000));
    return true;
  }

  async requestPairingCode(accountId: string, phoneNumber: string, options: RequestPairingCodeOptions = {}): Promise<{ code: string; expiresAt: Date }> {
    const normalized = normalizeWhatsAppPhoneNumber(phoneNumber);
    if (!options.preserveRetryCounter) {
      pairingTransientRetries.delete(accountId);
      pairingRegisteredReconnects.delete(accountId);
      pairingRetryScheduledAt.delete(accountId);
    }
    logger.info("whatsapp.pairing.requested", { accountId, phoneNumber: maskPhoneNumber(normalized) });
    logger.info("whatsapp.pairing.request_started", { accountId, phoneNumber: maskPhoneNumber(normalized) });
    logger.info("WA_PAIRING_START", { accountId, phoneNumber: maskPhoneNumber(normalized), source: "worker" });
    await this.clearTemporaryAuth(accountId);
    sessionModes.set(accountId, "PAIR_PHONE");
    await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: { status: "PENDING_PAIRING", phoneNumber: normalized, qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null },
    });

    try {
      let session = await this.startSession(accountId, "PAIR_PHONE");
      if (session.registered) throw new Error("Pairing requires a clean unregistered auth state.");

      const waitForPairingBootstrap = async (attempt: number) => {
        const readiness = session.initialized
          .then(() => true)
          .catch((error) => {
            logger.warn("whatsapp.pairing.initialization_deferred_failed", {
              accountId,
              attempt,
              reason: errorMessage(error),
            });
            return "failed" as const;
          });
        const ready = await Promise.race([readiness, sleep(PAIRING_SOCKET_BOOTSTRAP_MS).then(() => false)]);
        if (ready === "failed") {
          if (this.hasRecentPairingRetryScheduled(accountId)) throw new Error(PAIRING_RETRY_SCHEDULED_ERROR);
          throw new Error("WhatsApp socket closed before pairing code request.");
        }
        if (!ready) logger.warn("whatsapp.pairing.socket_bootstrap_wait_timeout", { accountId, attempt });
      };

      const requestFromActiveSocket = async (attempt: number) => {
        await waitForPairingBootstrap(attempt);
        const activeSocket = sockets.get(accountId) ?? session.socket;
        if (activeSocket !== session.socket) logger.info("whatsapp.pairing.socket_replaced", { accountId, attempt });
        logger.info("whatsapp.pairing.provider_request", {
          accountId,
          attempt,
          phoneNumber: maskPhoneNumber(normalized),
          browser: WHATSAPP_BROWSER,
          countryCode: WHATSAPP_PAIRING_COUNTRY_CODE,
          companionPlatformId: WHATSAPP_COMPANION_PLATFORM_ID,
          companionPlatformDisplay: WHATSAPP_COMPANION_PLATFORM_DISPLAY,
        });
        return activeSocket.requestPairingCode(normalized);
      };

      let code: string;
      try {
        code = await requestFromActiveSocket(1);
      } catch (requestError) {
        logger.warn("whatsapp.pairing.provider_request_retry", {
          accountId,
          reason: errorMessage(requestError),
        });
        if (this.hasRecentPairingRetryScheduled(accountId)) throw requestError;
        await this.clearTemporaryAuth(accountId);
        await prisma.whatsAppAccount.updateMany({
          where: { id: accountId, archivedAt: null },
          data: {
            status: "PENDING_PAIRING",
            phoneNumber: normalized,
            qrCode: null,
            qrExpiresAt: null,
            pairingCode: null,
            pairingCodeExpiresAt: null,
            lastError: null,
          },
        });
        session = await this.startSession(accountId, "PAIR_PHONE");
        if (session.registered) throw new Error("Pairing requires a clean unregistered auth state.");
        code = await requestFromActiveSocket(2);
      }
      const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
      await prisma.whatsAppAccount.update({
        where: { id: accountId },
        data: { status: "PAIRING_CODE_READY", phoneNumber: normalized, pairingCode: code, pairingCodeExpiresAt: expiresAt, lastError: null },
      });
      pairingRetryScheduledAt.delete(accountId);
      const pairingMetadata = {
        phoneNumber: maskPhoneNumber(normalized),
        expiresAt: expiresAt.toISOString(),
        qrRefTimeoutMs: PHONE_PAIRING_QR_REF_TIMEOUT_MS,
        browser: WHATSAPP_BROWSER,
        countryCode: WHATSAPP_PAIRING_COUNTRY_CODE,
        companionPlatformId: WHATSAPP_COMPANION_PLATFORM_ID,
        companionPlatformDisplay: WHATSAPP_COMPANION_PLATFORM_DISPLAY,
      };
      logger.info("whatsapp.pairing.ready", { accountId, ...pairingMetadata });
      logger.info("whatsapp.pairing.code_generated", { accountId, ...pairingMetadata });
      logger.info("WA_PAIRING_CODE_GENERATED", { accountId, ...pairingMetadata });
      await auditAccount(accountId, "whatsapp.pairing.code_generated", pairingMetadata);
      return { code, expiresAt };
    } catch (error) {
      if (!isLoggedOutError(error) && await this.schedulePairingCodeRequestRetry(accountId, normalized, errorMessage(error))) {
        logger.warn("whatsapp.pairing.retry_scheduled_after_request_failure", { accountId, phoneNumber: maskPhoneNumber(normalized), reason: errorMessage(error) });
        throw new Error(PAIRING_RETRY_SCHEDULED_ERROR);
      }
      logger.error("whatsapp.connection.failed", error, { accountId, mode: "PAIR_PHONE", phoneNumber: maskPhoneNumber(normalized), reason: errorMessage(error) });
      logger.error("whatsapp.pairing.failed", error, { accountId, phoneNumber: maskPhoneNumber(normalized) });
      await this.clearTemporaryAuth(accountId);
      const message = pairingUserMessage(error);
      await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "FAILED", pairingCode: null, pairingCodeExpiresAt: null, lastError: message } });
      await auditAccount(accountId, "whatsapp.pairing.failed", { reason: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async refreshPairingCode(accountId: string, phoneNumber: string): Promise<{ code: string; expiresAt: Date }> {
    const normalized = normalizeWhatsAppPhoneNumber(phoneNumber);
    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { archivedAt: true, phoneNumber: true, pairingCode: true, pairingCodeExpiresAt: true },
    });
    if (
      !account ||
      account.archivedAt ||
      account.phoneNumber !== normalized ||
      !account.pairingCode ||
      !account.pairingCodeExpiresAt ||
      account.pairingCodeExpiresAt.getTime() - Date.now() <= PAIRING_CODE_REFRESH_MIN_TTL_MS
    ) {
      logger.warn("whatsapp.pairing.refresh_fallback_new_code", { accountId, phoneNumber: maskPhoneNumber(normalized), reason: "missing_or_expiring_code" });
      return this.requestPairingCode(accountId, normalized, { preserveRetryCounter: true });
    }

    try {
      await this.refreshPairingCodeSocket(accountId, normalized, account.pairingCode, account.pairingCodeExpiresAt, 0);
      return { code: account.pairingCode, expiresAt: account.pairingCodeExpiresAt };
    } catch (error) {
      logger.warn("whatsapp.pairing.refresh_fallback_new_code", { accountId, phoneNumber: maskPhoneNumber(normalized), reason: errorMessage(error) });
      await auditAccount(accountId, "whatsapp.pairing.refresh_fallback_new_code", { reason: errorMessage(error) }).catch((auditError) =>
        logger.warn("whatsapp.pairing.refresh_fallback_audit_failed", { accountId, reason: errorMessage(auditError) }),
      );
      return this.requestPairingCode(accountId, normalized, { preserveRetryCounter: true });
    }
  }

  async requestQrCode(accountId: string) {
    const existing = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
    if (existing?.qrCode && existing.qrExpiresAt && existing.qrExpiresAt > new Date()) {
      return { qr: existing.qrCode, expiresAt: existing.qrExpiresAt };
    }
    await this.createFreshQrSession(accountId);
    for (let i = 0; i < 20; i += 1) {
      const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
      if (account?.qrCode && account.qrExpiresAt && account.qrExpiresAt > new Date()) return { qr: account.qrCode, expiresAt: account.qrExpiresAt };
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("QR_GENERATION_TIMEOUT");
  }

  async getStatus(accountId: string) {
    return (await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId } })).status;
  }

  private async startSession(accountId: string, mode: SessionMode) {
    sessionModes.set(accountId, mode);
    await ensureWhatsAppSessionRoot();
    await restoreWhatsAppSessionFromDatabase(accountId);
    const directory = whatsappSessionDirectory(accountId);
    // Baileys uses this name for its auth-state factory; it is not a React hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { state, saveCreds } = await useMultiFileAuthState(directory);
    const versionInfo = await fetchCurrentWhatsAppWebVersion();
    const { version } = versionInfo;
    if (!state.creds.registered && mode !== "PAIR_QR" && mode !== "PAIR_PHONE") {
      logger.warn("whatsapp.restore.credentials_missing", { accountId, mode });
      await this.handleMissingCredentials(accountId, `start_session_missing_credentials:${mode}`);
    }
    const preservePairingCode = mode === "PAIR_PHONE" && !state.creds.registered && await this.hasActivePairingCode(accountId);
    const activated = await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: { status: state.creds.registered ? "CONNECTING" : preservePairingCode ? "PAIRING_CODE_READY" : mode === "PAIR_PHONE" ? "PENDING_PAIRING" : "PENDING_QR", lastError: null },
    });
    if (!activated.count) {
      throw new Error("WhatsApp account no longer exists");
    }

    logger.info("whatsapp.baileys.start", {
      accountId,
      mode,
      registered: state.creds.registered,
      sessionDirectory: directory,
      qrTimeoutMs: mode === "PAIR_PHONE" ? PHONE_PAIRING_QR_REF_TIMEOUT_MS : undefined,
      browser: WHATSAPP_BROWSER,
      countryCode: WHATSAPP_PAIRING_COUNTRY_CODE,
      companionPlatformId: WHATSAPP_COMPANION_PLATFORM_ID,
      companionPlatformDisplay: WHATSAPP_COMPANION_PLATFORM_DISPLAY,
      waVersion: version,
      waVersionSource: versionInfo.source,
      waVersionIsLatest: versionInfo.isLatest,
      waVersionFallbackReason: versionInfo.fallbackReason,
    });
    logger.info("whatsapp.session.starting", {
      accountId,
      mode,
      registered: state.creds.registered,
      qrTimeoutMs: mode === "PAIR_PHONE" ? PHONE_PAIRING_QR_REF_TIMEOUT_MS : undefined,
      browser: WHATSAPP_BROWSER,
      countryCode: WHATSAPP_PAIRING_COUNTRY_CODE,
      companionPlatformId: WHATSAPP_COMPANION_PLATFORM_ID,
      companionPlatformDisplay: WHATSAPP_COMPANION_PLATFORM_DISPLAY,
      waVersion: version,
      waVersionSource: versionInfo.source,
      waVersionIsLatest: versionInfo.isLatest,
      waVersionFallbackReason: versionInfo.fallbackReason,
    });
    const socket = makeWASocket({
      auth: state,
      version,
      browser: WHATSAPP_BROWSER,
      countryCode: WHATSAPP_PAIRING_COUNTRY_CODE,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      ...(mode === "PAIR_PHONE" ? { qrTimeout: PHONE_PAIRING_QR_REF_TIMEOUT_MS } : {}),
    });
    sockets.set(accountId, socket);

    let initializedSettled = false;
    let initializationTimeout: ReturnType<typeof setTimeout> | undefined;
    let settleInitialized: (error?: unknown) => void = () => undefined;
    const initialized = new Promise<void>((resolve, reject) => {
      settleInitialized = (error?: unknown) => {
        if (initializedSettled) return;
        initializedSettled = true;
        if (initializationTimeout) clearTimeout(initializationTimeout);
        if (error) reject(error);
        else resolve();
      };
      initializationTimeout = setTimeout(() => settleInitialized(new Error("WhatsApp socket initialization timed out.")), SOCKET_INITIALIZATION_TIMEOUT_MS);
    });

    socket.ev.on("creds.update", async () => {
      await saveCreds();
      const activeMode = sessionModes.get(accountId) || mode;
      logger.info("WA_PAIRING_CREDS_RECEIVED", {
        accountId,
        mode: activeMode,
        registered: state.creds.registered,
      });
      if (activeMode === "PAIR_PHONE" || activeMode === "PAIR_QR") {
        await auditAccount(accountId, "whatsapp.pairing.creds_update", { mode: activeMode, registered: state.creds.registered }).catch((error) =>
          logger.warn("whatsapp.pairing.creds_update_audit_failed", { accountId, reason: errorMessage(error) }),
        );
      }
      await backupWhatsAppSessionToDatabase(accountId, "creds.update").catch((error) => logger.error("whatsapp.session.backup_failed", error, { accountId }));
    });
    socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      try {
        const currentMode = sessionModes.get(accountId) || mode;
        if (currentMode === "PAIR_PHONE" || currentMode === "PAIR_QR") {
          logger.info("WA_PAIRING_CONNECTION_UPDATE", {
            accountId,
            mode: currentMode,
            connection: connection ?? null,
            hasQr: Boolean(qr),
            code: disconnectCode(lastDisconnect?.error) ?? null,
            registered: state.creds.registered,
          });
        }
        if (qr && currentMode === "PAIR_QR") {
          logger.info("whatsapp.qr.received", { accountId });
          const qrCode = await QRCode.toDataURL(qr, { width: 360, margin: 2 });
          const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId }, select: { id: true, archivedAt: true } });
          if (!account || account.archivedAt) {
            await this.stopSocket(accountId, "WhatsApp account no longer exists");
            settleInitialized(new Error("WhatsApp account no longer exists"));
            return;
          }
          const expiresAt = new Date(Date.now() + 60_000);
          await prisma.whatsAppSession.upsert({
            where: { id: accountId },
            update: { qrCode, status: "QR_READY", expiresAt },
            create: { id: accountId, accountId, qrCode, status: "QR_READY", expiresAt },
          });
          await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "QR_READY", qrCode, qrExpiresAt: expiresAt, lastError: null } });
          qrTransientRetries.delete(accountId);
          logger.info("whatsapp.qr.saved", { accountId, expiresAt: expiresAt.toISOString() });
          await auditAccount(accountId, "whatsapp.qr.generated", { expiresAt: expiresAt.toISOString() });
          settleInitialized();
        } else if (qr) {
          logger.warn("whatsapp.qr.ignored_for_restore", { accountId, mode: currentMode });
        }
        if (connection === "connecting") {
          await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null, status: { in: ["PENDING_PAIRING", "PENDING_QR"] } }, data: { status: "CONNECTING" } });
        }
        if (connection === "open") {
          pairingTransientRetries.delete(accountId);
          pairingRegisteredReconnects.delete(accountId);
          const phoneNumber = socket.user?.id?.split(":")[0] || socket.user?.id?.split("@")[0];
          const deviceId = socket.user?.id ?? null;
          const updated = await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "CONNECTED", phoneNumber, displayName: socket.user?.name, deviceId, lastConnectedAt: new Date(), lastHeartbeatAt: new Date(), lastPongAt: new Date(), reconnectRetryCount: 0, recoveryLevel: 0, healthScore: 95, qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null } });
          if (!updated.count) return;
          await prisma.whatsAppSession.updateMany({ where: { accountId }, data: { status: "CONNECTED", qrCode: null, expiresAt: null } });
          await backupWhatsAppSessionToDatabase(accountId, "connection.open").catch((error) => logger.error("whatsapp.session.backup_failed", error, { accountId }));
          this.startHeartbeat(accountId, socket);
          logger.info("SESSION_CREATED", { accountId, mode: currentMode });
          logger.info("whatsapp.connected", { accountId, mode: currentMode, phoneNumber: maskPhoneNumber(phoneNumber) });
          logger.info("whatsapp.connection.open", { accountId, mode: currentMode, phoneNumber: maskPhoneNumber(phoneNumber) });
          logger.info("WA_ACCOUNT_CONNECTED", { accountId, mode: currentMode, phoneNumber: maskPhoneNumber(phoneNumber) });
          await auditAccount(accountId, "whatsapp.connected", { phoneNumber: maskPhoneNumber(phoneNumber), mode: currentMode });
          settleInitialized();
          await this.syncGroups(accountId);
        }
        if (connection === "close") {
          this.stopHeartbeat(accountId);
          const code = disconnectCode(lastDisconnect?.error);
          const loggedOut = code === DisconnectReason.loggedOut;
          const intentional = intentionallyStoppedSockets.has(socket);
          const replacedByNewSocket = Boolean(sockets.get(accountId) && sockets.get(accountId) !== socket);
          const closeError = lastDisconnect?.error instanceof Error ? lastDisconnect.error : new Error("WhatsApp socket closed before initialization.");
          if (sockets.get(accountId) === socket) sockets.delete(accountId);
          logger.warn("whatsapp.connection.closed", { accountId, code, loggedOut, intentional, mode: currentMode });
          if (intentional) return;
          if (currentMode === "PAIR_QR") {
            if (replacedByNewSocket) return;
            const pendingQr = await prisma.whatsAppAccount.findUnique({
              where: { id: accountId },
              select: { qrCode: true, qrExpiresAt: true },
            });
            if (pendingQr?.qrCode && pendingQr.qrExpiresAt && pendingQr.qrExpiresAt > new Date()) {
              await prisma.whatsAppAccount.updateMany({
                where: { id: accountId, archivedAt: null },
                data: { status: "QR_READY", lastError: null },
              });
              if (!initializedSettled) settleInitialized();
              logger.warn("whatsapp.qr.connection_closed_after_ready", { accountId, code });
              return;
            }
            const attempts = qrTransientRetries.get(accountId) ?? 0;
            if (!loggedOut && attempts < QR_TRANSIENT_RETRY_LIMIT) {
              const nextAttempt = attempts + 1;
              qrTransientRetries.set(accountId, nextAttempt);
              await prisma.whatsAppAccount.updateMany({
                where: { id: accountId, archivedAt: null },
                data: { status: "PENDING_QR", qrCode: null, qrExpiresAt: null, lastError: null, recoveryLevel: Math.max(1, nextAttempt), healthScore: 25 },
              });
              logger.warn("whatsapp.qr.transient_close_retry_scheduled", { accountId, code, attempt: nextAttempt, maxAttempts: QR_TRANSIENT_RETRY_LIMIT });
              await auditAccount(accountId, "whatsapp.qr.retry_scheduled", { code, attempt: nextAttempt }).catch((error) =>
                logger.warn("whatsapp.qr.retry_audit_failed", { accountId, reason: errorMessage(error) }),
              );
              setTimeout(() => {
                void this.startSession(accountId, "PAIR_QR")
                  .then(({ initialized: nextInitialized }) => nextInitialized)
                  .catch((error) => logger.error("whatsapp.qr.retry_failed", error, { accountId, attempt: nextAttempt }));
              }, Math.min(1_000 * nextAttempt, 5_000));
              if (!initializedSettled) settleInitialized();
              return;
            }
            qrTransientRetries.delete(accountId);
            await clearWhatsAppSession(accountId);
            await prisma.whatsAppAccount.updateMany({
              where: { id: accountId, archivedAt: null },
              data: { status: "FAILED", qrCode: null, qrExpiresAt: null, lastError: "WHATSAPP_QR_FAILED", recoveryLevel: 4, healthScore: 0 },
            });
            await auditAccount(accountId, "whatsapp.qr.failed", { code });
            if (!initializedSettled) settleInitialized(closeError);
            return;
          }
          if (currentMode !== "PAIR_PHONE" && !initializedSettled) settleInitialized(closeError);
          if (currentMode === "PAIR_PHONE") {
            if (replacedByNewSocket) {
              logger.warn("whatsapp.pairing.stale_socket_close_ignored", { accountId, code });
              return;
            }
            if (code === DisconnectReason.restartRequired) {
              await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "CONNECTING", pairingCode: null, pairingCodeExpiresAt: null, lastError: null } });
              setTimeout(() => {
                void this.startSession(accountId, "PAIR_PHONE")
                  .then(({ initialized: nextInitialized }) => nextInitialized)
                  .catch((error) => logger.error("whatsapp.pairing.restart_failed", error, { accountId }));
              }, 1_000);
              return;
            }
            const reason = lastDisconnect?.error instanceof Error ? lastDisconnect.error.message : "WhatsApp pairing connection closed";
            if (state.creds.registered && await this.recoverRegisteredPairingClose(accountId, reason, code)) {
              logger.warn("WA_PAIRING_REGISTERED_CLOSE_RECOVERABLE", { accountId, mode: currentMode, reason, code });
              return;
            }
            if (!state.creds.registered && await this.refreshPairingCodeAfterSocketClose(accountId, reason, code)) {
              logger.warn("WA_PAIRING_FAILED_RECOVERABLE", { accountId, mode: currentMode, reason, code });
              if (!initializedSettled) settleInitialized();
              return;
            }
            if (!state.creds.registered && await this.schedulePairingCodeRequestRetry(accountId, null, reason, code)) {
              logger.warn("WA_PAIRING_RETRY_SCHEDULED_RECOVERABLE", { accountId, mode: currentMode, reason, code });
              if (!initializedSettled) settleInitialized();
              return;
            }
            logger.error("whatsapp.pairing.connection_closed", lastDisconnect?.error, { accountId, code });
            await clearWhatsAppSession(accountId);
            await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "FAILED", pairingCode: null, pairingCodeExpiresAt: null, lastError: pairingUserMessage(lastDisconnect?.error) } });
            await auditAccount(accountId, "whatsapp.pairing.failed", { reason, code });
            logger.error("WA_PAIRING_FAILED_AUTH", lastDisconnect?.error, { accountId, mode: currentMode, reason, code });
            if (!initializedSettled) settleInitialized(closeError);
            return;
          }
          if (loggedOut) {
            await clearWhatsAppSession(accountId);
            const updated = await prisma.whatsAppAccount.updateMany({
              where: { id: accountId, archivedAt: null },
              data: { status: "RECONNECT_REQUIRED", lastDisconnectedAt: new Date(), lastError: "WHATSAPP_LOGGED_OUT", recoveryLevel: 5, healthScore: 0 },
            });
            await auditAccount(accountId, "whatsapp.logged_out", { code, loggedOut, mode: currentMode, recoverable: false });
            if (!updated.count) logger.warn("whatsapp.logged_out.account_missing", { accountId, code, mode: currentMode });
          } else {
            await this.markTransientConnectionLoss(accountId, `connection_close:${code ?? "unknown"}`, state.creds.registered ? 1 : 2);
            await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { lastDisconnectedAt: new Date() } });
            await auditAccount(accountId, "whatsapp.disconnected", { code, loggedOut, mode: currentMode, recoverable: true });
            this.scheduleReconnect(accountId, `connection_close:${code ?? "unknown"}`);
          }
        }
      } catch (error) {
        if (sockets.get(accountId) === socket) sockets.delete(accountId);
        const modeAtFailure = sessionModes.get(accountId) || mode;
          const restorable = await hasRestorableWhatsAppCredentials(accountId).catch(() => false);
          if (modeAtFailure === "PAIR_QR") {
            const pendingQr = await prisma.whatsAppAccount.findUnique({
              where: { id: accountId },
              select: { qrCode: true, qrExpiresAt: true },
            });
            if (pendingQr?.qrCode && pendingQr.qrExpiresAt && pendingQr.qrExpiresAt > new Date()) {
              await prisma.whatsAppAccount.updateMany({
                where: { id: accountId, archivedAt: null },
                data: { status: "QR_READY", lastError: null },
              });
              logger.warn("whatsapp.qr.error_after_ready_ignored", { accountId, mode: modeAtFailure, reason: errorMessage(error) });
              if (!initializedSettled) settleInitialized();
              return;
            }
          }
          if (modeAtFailure === "PAIR_PHONE" && state.creds.registered && await this.recoverRegisteredPairingClose(accountId, errorMessage(error))) {
            logger.warn("whatsapp.pairing.registered_error_reconnect", { accountId, mode: modeAtFailure, reason: errorMessage(error) });
            logger.warn("WA_PAIRING_REGISTERED_CLOSE_RECOVERABLE", { accountId, mode: modeAtFailure, reason: errorMessage(error) });
            if (!initializedSettled) settleInitialized();
            return;
          }
          if (modeAtFailure === "PAIR_PHONE" && await this.refreshPairingCodeAfterSocketClose(accountId, errorMessage(error))) {
            logger.warn("whatsapp.pairing.error_after_code_ignored", { accountId, mode: modeAtFailure, reason: errorMessage(error) });
            logger.warn("WA_PAIRING_FAILED_RECOVERABLE", { accountId, mode: modeAtFailure, reason: errorMessage(error) });
            if (!initializedSettled) settleInitialized();
            return;
          }
          if (modeAtFailure === "PAIR_PHONE" && !isLoggedOutError(error) && await this.schedulePairingCodeRequestRetry(accountId, null, errorMessage(error))) {
            logger.warn("whatsapp.pairing.error_retry_scheduled", { accountId, mode: modeAtFailure, reason: errorMessage(error) });
            logger.warn("WA_PAIRING_RETRY_SCHEDULED_RECOVERABLE", { accountId, mode: modeAtFailure, reason: errorMessage(error) });
            if (!initializedSettled) settleInitialized();
            return;
          }
          if (modeAtFailure === "PAIR_QR" || modeAtFailure === "PAIR_PHONE") {
            await prisma.whatsAppAccount.updateMany({
              where: { id: accountId, archivedAt: null, status: { in: ["PENDING_QR", "QR_READY", "PENDING_PAIRING", "PAIRING_CODE_READY", "CONNECTING"] } },
              data: {
                status: "FAILED",
                lastError: modeAtFailure === "PAIR_PHONE" ? pairingUserMessage(error) : restorable ? "WHATSAPP_TRANSIENT_DISCONNECT" : "WHATSAPP_QR_FAILED",
              },
            });
          } else if (isLoggedOutError(error)) {
            await clearWhatsAppSession(accountId);
            await prisma.whatsAppAccount.updateMany({
              where: { id: accountId, archivedAt: null },
              data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_LOGGED_OUT", recoveryLevel: 5, healthScore: 0 },
            });
          } else {
            await this.markTransientConnectionLoss(accountId, `connection_update_failed:${errorMessage(error)}`, restorable ? 2 : 3);
            this.scheduleReconnect(accountId, `connection_update_failed:${errorMessage(error)}`);
          }
        logger.error("whatsapp.connection.failed", error, { accountId, mode: modeAtFailure, reason: errorMessage(error) });
        logger.error("whatsapp.connection.update_failed", error, { accountId, mode: modeAtFailure });
        if (modeAtFailure === "PAIR_PHONE" || modeAtFailure === "PAIR_QR") {
          logger.error("WA_PAIRING_FAILED_AUTH", error, { accountId, mode: modeAtFailure, reason: errorMessage(error) });
        }
        if (!initializedSettled) settleInitialized(error);
      }
    });
    return { socket, registered: state.creds.registered, initialized };
  }

  async createSession(accountId: string): Promise<SessionResult> {
    const existingSocket = sockets.get(accountId);
    if (existingSocket?.user) return { sessionId: accountId, qrCode: await this.getQr(accountId) };
    if (existingSocket) await this.stopSocket(accountId, "Replace stale WhatsApp socket");
    const { initialized } = await this.startSession(accountId, "PAIR_QR");
    void initialized.catch((error) => logger.warn("whatsapp.qr.initialization_deferred_failed", { accountId, reason: errorMessage(error) }));
    return { sessionId: accountId, qrCode: null };
  }

  async createFreshQrSession(accountId: string): Promise<SessionResult> {
    qrTransientRetries.delete(accountId);
    await this.clearTemporaryAuth(accountId);
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: {
        status: "PENDING_QR",
        qrCode: null,
        qrExpiresAt: null,
        pairingCode: null,
        pairingCodeExpiresAt: null,
        lastError: null,
      },
    });
    await prisma.whatsAppSession.updateMany({
      where: { accountId },
      data: { status: "PENDING_QR", qrCode: null, expiresAt: null },
    });
    await auditAccount(accountId, "whatsapp.qr.fresh_session_requested");
    return this.createSession(accountId);
  }

  async getQr(accountId: string) {
    return (await prisma.whatsAppSession.findFirst({ where: { accountId }, orderBy: { updatedAt: "desc" } }))?.qrCode ?? null;
  }

  async disconnect(accountId: string) {
    await this.stopSocket(accountId, "Manual disconnect");
    await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: "DISCONNECTED", lastDisconnectedAt: new Date(), lastError: null } });
  }

  async reconnect(accountId: string) {
    if (await isPhonePairingActive(accountId)) {
      logger.warn("whatsapp.reconnect.skipped_active_pairing", { accountId });
      await auditAccount(accountId, "whatsapp.reconnect.skipped_active_pairing");
      return;
    }
    const hasCredentials = await hasRestorableWhatsAppCredentials(accountId);
    if (hasCredentials) {
      await this.stopSocket(accountId, "Recover existing WhatsApp session");
      await restoreWhatsAppSessionFromDatabase(accountId);
      await prisma.whatsAppAccount.updateMany({
        where: { id: accountId, archivedAt: null },
        data: { status: "CONNECTING", qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null, recoveryLevel: 2 },
      });
      await auditAccount(accountId, "whatsapp.session.recovery_requested");
      const { initialized } = await this.startSession(accountId, "RECONNECT");
      await initialized;
      return;
    }
    await this.handleMissingCredentials(accountId, "manual_reconnect_missing_credentials");
  }

  async syncGroups(accountId: string): Promise<GroupResult[]> {
    const startedAt = Date.now();
    logger.info("WA_GROUP_SYNC_START", { accountId });
    const socket = await this.ensureConnectedSocket(accountId);
    const metadata = await socket.groupFetchAllParticipating();
    const groups = Object.values(metadata).map((group) => ({ externalId: group.id, name: group.subject, description: group.desc, participantCount: group.participants.length, canSend: !group.announce }));
    const account = await prisma.whatsAppAccount.findUniqueOrThrow({
      where: { id: accountId },
      include: { company: { select: { ownerId: true } } },
    });
    const ownerUserId = account.userId ?? account.company.ownerId;
    if (!ownerUserId) throw new Error("WHATSAPP_ACCOUNT_OWNER_MISSING");
    if (!account.userId) {
      await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { userId: ownerUserId } });
    }
    const syncedAt = new Date();
    const groupJids = groups.map((group) => group.externalId);
    const mutations = groups.map((group) => prisma.whatsAppGroup.upsert({
      where: { accountId_externalGroupId: { accountId, externalGroupId: group.externalId } },
      update: {
        userId: ownerUserId,
        companyId: account.companyId,
        accountId,
        name: group.name,
        description: group.description,
        participantCount: group.participantCount,
        canSend: group.canSend,
        isArchived: false,
        lastSyncedAt: syncedAt,
      },
      create: {
        userId: ownerUserId,
        companyId: account.companyId,
        accountId,
        externalGroupId: group.externalId,
        name: group.name,
        description: group.description,
        participantCount: group.participantCount,
        canSend: group.canSend,
        lastSyncedAt: syncedAt,
      },
    }));
    const results = await prisma.$transaction([
      prisma.whatsAppGroup.updateMany({
        where: {
          accountId,
          OR: [
            { companyId: { not: account.companyId } },
            { userId: null },
            { userId: { not: ownerUserId } },
          ],
        },
        data: { userId: ownerUserId, companyId: account.companyId },
      }),
      ...mutations,
      prisma.whatsAppGroup.updateMany({
        where: { accountId, externalGroupId: { notIn: groupJids }, isArchived: false },
        data: { userId: ownerUserId, companyId: account.companyId, isArchived: true, lastSyncedAt: syncedAt },
      }),
    ]);
    const ownershipRepaired = results[0];
    const deactivated = results.at(-1);
    await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: {
        lastSyncedAt: syncedAt,
        lastGroupSyncAt: syncedAt,
        healthScore: computeWhatsAppHealthScore({ status: "CONNECTED", lastHeartbeatAt: syncedAt, lastPongAt: syncedAt, lastSyncedAt: syncedAt, groupCount: groups.length, hasSessionSnapshot: true }),
      },
    });
    await backupWhatsAppSessionToDatabase(accountId, "group.sync").catch((error) => logger.error("whatsapp.session.backup_failed", error, { accountId }));
    logger.info("GROUP_SYNC", {
      correlationId: `sync-${accountId}-${syncedAt.getTime()}`,
      userId: ownerUserId,
      companyId: account.companyId,
      whatsappAccountId: accountId,
      phoneNumber: account.phoneNumber ?? undefined,
      groupsFetchedCount: groups.length,
      groupsUpsertedCount: groups.length,
      groupsOwnershipRepairedCount: typeof ownershipRepaired === "object" && ownershipRepaired && "count" in ownershipRepaired ? ownershipRepaired.count : 0,
      groupsDeactivatedCount: typeof deactivated === "object" && deactivated && "count" in deactivated ? deactivated.count : 0,
      duration: Date.now() - startedAt,
      source: "baileys-provider",
    });
    logger.info("WA_GROUP_SYNC_SUCCESS", { accountId, count: groups.length, durationMs: Date.now() - startedAt });
    await auditAccount(accountId, "whatsapp.groups.synced", { count: groups.length });
    return groups;
  }

  async sendGroupMessage(input: SendGroupMessageInput): Promise<SendResult> {
    const account = await prisma.whatsAppAccount.findUnique({ where: { id: input.accountId } });
    if (!account || account.archivedAt) throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");
    if (!input.groupExternalId) throw new Error("Missing external group ID.");
    if (account.lastError === "WHATSAPP_LOGGED_OUT") {
      await prisma.whatsAppAccount.updateMany({
        where: { id: input.accountId, archivedAt: null },
        data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_LOGGED_OUT", recoveryLevel: 5, healthScore: 0 },
      });
      throw new Error("WHATSAPP_RECONNECT_REQUIRED");
    }
    if (account.lastError === "WHATSAPP_CREDENTIALS_MISSING") {
      const hasLiveSocket = Boolean(sockets.get(input.accountId)?.user);
      const hasCredentials = hasLiveSocket || await hasRestorableWhatsAppCredentials(input.accountId);
      if (!hasCredentials) await this.handleMissingCredentials(input.accountId, "message_send_missing_credentials");
      await prisma.whatsAppAccount.updateMany({
        where: { id: input.accountId, archivedAt: null },
        data: { status: "CONNECTING", lastError: null, recoveryLevel: 2, healthScore: 65 },
      });
    }
    if (!sockets.get(input.accountId)?.user) await restoreWhatsAppSessionFromDatabase(input.accountId);
    if (["RECONNECT_REQUIRED", "DISCONNECTED", "FAILED", "ERROR"].includes(account.status)) {
      await prisma.whatsAppAccount.updateMany({ where: { id: input.accountId, archivedAt: null }, data: { status: "CONNECTING", lastError: null, recoveryLevel: 2 } });
    }
    const socket = await this.ensureConnectedSocket(input.accountId);
    const logContext = {
      accountId: input.accountId,
      groupExternalId: input.groupExternalId,
      correlationId: input.correlationId,
      campaignId: input.campaignId,
      recipientId: input.recipientId,
    };
    logger.info("message.baileys.send.attempt", logContext);
    let result: Awaited<ReturnType<typeof socket.sendMessage>>;
    try {
      result = await socket.sendMessage(input.groupExternalId, { text: input.content });
    } catch (error) {
      logger.error("message.baileys.send.failed", error, logContext);
      if (isLoggedOutError(error)) {
        await clearWhatsAppSession(input.accountId);
        await prisma.whatsAppAccount.updateMany({
          where: { id: input.accountId, archivedAt: null },
          data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_LOGGED_OUT", recoveryLevel: 5, healthScore: 0 },
        });
        throw new Error("WHATSAPP_LOGGED_OUT");
      }
      await this.markTransientConnectionLoss(input.accountId, `message_send_failed:${errorMessage(error)}`);
      this.scheduleReconnect(input.accountId, `message_send_failed:${errorMessage(error)}`);
      throw new Error("WHATSAPP_RECONNECT_REQUIRED");
    }
    if (!result?.key.id) {
      const error = new Error("WhatsApp did not return a message id");
      logger.error("message.baileys.send.failed", error, logContext);
      throw error;
    }
    await prisma.whatsAppAccount.updateMany({
      where: { id: input.accountId, archivedAt: null },
      data: { status: "CONNECTED", lastError: null, lastMessageAt: new Date(), lastPongAt: new Date(), healthScore: 95, recoveryLevel: 0 },
    });
    await backupWhatsAppSessionToDatabase(input.accountId, "message.sent").catch((error) => logger.error("whatsapp.session.backup_failed", error, { accountId: input.accountId }));
    logger.info("MESSAGE_SENT", { ...logContext, externalMessageId: result.key.id });
    logger.info("message.baileys.send.succeeded", { ...logContext, externalMessageId: result.key.id });
    return { externalMessageId: result.key.id, messageKey: result.key };
  }

  async deleteGroupMessage(input: DeleteGroupMessageInput): Promise<DeleteResult> {
    const account = await prisma.whatsAppAccount.findUnique({ where: { id: input.accountId } });
    if (!account || account.archivedAt) throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");
    if (!input.groupExternalId) throw new Error("Missing external group ID.");
    if (!input.messageKey?.id) throw new Error("WHATSAPP_MESSAGE_KEY_MISSING");
    if (account.lastError === "WHATSAPP_LOGGED_OUT") {
      await prisma.whatsAppAccount.updateMany({
        where: { id: input.accountId, archivedAt: null },
        data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_LOGGED_OUT", recoveryLevel: 5, healthScore: 0 },
      });
      throw new Error("WHATSAPP_RECONNECT_REQUIRED");
    }
    if (account.lastError === "WHATSAPP_CREDENTIALS_MISSING") {
      const hasLiveSocket = Boolean(sockets.get(input.accountId)?.user);
      const hasCredentials = hasLiveSocket || await hasRestorableWhatsAppCredentials(input.accountId);
      if (!hasCredentials) await this.handleMissingCredentials(input.accountId, "message_delete_missing_credentials");
      await prisma.whatsAppAccount.updateMany({
        where: { id: input.accountId, archivedAt: null },
        data: { status: "CONNECTING", lastError: null, recoveryLevel: 2, healthScore: 65 },
      });
    }
    if (!sockets.get(input.accountId)?.user) await restoreWhatsAppSessionFromDatabase(input.accountId);
    if (["RECONNECT_REQUIRED", "DISCONNECTED", "FAILED", "ERROR"].includes(account.status)) {
      await prisma.whatsAppAccount.updateMany({ where: { id: input.accountId, archivedAt: null }, data: { status: "CONNECTING", lastError: null, recoveryLevel: 2 } });
    }
    const socket = await this.ensureConnectedSocket(input.accountId);
    const deleteKey: WAMessageKey = {
      ...input.messageKey,
      id: input.messageKey.id,
      remoteJid: input.messageKey.remoteJid ?? input.groupExternalId,
      fromMe: input.messageKey.fromMe ?? true,
    };
    const logContext = {
      accountId: input.accountId,
      groupExternalId: input.groupExternalId,
      externalMessageId: deleteKey.id,
      correlationId: input.correlationId,
      campaignId: input.campaignId,
      recipientId: input.recipientId,
    };
    logger.info("message.baileys.delete.attempt", logContext);
    try {
      const result = await socket.sendMessage(input.groupExternalId, { delete: deleteKey });
      await prisma.whatsAppAccount.updateMany({
        where: { id: input.accountId, archivedAt: null },
        data: { status: "CONNECTED", lastError: null, lastPongAt: new Date(), healthScore: 95, recoveryLevel: 0 },
      });
      await backupWhatsAppSessionToDatabase(input.accountId, "message.deleted").catch((error) => logger.error("whatsapp.session.backup_failed", error, { accountId: input.accountId }));
      logger.info("message.baileys.delete.succeeded", { ...logContext, deleteMessageId: result?.key?.id });
      return { ok: true, externalMessageId: result?.key?.id ?? null };
    } catch (error) {
      logger.error("message.baileys.delete.failed", error, logContext);
      if (isLoggedOutError(error)) {
        await clearWhatsAppSession(input.accountId);
        await prisma.whatsAppAccount.updateMany({
          where: { id: input.accountId, archivedAt: null },
          data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_LOGGED_OUT", recoveryLevel: 5, healthScore: 0 },
        });
        throw new Error("WHATSAPP_LOGGED_OUT");
      }
      await this.markTransientConnectionLoss(input.accountId, `message_delete_failed:${errorMessage(error)}`);
      this.scheduleReconnect(input.accountId, `message_delete_failed:${errorMessage(error)}`);
      throw new Error("WHATSAPP_RECONNECT_REQUIRED");
    }
  }
}
