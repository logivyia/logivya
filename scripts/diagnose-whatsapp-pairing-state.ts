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

function mask(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/\d(?=\d{2})/g, "*");
}

function short(value: string | null | undefined) {
  if (!value) return null;
  return value.slice(0, 12);
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const query = async <T extends QueryResultRow>(sql: string, params: unknown[] = []) => {
      const result = await client.query<T>(sql, params);
      return result.rows;
    };

    const accounts = await query<{
      id: string;
      userId: string | null;
      companyId: string;
      phoneNumber: string | null;
      status: string;
      lastError: string | null;
      hasPairingCode: boolean;
      pairingCodeExpiresAt: Date | null;
      lastConnectedAt: Date | null;
      lastDisconnectedAt: Date | null;
      lastSyncedAt: Date | null;
      sessionSnapshotAt: Date | null;
      sessionRestoredAt: Date | null;
      reconnectRetryCount: number;
      recoveryLevel: number;
      updatedAt: Date;
      createdAt: Date;
      groups: number;
    }>(`
      SELECT a.id, a."userId", a."companyId", a."phoneNumber", a.status, a."lastError",
             (a."pairingCode" IS NOT NULL) AS "hasPairingCode",
             a."pairingCodeExpiresAt", a."lastConnectedAt", a."lastDisconnectedAt",
             a."lastSyncedAt", a."sessionSnapshotAt", a."sessionRestoredAt",
             a."reconnectRetryCount", a."recoveryLevel", a."updatedAt", a."createdAt",
             COUNT(g.id)::int AS groups
      FROM "WhatsAppAccount" a
      LEFT JOIN "WhatsAppGroup" g ON g."accountId" = a.id
      GROUP BY a.id
      ORDER BY a."updatedAt" DESC
      LIMIT 20
    `);

    console.log("RECENT_WHATSAPP_ACCOUNTS");
    console.log(JSON.stringify(accounts.map((account) => ({
      ...account,
      id: short(account.id),
      userId: short(account.userId),
      companyId: short(account.companyId),
      phoneNumber: mask(account.phoneNumber),
      pairingCode: account.hasPairingCode ? "present" : null,
      hasPairingCode: undefined,
    })), null, 2));

    const sessions = await query<{
      accountId: string;
      status: string;
      sessionDataEncryptedLength: number | null;
      snapshotReason: string | null;
      restoreCount: number;
      lastHeartbeatAt: Date | null;
      updatedAt: Date;
      createdAt: Date;
    }>(`
      SELECT "accountId", status,
             CASE WHEN "sessionDataEncrypted" IS NULL THEN NULL ELSE LENGTH("sessionDataEncrypted") END AS "sessionDataEncryptedLength",
             "snapshotReason", "restoreCount", "lastHeartbeatAt", "updatedAt", "createdAt"
      FROM "WhatsAppSession"
      ORDER BY "updatedAt" DESC
      LIMIT 20
    `);

    console.log("RECENT_WHATSAPP_SESSIONS");
    console.log(JSON.stringify(sessions.map((session) => ({
      ...session,
      accountId: short(session.accountId),
      sessionDataEncrypted: session.sessionDataEncryptedLength
        ? `present:${session.sessionDataEncryptedLength}`
        : null,
      sessionDataEncryptedLength: undefined,
    })), null, 2));

    const auditLogs = await query<{
      action: string;
      entityType: string;
      entityId: string | null;
      metadata: unknown;
      createdAt: Date;
      userId: string | null;
      companyId: string;
    }>(`
      SELECT action, "entityType", "entityId", metadata, "createdAt", "userId", "companyId"
      FROM "AuditLog"
      WHERE action ILIKE '%whatsapp%'
         OR action ILIKE '%pair%'
         OR "entityType" ILIKE '%whatsapp%'
      ORDER BY "createdAt" DESC
      LIMIT 30
    `);

    console.log("RECENT_WHATSAPP_AUDIT_LOGS");
    console.log(JSON.stringify(auditLogs.map((log) => ({
      ...log,
      entityId: short(log.entityId),
      userId: short(log.userId),
      companyId: short(log.companyId),
    })), null, 2));
  } finally {
    await client.end();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
