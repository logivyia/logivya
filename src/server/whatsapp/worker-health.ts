export const WORKER_UNREACHABLE_MESSAGE = "WhatsApp worker is not reachable.";
export const WHATSAPP_QR_WAIT_TIMEOUT = "WHATSAPP_QR_WAIT_TIMEOUT";
export const WHATSAPP_PAIRING_WAIT_TIMEOUT = "WHATSAPP_PAIRING_WAIT_TIMEOUT";
import { isWorkerHeartbeatFresh, readWorkerHeartbeat } from "@/server/whatsapp/worker-heartbeat";
import { logger } from "@/server/observability/logger";

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
  if (!url && requiresRemoteWorkerUrl()) throw new Error("WHATSAPP_WORKER_URL_REQUIRED");
  if (url) {
    const response = await fetch(url, {
      cache: "no-store",
      headers: process.env.WHATSAPP_SESSION_SECRET ? { authorization: `Bearer ${process.env.WHATSAPP_SESSION_SECRET}` } : undefined,
      signal: AbortSignal.timeout(3_000),
    }).catch(() => null);
    if (response?.ok) return;
  }
  const heartbeat = await readWorkerHeartbeat().catch((error) => {
    if (isRedisQuotaOrTransientHeartbeatError(error)) {
      logger.warn("whatsapp.worker.heartbeat_check_degraded", {
        reason: error instanceof Error ? error.message : String(error),
      });
      return "redis-degraded" as const;
    }
    return null;
  });
  if (heartbeat === "redis-degraded") throw new Error("REDIS_MAX_REQUESTS_EXCEEDED");
  if (!isWorkerHeartbeatFresh(heartbeat)) throw new Error(WORKER_UNREACHABLE_MESSAGE);
}

export async function waitForAccountQr(accountId: string) {
  const { prisma } = await import("@/server/db");
  const attempts = Number(process.env.WHATSAPP_QR_WAIT_ATTEMPTS || 60);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new Error("NOT_FOUND");
    if (["ERROR", "FAILED", "RECONNECT_REQUIRED"].includes(account.status)) throw new Error(account.lastError || "WhatsApp QR generation failed.");
    if (account.qrCode && account.qrExpiresAt && account.qrExpiresAt > new Date()) return account;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(WHATSAPP_QR_WAIT_TIMEOUT);
}

export async function waitForPairingCode(accountId: string) {
  const { prisma } = await import("@/server/db");
  const attempts = Number(process.env.WHATSAPP_PAIRING_WAIT_ATTEMPTS || 60);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new Error("NOT_FOUND");
    if (["ERROR", "FAILED"].includes(account.status)) throw new Error(account.lastError || "WhatsApp pairing code generation failed.");
    if (account.pairingCode && account.pairingCodeExpiresAt && account.pairingCodeExpiresAt > new Date()) return account;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(WHATSAPP_PAIRING_WAIT_TIMEOUT);
}

export function isWhatsAppWaitTimeout(error: unknown) {
  return error instanceof Error && [WHATSAPP_QR_WAIT_TIMEOUT, WHATSAPP_PAIRING_WAIT_TIMEOUT].includes(error.message);
}
