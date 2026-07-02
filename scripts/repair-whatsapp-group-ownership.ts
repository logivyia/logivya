import { Client } from "pg";
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

async function scalar(client: Client, sql: string) {
  const result = await client.query(sql);
  return Number(result.rows[0]?.count ?? 0);
}

async function samples(client: Client) {
  const result = await client.query(`
    SELECT
      g.id AS "groupId",
      g."companyId" AS "groupCompanyId",
      a."companyId" AS "accountCompanyId",
      g."userId" AS "groupUserId",
      a."userId" AS "accountUserId",
      g."accountId",
      g."externalGroupId"
    FROM "WhatsAppGroup" AS g
    JOIN "WhatsAppAccount" AS a ON a.id = g."accountId"
    WHERE g."companyId" <> a."companyId"
       OR g."userId" IS DISTINCT FROM a."userId"
    LIMIT 20
  `);
  return result.rows;
}

async function report(client: Client) {
  return {
    accountCompanyOrphans: await scalar(client, `
      SELECT COUNT(*) AS count
      FROM "WhatsAppAccount" AS a
      LEFT JOIN "Company" AS c ON c.id = a."companyId"
      WHERE c.id IS NULL
    `),
    accountUserMissing: await scalar(client, `
      SELECT COUNT(*) AS count
      FROM "WhatsAppAccount"
      WHERE "userId" IS NULL
    `),
    groupAccountOrphans: await scalar(client, `
      SELECT COUNT(*) AS count
      FROM "WhatsAppGroup" AS g
      LEFT JOIN "WhatsAppAccount" AS a ON a.id = g."accountId"
      WHERE a.id IS NULL
    `),
    groupsWithoutUserId: await scalar(client, `
      SELECT COUNT(*) AS count
      FROM "WhatsAppGroup"
      WHERE "userId" IS NULL
    `),
    groupOwnerMismatch: await scalar(client, `
      SELECT COUNT(*) AS count
      FROM "WhatsAppGroup" AS g
      JOIN "WhatsAppAccount" AS a ON a.id = g."accountId"
      WHERE g."companyId" <> a."companyId"
         OR g."userId" IS DISTINCT FROM a."userId"
    `),
    ownerMismatchSamples: await samples(client),
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const before = await report(client);
    const blocked =
      before.accountCompanyOrphans > 0 ||
      before.accountUserMissing > 0 ||
      before.groupAccountOrphans > 0;

    if (!apply || blocked) {
      console.log(JSON.stringify({
        mode: apply ? "blocked" : "dry-run",
        safeToApply: !blocked,
        before,
      }, null, 2));
      if (blocked) process.exitCode = 2;
      return;
    }

    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    const repaired = await client.query(`
      UPDATE "WhatsAppGroup" AS g
      SET
        "userId" = a."userId",
        "companyId" = a."companyId",
        "updatedAt" = CURRENT_TIMESTAMP
      FROM "WhatsAppAccount" AS a
      WHERE g."accountId" = a.id
        AND a."userId" IS NOT NULL
        AND (
          g."companyId" <> a."companyId"
          OR g."userId" IS DISTINCT FROM a."userId"
        )
    `);
    await client.query("COMMIT");

    const after = await report(client);
    console.log(JSON.stringify({
      mode: "applied",
      repairedRows: repaired.rowCount ?? 0,
      before,
      after,
    }, null, 2));

    if (after.groupsWithoutUserId > 0 || after.groupOwnerMismatch > 0) process.exitCode = 2;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
