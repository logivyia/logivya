import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";

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

async function count(client: Client, sql: string) {
  const result = await client.query<{ count: string }>(sql);
  return Number(result.rows[0]?.count ?? 0);
}

async function columnExists(client: Client, table: string, column: string) {
  const result = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     LIMIT 1`,
    [table, column],
  );
  return (result.rowCount ?? 0) > 0;
}

async function tableExists(client: Client, table: string) {
  const result = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1
     LIMIT 1`,
    [table],
  );
  return (result.rowCount ?? 0) > 0;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const orphanMemberships = await count(client, `
        SELECT COUNT(*) AS count
        FROM "CompanyUser" cu
        LEFT JOIN "Company" c ON c.id = cu."companyId"
        LEFT JOIN "User" u ON u.id = cu."userId"
        WHERE c.id IS NULL OR u.id IS NULL
      `);
    const companiesWithoutActiveOwnerMembership = await count(client, `
        SELECT COUNT(*) AS count
        FROM "Company" c
        LEFT JOIN "CompanyUser" cu
          ON cu."companyId" = c.id
         AND cu."userId" = c."ownerId"
         AND cu."role" = 'OWNER'
         AND cu."status" = 'ACTIVE'
        WHERE cu.id IS NULL
      `);
    const operationalOwnerMembershipIssues = await count(client, `
      SELECT COUNT(*) AS count
      FROM "Company" c
      JOIN "User" u ON u.id = c."ownerId"
      LEFT JOIN "CompanyUser" cu
        ON cu."companyId" = c.id
       AND cu."userId" = c."ownerId"
       AND cu."role" = 'OWNER'
       AND cu."status" = 'ACTIVE'
      WHERE cu.id IS NULL
        AND (
          c."securityStatus" <> 'DISABLED'
          OR u."status" <> 'SUSPENDED'
          OR EXISTS (
            SELECT 1
            FROM "Subscription" s
            WHERE s."companyId" = c.id
              AND s."status" IN ('ACTIVE', 'TRIALING')
          )
        )
    `);
    const ownerMembershipIssues = (await client.query<{
      companyId: string;
      ownerId: string;
      membershipRole: string | null;
      membershipStatus: string | null;
      ownerStatus: string | null;
      companySecurityStatus: string;
      activeSubscriptionCount: number;
    }>(`
      SELECT
        c.id AS "companyId",
        c."ownerId",
        cu."role"::text AS "membershipRole",
        cu."status"::text AS "membershipStatus",
        u."status"::text AS "ownerStatus",
        c."securityStatus"::text AS "companySecurityStatus",
        (
          SELECT COUNT(*)::int
          FROM "Subscription" s
          WHERE s."companyId" = c.id
            AND s."status" IN ('ACTIVE', 'TRIALING')
        ) AS "activeSubscriptionCount"
      FROM "Company" c
      LEFT JOIN "User" u ON u.id = c."ownerId"
      LEFT JOIN "CompanyUser" cu
        ON cu."companyId" = c.id
       AND cu."userId" = c."ownerId"
      WHERE cu.id IS NULL OR cu."role" <> 'OWNER' OR cu."status" <> 'ACTIVE'
      ORDER BY c.id
      LIMIT 20
    `)).rows;
    const duplicateMemberships = await count(client, `
        SELECT COUNT(*) AS count
        FROM (
          SELECT "companyId", "userId"
          FROM "CompanyUser"
          GROUP BY "companyId", "userId"
          HAVING COUNT(*) > 1
        ) duplicate_memberships
      `);
    const pendingInvitationsToRevoke = await count(client, `SELECT COUNT(*) AS count FROM "CompanyInvitation" WHERE "status" = 'PENDING'`);
    const deliveryRowsToStop = await count(client, `SELECT COUNT(*) AS count FROM "InvitationDeliveryOutbox" WHERE "status" IN ('PENDING', 'PROCESSING')`);
    const postMigrationSeatOverages = await count(client, `
        SELECT COUNT(*) AS count
        FROM (
          SELECT
            c.id,
            COALESCE(p."maxTeamUsers", 1) AS seat_limit,
            COUNT(cu.id) FILTER (WHERE cu."status" IN ('ACTIVE', 'SUSPENDED', 'INVITED')) AS occupied
          FROM "Company" c
          LEFT JOIN LATERAL (
            SELECT s."planId"
            FROM "Subscription" s
            WHERE s."companyId" = c.id
              AND s."status" IN ('ACTIVE', 'TRIALING')
            ORDER BY COALESCE(s."currentPeriodEndsAt", s."trialEndsAt", s."endsAt") DESC NULLS LAST, s."createdAt" DESC
            LIMIT 1
          ) current_subscription ON true
          LEFT JOIN "Plan" p ON p.id = current_subscription."planId"
          LEFT JOIN "CompanyUser" cu ON cu."companyId" = c.id
          GROUP BY c.id, p."maxTeamUsers"
          HAVING COUNT(cu.id) FILTER (WHERE cu."status" IN ('ACTIVE', 'SUSPENDED', 'INVITED')) > COALESCE(p."maxTeamUsers", 1)
        ) overages
      `);
    const hasMustChangePassword = await columnExists(client, "User", "mustChangePassword");
    const hasCreatedByUserId = await columnExists(client, "CompanyUser", "createdByUserId");
    const hasChallengeTable = await tableExists(client, "ForcedPasswordChangeChallenge");

    const blockers = {
      orphanMemberships,
      operationalOwnerMembershipIssues,
      duplicateMemberships,
      postMigrationSeatOverages,
    };
    const report = {
      generatedAt: new Date().toISOString(),
      mode: "read-only",
      migrationAlreadyApplied: hasMustChangePassword && hasCreatedByUserId && hasChallengeTable,
      schema: {
        userMustChangePassword: hasMustChangePassword,
        companyUserCreatedByUserId: hasCreatedByUserId,
        forcedPasswordChangeChallenge: hasChallengeTable,
      },
      legacyRowsAffected: {
        pendingInvitationsToRevoke,
        deliveryRowsToStop,
      },
      warnings: {
        archivedCompaniesWithoutActiveOwnerMembership:
          companiesWithoutActiveOwnerMembership - operationalOwnerMembershipIssues,
      },
      blockers,
      ownerMembershipIssues,
      safeToMigrate: Object.values(blockers).every((value) => value === 0),
    };
    console.log(JSON.stringify(report, null, 2));
    if (!report.safeToMigrate) process.exitCode = 2;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
