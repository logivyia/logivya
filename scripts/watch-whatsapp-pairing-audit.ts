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

async function main() {
  const since = process.argv[2] ? new Date(process.argv[2]) : new Date(Date.now() - 30 * 60_000);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const query = async <T extends QueryResultRow>(sql: string, params: unknown[] = []) => {
    const result = await client.query<T>(sql, params);
    return result.rows;
  };
  try {
    const accounts = await query<{
      id: string;
      status: string;
      lastError: string | null;
      pairingCodePresent: boolean;
      pairingCodeExpiresAt: Date | null;
      updatedAt: Date;
    }>(`
      SELECT id, status, "lastError", ("pairingCode" IS NOT NULL) AS "pairingCodePresent",
             "pairingCodeExpiresAt", "updatedAt"
      FROM "WhatsAppAccount"
      ORDER BY "updatedAt" DESC
      LIMIT 8
    `);
    console.log("ACCOUNTS");
    console.log(JSON.stringify(accounts.map((row) => ({ ...row, id: short(row.id) })), null, 2));

    const logs = await query<{
      action: string;
      entityId: string | null;
      createdAt: Date;
      metadata: unknown;
    }>(`
      SELECT action, "entityId", "createdAt", metadata
      FROM "AuditLog"
      WHERE "createdAt" >= $1
        AND (
          action ILIKE '%whatsapp%'
          OR action ILIKE '%pair%'
          OR action ILIKE '%mobile%'
        )
      ORDER BY "createdAt" DESC
      LIMIT 40
    `, [since]);
    console.log("AUDIT_SINCE", since.toISOString());
    console.log(JSON.stringify(logs.map((row) => ({ ...row, entityId: short(row.entityId) })), null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
