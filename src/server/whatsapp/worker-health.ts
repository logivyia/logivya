export const WORKER_UNREACHABLE_MESSAGE = "WhatsApp worker is not reachable.";
export const WHATSAPP_QR_WAIT_TIMEOUT = "WHATSAPP_QR_WAIT_TIMEOUT";
export const WHATSAPP_PAIRING_WAIT_TIMEOUT = "WHATSAPP_PAIRING_WAIT_TIMEOUT";
import { isWorkerHeartbeatFresh, readWorkerHeartbeat } from "@/server/whatsapp/worker-heartbeat";
import { logger } from "@/server/observability/logger";
import { canExposePhonePairingCode } from "@/server/whatsapp/pairing-code-state";

const PAIRING_CODE_STABILITY_MS = Number(process.env.WHATSAPP_PAIRING_CODE_STABILITY_MS || 3_500);
const PAIRING_CODE_MIN_TTL_MS = Number(process.env.WHATSAPP_PAIRING_CODE_MIN_TTL_MS || 120_000);
const QR_CODE_STABILITY_MS = Number(process.env.WHATSAPP_QR_CODE_STABILITY_MS || 750);

function isRedisQuotaOrTransientHeartbeatError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("max requests limit exceeded") ||
    message.includes("ERR max requests limit exceeded") ||
    message.includes("Command timed out") ||
    message.includes("Connection is closed")
  );
}

function requiresRemoteWorkerUrl() {
  return process.env.VERCEL === "1" || process.env.VERCEL_ENV === "production";
}

export async function assertWhatsAppWorkerReachable() {
  const url = process.env.WHATSAPP_WORKER_URL || process.env.WORKER_HEALTH_URL;
  if (url) {
    const response = await fetch(url, {
      cache: "no-store",
      headers: process.env.WHATSAPP_SESSION_SECRET ? { authorization: `Bearer ${process.env.WHATSAPP_SESSION_SECRET}` } : undefined,
      signal: AbortSignal.timeout(3_000),
    }).catch((error) => {
      logger.warn("whatsapp.worker.remote_health_failed", {
        reason: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    if (response?.ok) return;
    if (response) {
      logger.warn("whatsapp.worker.remote_health_unhealthy", { status: response.status });
    }
  }
  const heartbeat = await readWorkerHeartbeat().catch((error) => {
    if (isRedisQuotaOrTransientHeartbeatError(error)) {
      logger.warn("whatsapp.worker.heartbeat_check_degraded", {
        reason: error instanceof Error ? error.message : String(error),
      });
      return "redis-degraded" as const;
    }
    logger.warn("whatsapp.worker.heartbeat_check_failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  if (heartbeat === "redis-degraded") throw new Error("REDIS_MAX_REQUESTS_EXCEEDED");
  if (isWorkerHeartbeatFresh(heartbeat)) {
    if (!url && requiresRemoteWorkerUrl()) {
      logger.warn("whatsapp.worker.remote_url_missing_heartbeat_ok", {
        env: process.env.VERCEL_ENV || "unknown",
      });
    }
    return;
  }
  if (!url && requiresRemoteWorkerUrl()) throw new Error("WHATSAPP_WORKER_URL_REQUIRED");
  throw new Error(WORKER_UNREACHABLE_MESSAGE);
}

export async function waitForAccountQr(accountId: string, options: { updatedAfter?: Date; correlationId?: string } = {}) {
  const { prisma } = await import("@/server/db");
  const attempts = Number(process.env.WHATSAPP_QR_WAIT_ATTEMPTS || 60);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new Error("NOT_FOUND");
    const generatedForRequest = !options.correlationId || Boolean(await prisma.auditLog.findFirst({
      where: {
        entityType: "WhatsAppAccount",
        entityId: accountId,
        action: "WHATSAPP_QR_GENERATED",
        correlationId: options.correlationId,
        ...(options.updatedAfter ? { createdAt: { gt: options.updatedAfter } } : {}),
      },
      select: { id: true },
    }));
    const accountIsCurrent = !options.updatedAfter || account.updatedAt > options.updatedAfter;
    if (generatedForRequest && accountIsCurrent && account.qrCode && account.qrExpiresAt && account.qrExpiresAt > new Date()) {
      if (QR_CODE_STABILITY_MS <= 0) return account;
      const firstQr = account.qrCode;
      const firstUpdatedAt = account.updatedAt.getTime();
      await new Promise((resolve) => setTimeout(resolve, QR_CODE_STABILITY_MS));
      const stableAccount = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
      if (
        stableAccount?.qrCode === firstQr &&
        stableAccount.updatedAt.getTime() === firstUpdatedAt &&
        (!options.updatedAfter || stableAccount.updatedAt > options.updatedAfter) &&
        stableAccount.qrExpiresAt &&
        stableAccount.qrExpiresAt > new Date()
      ) {
        return stableAccount;
      }
      continue;
    }
    const session = await prisma.whatsAppSession.findUnique({ where: { accountId } });
    const sessionIsCurrent = !options.updatedAfter || Boolean(session && session.updatedAt > options.updatedAfter);
    if (generatedForRequest && sessionIsCurrent && session?.qrCode && session.expiresAt && session.expiresAt > new Date()) {
      if (QR_CODE_STABILITY_MS > 0) {
        const firstQr = session.qrCode;
        const firstUpdatedAt = session.updatedAt.getTime();
        await new Promise((resolve) => setTimeout(resolve, QR_CODE_STABILITY_MS));
        const stableSession = await prisma.whatsAppSession.findUnique({ where: { accountId } });
        if (
          !stableSession ||
          stableSession.qrCode !== firstQr ||
          stableSession.updatedAt.getTime() !== firstUpdatedAt ||
          (options.updatedAfter && stableSession.updatedAt <= options.updatedAfter) ||
          !stableSession.expiresAt ||
          stableSession.expiresAt <= new Date()
        ) {
          continue;
        }
      }
      return {
        ...account,
        status: "QR_READY" as typeof account.status,
        qrCode: session.qrCode,
        qrExpiresAt: session.expiresAt,
      };
    }
    if (["ERROR", "FAILED"].includes(account.status)) throw new Error(account.lastError || "WhatsApp QR generation failed.");
    if (account.status === "RECONNECT_REQUIRED" && attempt > 1) throw new Error(account.lastError || "WhatsApp QR generation failed.");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(WHATSAPP_QR_WAIT_TIMEOUT);
}

export async function waitForPairingCode(accountId: string, options: { updatedAfter?: Date } = {}) {
  const { prisma } = await import("@/server/db");
  const attempts = Number(process.env.WHATSAPP_PAIRING_WAIT_ATTEMPTS || 60);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new Error("NOT_FOUND");
    if (["ERROR", "FAILED"].includes(account.status)) throw new Error(account.lastError || "WhatsApp pairing code generation failed.");
    if (options.updatedAfter && account.updatedAt.getTime() <= options.updatedAfter.getTime()) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    if (canExposePhonePairingCode(account, undefined, PAIRING_CODE_MIN_TTL_MS)) {
      if (PAIRING_CODE_STABILITY_MS <= 0) return account;
      const firstCode = account.pairingCode;
      const firstUpdatedAt = account.updatedAt.getTime();
      await new Promise((resolve) => setTimeout(resolve, PAIRING_CODE_STABILITY_MS));
      const stableAccount = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
      if (
        stableAccount &&
        stableAccount.pairingCode === firstCode &&
        stableAccount.updatedAt.getTime() === firstUpdatedAt &&
        (!options.updatedAfter || stableAccount.updatedAt.getTime() > options.updatedAfter.getTime()) &&
        canExposePhonePairingCode(stableAccount, undefined, PAIRING_CODE_MIN_TTL_MS)
      ) {
        return stableAccount;
      }
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(WHATSAPP_PAIRING_WAIT_TIMEOUT);
}

export function isWhatsAppWaitTimeout(error: unknown) {
  return error instanceof Error && [WHATSAPP_QR_WAIT_TIMEOUT, WHATSAPP_PAIRING_WAIT_TIMEOUT].includes(error.message);
}
