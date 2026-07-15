import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (key && !process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/gu, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is missing.");

async function count(client: Client, sql: string) {
  const result = await client.query<{ count: string | number }>(sql);
  return Number(result.rows[0]?.count ?? 0);
}

async function relationExists(client: Client, relation: string) {
  const result = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS exists
  `, [relation]);
  return result.rows[0]?.exists === true;
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const hasTrialEntitlement = await relationExists(client, "TrialEntitlement");
    const hasInvitationOutbox = await relationExists(client, "InvitationDeliveryOutbox");
    const checks = {
      duplicateActiveSubscriptions: await count(client, `
        SELECT COUNT(*) AS count FROM (
          SELECT "companyId" FROM "Subscription"
          WHERE status IN ('ACTIVE', 'TRIALING')
            AND COALESCE("currentPeriodStartsAt", "startsAt", "trialStartsAt", NOW()) <= NOW()
            AND COALESCE("currentPeriodEndsAt", "endsAt", "trialEndsAt", NOW() + INTERVAL '100 years') > NOW()
          GROUP BY "companyId" HAVING COUNT(*) > 1
        ) conflicts
      `),
      orphanMemberships: await count(client, `
        SELECT COUNT(*) AS count FROM "CompanyUser" member
        LEFT JOIN "Company" company ON company.id = member."companyId"
        LEFT JOIN "User" app_user ON app_user.id = member."userId"
        WHERE company.id IS NULL OR app_user.id IS NULL
      `),
      companiesWithoutActiveOwnerMembership: await count(client, `
        SELECT COUNT(*) AS count FROM "Company" company
        WHERE NOT EXISTS (
          SELECT 1 FROM "CompanyUser" member
          WHERE member."companyId" = company.id
            AND member."userId" = company."ownerId"
            AND member.role = 'OWNER'
            AND member.status = 'ACTIVE'
        )
      `),
      duplicatePendingInvitations: await count(client, `
        SELECT COUNT(*) AS count FROM (
          SELECT "companyId", LOWER(email) FROM "CompanyInvitation"
          WHERE status = 'PENDING' AND "expiresAt" > NOW()
          GROUP BY "companyId", LOWER(email) HAVING COUNT(*) > 1
        ) duplicates
      `),
      orphanInvitations: await count(client, `
        SELECT COUNT(*) AS count FROM "CompanyInvitation" invitation
        LEFT JOIN "Company" company ON company.id = invitation."companyId"
        LEFT JOIN "User" inviter ON inviter.id = invitation."invitedByUserId"
        WHERE company.id IS NULL OR inviter.id IS NULL
      `),
      expiredPendingInvitations: await count(client, `
        SELECT COUNT(*) AS count FROM "CompanyInvitation"
        WHERE status = 'PENDING' AND "expiresAt" <= NOW()
      `),
      companiesOverSeatLimit: await count(client, `
        WITH current_subscription AS (
          SELECT ranked."companyId", ranked."maxTeamUsers"
          FROM (
            SELECT subscription."companyId", plan."maxTeamUsers",
              ROW_NUMBER() OVER (PARTITION BY subscription."companyId" ORDER BY subscription."createdAt" DESC) AS position
            FROM "Subscription" subscription
            JOIN "Plan" plan ON plan.id = subscription."planId"
            WHERE subscription.status IN ('ACTIVE', 'TRIALING')
              AND COALESCE(subscription."currentPeriodStartsAt", subscription."startsAt", subscription."trialStartsAt", NOW()) <= NOW()
              AND COALESCE(subscription."currentPeriodEndsAt", subscription."endsAt", subscription."trialEndsAt", NOW() + INTERVAL '100 years') > NOW()
          ) ranked WHERE ranked.position = 1
        )
        SELECT COUNT(*) AS count FROM current_subscription current
        WHERE (
          (SELECT COUNT(*) FROM "CompanyUser" member WHERE member."companyId" = current."companyId" AND member.status IN ('ACTIVE', 'INVITED'))
          + (SELECT COUNT(*) FROM "CompanyInvitation" invitation WHERE invitation."companyId" = current."companyId" AND invitation.status = 'PENDING' AND invitation."expiresAt" > NOW())
        ) > COALESCE(current."maxTeamUsers", 2147483647)
      `),
      companiesOverWhatsAppLimit: await count(client, `
        WITH current_subscription AS (
          SELECT ranked."companyId", ranked."maxWhatsappAccounts"
          FROM (
            SELECT subscription."companyId", plan."maxWhatsappAccounts",
              ROW_NUMBER() OVER (PARTITION BY subscription."companyId" ORDER BY subscription."createdAt" DESC) AS position
            FROM "Subscription" subscription
            JOIN "Plan" plan ON plan.id = subscription."planId"
            WHERE subscription.status IN ('ACTIVE', 'TRIALING')
              AND COALESCE(subscription."currentPeriodStartsAt", subscription."startsAt", subscription."trialStartsAt", NOW()) <= NOW()
              AND COALESCE(subscription."currentPeriodEndsAt", subscription."endsAt", subscription."trialEndsAt", NOW() + INTERVAL '100 years') > NOW()
          ) ranked WHERE ranked.position = 1
        )
        SELECT COUNT(*) AS count FROM current_subscription current
        WHERE (SELECT COUNT(*) FROM "WhatsAppAccount" account WHERE account."companyId" = current."companyId" AND account."archivedAt" IS NULL)
          > COALESCE(current."maxWhatsappAccounts", 2147483647)
      `),
      whatsappOwnershipMismatches: await count(client, `
        SELECT COUNT(*) AS count FROM "WhatsAppAccount" account
        LEFT JOIN "CompanyUser" member
          ON member."companyId" = account."companyId"
         AND member."userId" = account."userId"
         AND member.status = 'ACTIVE'
        WHERE account."userId" IS NULL OR member.id IS NULL
      `),
      duplicateTrialIdentityHashes: hasTrialEntitlement ? await count(client, `
        SELECT COUNT(*) AS count FROM (
          SELECT "whatsappIdentityHash" FROM "TrialEntitlement"
          WHERE "whatsappIdentityHash" IS NOT NULL AND status IN ('ACTIVE', 'CONSUMED', 'PAID_USAGE')
          GROUP BY "whatsappIdentityHash" HAVING COUNT(*) > 1
        ) duplicates
      `) : 0,
      orphanInvitationOutboxRows: hasInvitationOutbox ? await count(client, `
        SELECT COUNT(*) AS count FROM "InvitationDeliveryOutbox" outbox
        LEFT JOIN "CompanyInvitation" invitation ON invitation.id = outbox."invitationId"
        WHERE invitation.id IS NULL
      `) : 0,
    };

    const blockingKeys = [
      "duplicateActiveSubscriptions",
      "orphanMemberships",
      "companiesWithoutActiveOwnerMembership",
      "duplicatePendingInvitations",
      "orphanInvitations",
      "companiesOverSeatLimit",
      "companiesOverWhatsAppLimit",
      "whatsappOwnershipMismatches",
      "duplicateTrialIdentityHashes",
      "orphanInvitationOutboxRows",
    ] as const;
    const safeToMigrate = blockingKeys.every((key) => checks[key] === 0);
    const database = new URL(databaseUrl);
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      databaseHost: database.hostname,
      schemaCapabilities: { hasTrialEntitlement, hasInvitationOutbox },
      checks,
      nonBlockingRepairs: { expiredPendingInvitations: checks.expiredPendingInvitations },
      safeToMigrate,
    }, null, 2));
    if (!safeToMigrate) process.exitCode = 2;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
