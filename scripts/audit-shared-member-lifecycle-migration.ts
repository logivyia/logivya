import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");

async function count(client: Client, sql: string) {
  const result = await client.query<{ count: string }>(sql);
  return Number(result.rows[0]?.count ?? 0);
}

async function columnExists(client: Client, table: string, column: string) {
  const result = await client.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1`,
    [table, column],
  );
  return (result.rowCount ?? 0) > 0;
}

async function typeExists(client: Client, type: string) {
  const result = await client.query(
    `SELECT 1
       FROM pg_type type
       JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
      WHERE namespace.nspname = 'public'
        AND type.typname = $1
      LIMIT 1`,
    [type],
  );
  return (result.rowCount ?? 0) > 0;
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    statement_timeout: 30_000,
    application_name: "logivya-shared-member-lifecycle-preflight",
  });
  await client.connect();
  await client.query("BEGIN TRANSACTION READ ONLY");
  try {
    const schema = {
      lifecycleColumn: await columnExists(
        client,
        "CompanyUser",
        "lifecycleState",
      ),
      lifecycleType: await typeExists(client, "MembershipLifecycleState"),
      requestPurposeColumn: await columnExists(
        client,
        "SubscriptionRequest",
        "purpose",
      ),
      requestPurposeType: await typeExists(
        client,
        "SubscriptionRequestPurpose",
      ),
    };
    const blockers = {
      orphanMemberships: await count(
        client,
        `SELECT COUNT(*) AS count
           FROM "CompanyUser" membership
           LEFT JOIN "Company" company ON company.id = membership."companyId"
           LEFT JOIN "User" users ON users.id = membership."userId"
          WHERE company.id IS NULL OR users.id IS NULL`,
      ),
      duplicateMemberships: await count(
        client,
        `SELECT COUNT(*) AS count
           FROM (
             SELECT "companyId", "userId"
               FROM "CompanyUser"
              GROUP BY "companyId", "userId"
             HAVING COUNT(*) > 1
           ) duplicates`,
      ),
      operationalCompaniesWithoutOwnerMembership: await count(
        client,
        `SELECT COUNT(*) AS count
           FROM "Company" company
           JOIN "User" owner ON owner.id = company."ownerId"
           LEFT JOIN "CompanyUser" membership
             ON membership."companyId" = company.id
            AND membership."userId" = company."ownerId"
            AND membership.role = 'OWNER'
            AND membership.status = 'ACTIVE'
          WHERE membership.id IS NULL
            AND (
              company."securityStatus" <> 'DISABLED'
              OR owner.status <> 'SUSPENDED'
              OR EXISTS (
                SELECT 1
                  FROM "Subscription" subscription
                 WHERE subscription."companyId" = company.id
                   AND subscription.status IN ('ACTIVE', 'TRIALING')
              )
            )`,
      ),
      usersOwningMultipleCompanies: await count(
        client,
        `SELECT COUNT(*) AS count
           FROM (
             SELECT "ownerId"
               FROM "Company"
              GROUP BY "ownerId"
             HAVING COUNT(*) > 1
           ) duplicate_owners`,
      ),
    };
    const observations = {
      owners: await count(
        client,
        `SELECT COUNT(*) AS count
           FROM "CompanyUser"
          WHERE role = 'OWNER'`,
      ),
      pendingMembers: await count(
        client,
        `SELECT COUNT(*) AS count
           FROM "CompanyUser" membership
           JOIN "User" users ON users.id = membership."userId"
          WHERE membership.role <> 'OWNER'
            AND membership.status IN ('ACTIVE', 'INVITED')
            AND users."mustChangePassword" = true`,
      ),
      activatedMembers: await count(
        client,
        `SELECT COUNT(*) AS count
           FROM "CompanyUser" membership
           JOIN "User" users ON users.id = membership."userId"
          WHERE membership.role <> 'OWNER'
            AND membership.status = 'ACTIVE'
            AND users."mustChangePassword" = false`,
      ),
      removedMembers: await count(
        client,
        `SELECT COUNT(*) AS count
           FROM "CompanyUser"
          WHERE role <> 'OWNER'
            AND status = 'REMOVED'`,
      ),
      suspendedMembers: await count(
        client,
        `SELECT COUNT(*) AS count
           FROM "CompanyUser"
          WHERE role <> 'OWNER'
            AND status = 'SUSPENDED'`,
      ),
    };
    const blockerCount = Object.values(blockers).reduce(
      (total, value) => total + value,
      0,
    );
    const partialMigration =
      Object.values(schema).some(Boolean) && !Object.values(schema).every(Boolean);
    const result = {
      generatedAt: new Date().toISOString(),
      mode: "read-only",
      schema,
      migrationAlreadyApplied: Object.values(schema).every(Boolean),
      partialMigration,
      blockers,
      observations,
      decision:
        blockerCount === 0 && !partialMigration
          ? "GO"
          : "NO_GO",
    };
    console.log(JSON.stringify(result, null, 2));
    if (result.decision !== "GO") process.exitCode = 1;
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}

void main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        decision: "NO_GO",
        error:
          error instanceof Error
            ? error.message
            : "UNKNOWN_MIGRATION_AUDIT_ERROR",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
