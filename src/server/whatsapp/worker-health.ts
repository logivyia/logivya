export const WORKER_UNREACHABLE_MESSAGE = "WhatsApp worker is not reachable.";

export async function assertWhatsAppWorkerReachable() {
  const url = process.env.WHATSAPP_WORKER_URL || process.env.WORKER_HEALTH_URL;
  if (!url) throw new Error(WORKER_UNREACHABLE_MESSAGE);
  const response = await fetch(url, {
    cache: "no-store",
    headers: process.env.WHATSAPP_SESSION_SECRET ? { authorization: `Bearer ${process.env.WHATSAPP_SESSION_SECRET}` } : undefined,
    signal: AbortSignal.timeout(3_000),
  }).catch(() => null);
  if (!response?.ok) throw new Error(WORKER_UNREACHABLE_MESSAGE);
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
