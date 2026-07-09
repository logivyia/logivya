import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client, type QueryResultRow } from "pg";

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

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");

function short(value: string | null | undefined) {
  return value ? value.slice(0, 12) : null;
}

function maskPhone(value: string | null | undefined) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const query = async <T extends QueryResultRow>(sql: string, params: unknown[] = []) => {
    const result = await client.query<T>(sql, params);
    return result.rows;
  };

  try {
    const [dbNow] = await query<{ now: Date }>("SELECT now() AS now");
    console.log("DB_NOW", dbNow.now);

    const latestAudit = await query<{
      action: string;
      entityType: string;
      entityId: string | null;
      userId: string | null;
      companyId: string;
      createdAt: Date;
      metadata: unknown;
    }>(`
      SELECT action, "entityType", "entityId", "userId", "companyId", "createdAt", metadata
      FROM "AuditLog"
      ORDER BY "createdAt" DESC
      LIMIT 60
    `);
    console.log("LATEST_AUDIT_ANY_ACTION");
    console.log(JSON.stringify(latestAudit.map((row) => ({
      ...row,
      entityId: short(row.entityId),
      userId: short(row.userId),
      companyId: short(row.companyId),
    })), null, 2));

    const latestWhatsapp = await query<{
      action: string;
      entityType: string;
      entityId: string | null;
      userId: string | null;
      companyId: string;
      createdAt: Date;
      metadata: unknown;
    }>(`
      SELECT action, "entityType", "entityId", "userId", "companyId", "createdAt", metadata
      FROM "AuditLog"
      WHERE action ILIKE '%whatsapp%'
         OR action ILIKE '%pair%'
         OR action ILIKE '%mobile%'
         OR "entityType" ILIKE '%whatsapp%'
      ORDER BY "createdAt" DESC
      LIMIT 80
    `);
    console.log("LATEST_MOBILE_WHATSAPP_AUDIT");
    console.log(JSON.stringify(latestWhatsapp.map((row) => ({
      ...row,
      entityId: short(row.entityId),
      userId: short(row.userId),
      companyId: short(row.companyId),
    })), null, 2));

    const recentAccounts = await query<{
      id: string;
      userId: string | null;
      companyId: string;
      phoneNumber: string | null;
      status: string;
      lastError: string | null;
      pairingCodePresent: boolean;
      pairingCodeExpiresAt: Date | null;
      updatedAt: Date;
      createdAt: Date;
    }>(`
      SELECT id, "userId", "companyId", "phoneNumber", status, "lastError",
             ("pairingCode" IS NOT NULL) AS "pairingCodePresent",
             "pairingCodeExpiresAt", "updatedAt", "createdAt"
      FROM "WhatsAppAccount"
      ORDER BY "updatedAt" DESC
      LIMIT 30
    `);
    console.log("RECENT_ACCOUNT_ACTIVITY");
    console.log(JSON.stringify(recentAccounts.map((row) => ({
      ...row,
      id: short(row.id),
      userId: short(row.userId),
      companyId: short(row.companyId),
      phoneNumber: maskPhone(row.phoneNumber),
    })), null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
