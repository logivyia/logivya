export const WORKER_UNREACHABLE_MESSAGE = "WhatsApp worker is not reachable.";
import { readWorkerHeartbeat } from "@/server/whatsapp/worker-heartbeat";

export async function assertWhatsAppWorkerReachable() {
  const url = process.env.WHATSAPP_WORKER_URL || process.env.WORKER_HEALTH_URL;
  if (url) {
    const response = await fetch(url, {
      cache: "no-store",
      headers: process.env.WHATSAPP_SESSION_SECRET ? { authorization: `Bearer ${process.env.WHATSAPP_SESSION_SECRET}` } : undefined,
      signal: AbortSignal.timeout(3_000),
    }).catch(() => null);
    if (response?.ok) return;
  }
  const heartbeat = await readWorkerHeartbeat().catch(() => null);
  if (!heartbeat || Date.now() - new Date(heartbeat.timestamp).getTime() > 20_000) throw new Error(WORKER_UNREACHABLE_MESSAGE);
}

export async function waitForAccountQr(accountId: string) {
  const { prisma } = await import("@/server/db");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new Error("NOT_FOUND");
    if (account.status === "ERROR") throw new Error(account.lastError || "WhatsApp QR generation failed.");
    if (account.qrCode && account.qrExpiresAt && account.qrExpiresAt > new Date()) return account;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("WhatsApp QR generation timed out.");
}

export async function waitForPairingCode(accountId: string) {
  const { prisma } = await import("@/server/db");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new Error("NOT_FOUND");
    if (account.status === "ERROR") throw new Error(account.lastError || "WhatsApp pairing code generation failed.");
    if (account.pairingCode && account.pairingCodeExpiresAt && account.pairingCodeExpiresAt > new Date()) return account;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("WhatsApp pairing code generation timed out.");
}
