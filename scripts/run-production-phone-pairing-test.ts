import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.production.local"));
loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

async function main() {
  const { prisma } = await import("@/server/db");
  const { requestPhonePairingCode } = await import("@/server/whatsapp/pairing-code-flow");

  try {
    const account = await prisma.whatsAppAccount.findFirst({
      where: { archivedAt: null, phoneNumber: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, phoneNumber: true, companyId: true, userId: true, status: true, lastError: true },
    });
    if (!account?.phoneNumber) throw new Error("No active WhatsApp account with phoneNumber found.");

    console.log("TARGET", {
      accountId: account.id,
      companyId: account.companyId,
      userId: account.userId,
      status: account.status,
      lastError: account.lastError,
    });

    const result = await requestPhonePairingCode({
      accountId: account.id,
      phoneNumber: account.phoneNumber,
      source: "mobile",
      companyId: account.companyId,
      userId: account.userId ?? undefined,
      correlationId: `manual-prod-pairing-${Date.now()}`,
    });

    console.log("PAIRING_RESULT", {
      reused: result.reused,
      alreadyConnected: result.alreadyConnected,
      status: result.ready?.status ?? null,
      code: result.ready?.pairingCode ?? null,
      expiresAt: result.ready?.pairingCodeExpiresAt ?? null,
    });

    const pollCount = Number(process.env.PAIRING_POLL_COUNT || 20);
    const pollIntervalMs = Number(process.env.PAIRING_POLL_INTERVAL_MS || 3_000);
    for (let i = 0; i < pollCount; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const current = await prisma.whatsAppAccount.findUnique({
        where: { id: account.id },
        select: {
          status: true,
          lastError: true,
          pairingCode: true,
          pairingCodeExpiresAt: true,
          lastConnectedAt: true,
          sessionSnapshotAt: true,
          updatedAt: true,
        },
      });
      console.log("POLL", i + 1, current);
      if (current?.status === "CONNECTED") break;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
