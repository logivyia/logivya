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

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const query = async <T extends QueryResultRow>(sql: string) => (await client.query<T>(sql)).rows;

  try {
    const loginSummary = await query(`
      SELECT success,
             COALESCE("failureReason", 'NONE') AS reason,
             COUNT(*)::int AS count,
             MAX("createdAt") AS latest
      FROM "LoginAttempt"
      WHERE "createdAt" > now() - interval '24 hours'
      GROUP BY success, COALESCE("failureReason", 'NONE')
      ORDER BY latest DESC
    `);

    const sessionSummary = await query(`
      SELECT platform,
             COALESCE("appVersion", 'unknown') AS "appVersion",
             ("revokedAt" IS NOT NULL) AS revoked,
             COUNT(*)::int AS count,
             MAX("createdAt") AS "latestCreatedAt",
             MAX("lastUsedAt") AS "latestUsedAt"
      FROM "MobileDeviceSession"
      WHERE "createdAt" > now() - interval '7 days'
         OR "lastUsedAt" > now() - interval '24 hours'
      GROUP BY platform, COALESCE("appVersion", 'unknown'), ("revokedAt" IS NOT NULL)
      ORDER BY "latestUsedAt" DESC
    `);

    const authEvents = await query(`
      SELECT type,
             result,
             status,
             COALESCE("errorCode", 'NONE') AS "errorCode",
             COUNT(*)::int AS count,
             MAX("createdAt") AS latest
      FROM "SecurityEvent"
      WHERE "createdAt" > now() - interval '24 hours'
        AND (type LIKE 'AUTH_%' OR source IN ('mobile-auth', 'mobile-login'))
      GROUP BY type, result, status, COALESCE("errorCode", 'NONE')
      ORDER BY latest DESC
    `);

    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), loginSummary, sessionSummary, authEvents }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
