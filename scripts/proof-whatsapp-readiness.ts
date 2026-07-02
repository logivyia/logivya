import { Client, type QueryResultRow } from "pg";
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

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");

async function rows<T extends QueryResultRow>(client: Client, sql: string) {
  const result = await client.query<T>(sql);
  return result.rows;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const report = {
      generatedAt: new Date().toISOString(),
      accountStatusCounts: await rows(client, `
        SELECT "status", COUNT(*)::int AS count
        FROM "WhatsAppAccount"
        GROUP BY "status"
        ORDER BY "status"
      `),
      ownership: (await rows(client, `
        SELECT
          COUNT(*)::int AS "accounts",
          COUNT(*) FILTER (WHERE "userId" IS NULL)::int AS "accountsWithoutUserId",
          (SELECT COUNT(*)::int FROM "WhatsAppGroup") AS "groups",
          (SELECT COUNT(*)::int FROM "WhatsAppGroup" WHERE "userId" IS NULL) AS "groupsWithoutUserId",
          (SELECT COUNT(*)::int FROM "WhatsAppGroup" WHERE "canSend" = true AND "isArchived" = false) AS "sendableGroups"
        FROM "WhatsAppAccount"
      `))[0],
      isolationViolations: (await rows(client, `
        SELECT
          (
            SELECT COUNT(*)::int
            FROM "WhatsAppGroup" g
            JOIN "WhatsAppAccount" a ON a.id = g."accountId"
            WHERE g."companyId" <> a."companyId"
               OR g."userId" IS DISTINCT FROM a."userId"
          ) AS "groupOwnerMismatch",
          (
            SELECT COUNT(*)::int
            FROM "MessageRecipient" mr
            JOIN "MessageCampaign" mc ON mc.id = mr."campaignId"
            JOIN "WhatsAppGroup" g ON g.id = mr."groupId"
            JOIN "WhatsAppAccount" a ON a.id = mr."accountId"
            WHERE mc."companyId" <> g."companyId"
               OR mc."companyId" <> a."companyId"
               OR mc."createdById" IS DISTINCT FROM g."userId"
               OR mc."createdById" IS DISTINCT FROM a."userId"
               OR mr."accountId" <> g."accountId"
          ) AS "recipientScopeMismatch"
      `))[0],
      recentCampaigns24h: await rows(client, `
        SELECT "status", "scheduleType", COUNT(*)::int AS count
        FROM "MessageCampaign"
        WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
        GROUP BY "status", "scheduleType"
        ORDER BY "status", "scheduleType"
      `),
      recentRecipients24h: await rows(client, `
        SELECT "status", COUNT(*)::int AS count
        FROM "MessageRecipient"
        WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
        GROUP BY "status"
        ORDER BY "status"
      `),
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "failed", error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
