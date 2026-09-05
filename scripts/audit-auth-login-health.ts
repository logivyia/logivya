import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { verifyTotp } from "../src/server/security/mfa";
import { parseEncryptedField } from "../src/server/security/encryption";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (key && !process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const [attempts, events, mfaEvents, activeTotpCredentials] = await Promise.all([
    prisma.loginAttempt.groupBy({
      by: ["success", "failureReason"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { success: "desc" } },
    }),
    prisma.securityEvent.groupBy({
      by: ["source", "type", "result", "clientPlatform", "appVersion", "errorCode"],
      where: {
        createdAt: { gte: since },
        source: { in: ["mobile-login", "web-login"] },
      },
      _count: { _all: true },
      orderBy: { _count: { type: "desc" } },
      take: 100,
    }),
    prisma.securityEvent.findMany({
      where: {
        createdAt: { gte: since },
        source: "mfa",
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        createdAt: true,
        type: true,
        result: true,
        clientPlatform: true,
        appVersion: true,
        errorCode: true,
        metadata: true,
      },
    }),
    prisma.mfaCredential.findMany({
      where: {
        type: "TOTP",
        status: "ENABLED",
        verifiedAt: { not: null },
        revokedAt: null,
      },
      select: {
        secretEncrypted: true,
      },
    }),
  ]);

  const totpCredentialHealth = {
    total: activeTotpCredentials.length,
    readable: 0,
    unreadable: 0,
    keyVersions: {} as Record<string, number>,
    errors: {} as Record<string, number>,
  };
  for (const credential of activeTotpCredentials) {
    if (!credential.secretEncrypted) {
      totpCredentialHealth.unreadable += 1;
      totpCredentialHealth.errors.MISSING_SECRET = (totpCredentialHealth.errors.MISSING_SECRET ?? 0) + 1;
      continue;
    }
    try {
      const field = parseEncryptedField(credential.secretEncrypted);
      totpCredentialHealth.keyVersions[field.keyVersion] = (totpCredentialHealth.keyVersions[field.keyVersion] ?? 0) + 1;
      verifyTotp(credential.secretEncrypted, "000000");
      totpCredentialHealth.readable += 1;
    } catch (error) {
      const code = error instanceof Error ? error.message.replace(/[^A-Z0-9_:-]/giu, "_").slice(0, 120) : "UNKNOWN";
      totpCredentialHealth.unreadable += 1;
      totpCredentialHealth.errors[code] = (totpCredentialHealth.errors[code] ?? 0) + 1;
    }
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    windowHours: 24,
    attempts,
    events,
    mfaEvents,
    totpCredentialHealth,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
