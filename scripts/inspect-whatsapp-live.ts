import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client, type QueryResultRow } from "pg";

function readEnvFile(filePath: string) {
  if (!existsSync(filePath)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
  return env;
}

const fileEnv = {
  ...readEnvFile(path.join(process.cwd(), ".env")),
  ...readEnvFile(path.join(process.cwd(), ".env.local")),
};

const databaseUrl = fileEnv.DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is missing.");

const phone = process.argv[2]?.replace(/\D/g, "");
if (!phone || phone.length < 7) {
  throw new Error("A phone number argument is required (for example: npx tsx scripts/inspect-whatsapp-live.ts 90XXXXXXXXXX).");
}

async function rows<T extends QueryResultRow>(client: Client, sql: string, params: unknown[] = []) {
  const result = await client.query<T>(sql, params);
  return result.rows;
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const accounts = await rows(client, `
      SELECT id, "companyId", "userId", status, "lastError", ("qrCode" IS NOT NULL) AS "hasQrCode",
             "qrExpiresAt", "updatedAt", "createdAt", "archivedAt", "phoneNumber"
      FROM "WhatsAppAccount"
      WHERE "phoneNumber" ILIKE $1
      ORDER BY "updatedAt" DESC
      LIMIT 5
    `, [`%${phone}%`]);

    const accountIds = accounts.map((account) => account.id);
    const sessions = accountIds.length
      ? await rows(client, `
        SELECT id, "accountId", status, ("qrCode" IS NOT NULL) AS "hasQrCode",
               "expiresAt", "updatedAt", "lastHeartbeatAt", "snapshotReason", "restoreCount"
        FROM "WhatsAppSession"
        WHERE "accountId" = ANY($1::text[])
        ORDER BY "updatedAt" DESC
      `, [accountIds])
      : [];

    const audits = accountIds.length
      ? await rows(client, `
        SELECT "createdAt", action, "entityId", metadata, "userId"
        FROM "AuditLog"
        WHERE "entityType" = 'WhatsAppAccount'
          AND "entityId" = ANY($1::text[])
        ORDER BY "createdAt" DESC
        LIMIT 30
      `, [accountIds])
      : [];

    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), phone, accounts, sessions, audits }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
