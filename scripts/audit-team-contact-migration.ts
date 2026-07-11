import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (key && !process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type CountRow = { count: bigint | number };

async function count(sql: string) {
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(sql);
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  const invitationTableExists = await count(`SELECT COUNT(*) AS count FROM pg_class WHERE oid = to_regclass('"CompanyInvitation"')`);
  const pendingInvitationSeats = invitationTableExists
    ? `(SELECT COUNT(*) FROM "CompanyInvitation" invitation WHERE invitation."companyId" = current_subscription."companyId" AND invitation."status" = 'PENDING' AND invitation."expiresAt" > NOW())`
    : "0";
  const report = {
    duplicateMemberships: await count(`SELECT COUNT(*) AS count FROM (SELECT "companyId", "userId" FROM "CompanyUser" GROUP BY 1, 2 HAVING COUNT(*) > 1) duplicates`),
    companiesWithoutActiveOwnerMembership: await count(`SELECT COUNT(*) AS count FROM "Company" company WHERE NOT EXISTS (SELECT 1 FROM "CompanyUser" member WHERE member."companyId" = company."id" AND member."userId" = company."ownerId" AND member."role" = 'OWNER' AND member."status" = 'ACTIVE')`),
    companiesWithMultipleCurrentlyActiveSubscriptions: await count(`SELECT COUNT(*) AS count FROM (SELECT "companyId" FROM "Subscription" WHERE "status" IN ('ACTIVE', 'TRIALING') AND COALESCE("currentPeriodEndsAt", "endsAt", "trialEndsAt", NOW() + INTERVAL '100 years') > NOW() GROUP BY 1 HAVING COUNT(*) > 1) conflicts`),
    orphanContactsWithoutAccount: await count(`SELECT COUNT(*) AS count FROM "Contact" contact LEFT JOIN "WhatsAppAccount" account ON account."id" = contact."accountId" WHERE account."id" IS NULL`),
    contactsWithCompanyMismatch: await count(`SELECT COUNT(*) AS count FROM "Contact" contact JOIN "WhatsAppAccount" account ON account."id" = contact."accountId" WHERE contact."companyId" <> account."companyId"`),
    contactsWhoseAccountHasNoOwner: await count(`SELECT COUNT(*) AS count FROM "Contact" contact JOIN "WhatsAppAccount" account ON account."id" = contact."accountId" WHERE account."userId" IS NULL`),
    duplicateContactsWithinAccount: await count(`SELECT COUNT(*) AS count FROM (SELECT "accountId", "externalContactId" FROM "Contact" GROUP BY 1, 2 HAVING COUNT(*) > 1) duplicates`),
    recipientsWithBothGroupAndContact: await count(`SELECT COUNT(*) AS count FROM "MessageRecipient" WHERE "groupId" IS NOT NULL AND "contactId" IS NOT NULL`),
    recipientsWithoutGroupOrContact: await count(`SELECT COUNT(*) AS count FROM "MessageRecipient" WHERE "groupId" IS NULL AND "contactId" IS NULL`),
    recipientsWithForeignGroup: await count(`SELECT COUNT(*) AS count FROM "MessageRecipient" recipient JOIN "MessageCampaign" campaign ON campaign."id" = recipient."campaignId" JOIN "WhatsAppGroup" target ON target."id" = recipient."groupId" WHERE target."companyId" <> campaign."companyId" OR target."userId" IS DISTINCT FROM campaign."createdById" OR target."accountId" <> recipient."accountId"`),
    recipientsWithForeignContact: await count(`SELECT COUNT(*) AS count FROM "MessageRecipient" recipient JOIN "MessageCampaign" campaign ON campaign."id" = recipient."campaignId" JOIN "Contact" target ON target."id" = recipient."contactId" JOIN "WhatsAppAccount" account ON account."id" = target."accountId" WHERE target."companyId" <> campaign."companyId" OR account."userId" IS DISTINCT FROM campaign."createdById" OR target."accountId" <> recipient."accountId"`),
    legacyInvitedMemberships: await count(`SELECT COUNT(*) AS count FROM "CompanyUser" WHERE "status" = 'INVITED'`),
    duplicateLivePendingInvitations: invitationTableExists
      ? await count(`SELECT COUNT(*) AS count FROM (SELECT "companyId", LOWER("email") FROM "CompanyInvitation" WHERE "status" = 'PENDING' AND "expiresAt" > NOW() GROUP BY 1, 2 HAVING COUNT(*) > 1) duplicates`)
      : 0,
    orphanInvitations: invitationTableExists
      ? await count(`SELECT COUNT(*) AS count FROM "CompanyInvitation" invitation LEFT JOIN "Company" company ON company."id" = invitation."companyId" LEFT JOIN "User" inviter ON inviter."id" = invitation."invitedByUserId" WHERE company."id" IS NULL OR inviter."id" IS NULL`)
      : 0,
    expiredPendingInvitations: invitationTableExists
      ? await count(`SELECT COUNT(*) AS count FROM "CompanyInvitation" WHERE "status" = 'PENDING' AND "expiresAt" <= NOW()`)
      : 0,
    companiesOverAuthoritativeSeatLimit: await count(`
      WITH current_subscription AS (
        SELECT ranked."companyId", ranked."slug"
        FROM (
          SELECT subscription."companyId", plan."slug",
            ROW_NUMBER() OVER (PARTITION BY subscription."companyId" ORDER BY subscription."createdAt" DESC) AS row_number
          FROM "Subscription" subscription
          JOIN "Plan" plan ON plan."id" = subscription."planId"
          WHERE subscription."status" IN ('ACTIVE', 'TRIALING')
            AND COALESCE(subscription."currentPeriodStartsAt", subscription."startsAt", subscription."trialStartsAt", NOW()) <= NOW()
            AND COALESCE(subscription."currentPeriodEndsAt", subscription."endsAt", subscription."trialEndsAt", NOW() + INTERVAL '100 years') > NOW()
        ) ranked
        WHERE ranked.row_number = 1
      )
      SELECT COUNT(*) AS count
      FROM current_subscription
      WHERE (
        (SELECT COUNT(*) FROM "CompanyUser" member WHERE member."companyId" = current_subscription."companyId" AND member."status" IN ('ACTIVE', 'INVITED'))
        + ${pendingInvitationSeats}
      ) > CASE current_subscription."slug" WHEN 'trial' THEN 1 WHEN 'starter' THEN 2 WHEN 'professional' THEN 3 ELSE 2147483647 END
    `),
  };

  const blockers = [
    report.duplicateMemberships,
    report.companiesWithoutActiveOwnerMembership,
    report.companiesWithMultipleCurrentlyActiveSubscriptions,
    report.orphanContactsWithoutAccount,
    report.contactsWithCompanyMismatch,
    report.contactsWhoseAccountHasNoOwner,
    report.duplicateContactsWithinAccount,
    report.recipientsWithBothGroupAndContact,
    report.recipientsWithoutGroupOrContact,
    report.recipientsWithForeignGroup,
    report.recipientsWithForeignContact,
    report.duplicateLivePendingInvitations,
    report.orphanInvitations,
    report.companiesOverAuthoritativeSeatLimit,
  ];
  console.log(JSON.stringify({ report, invitationTableExists: Boolean(invitationTableExists), safeToMigrate: blockers.every((value) => value === 0) }, null, 2));
  if (blockers.some((value) => value > 0)) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
