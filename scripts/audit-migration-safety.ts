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

type Check = {
  name: string;
  count?: number;
  status: "pass" | "warn" | "fail" | "not_applicable";
  detail?: string;
  samples?: unknown[];
};

async function scalar(client: Client, sql: string) {
  const result = await client.query(sql);
  return Number(result.rows[0]?.count ?? 0);
}

async function sample(client: Client, sql: string) {
  const result = await client.query(sql);
  return result.rows;
}

async function columnExists(client: Client, table: string, column: string) {
  const result = await client.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [table, column],
  );
  return (result.rowCount ?? 0) > 0;
}

function check(name: string, count: number, detail?: string, samples?: unknown[]): Check {
  return { name, count, status: count === 0 ? "pass" : "fail", detail, samples };
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const hasAccountUserId = await columnExists(client, "WhatsAppAccount", "userId");
    const hasGroupUserId = await columnExists(client, "WhatsAppGroup", "userId");
    const checks: Check[] = [
      {
        name: "schema.whatsAppAccount.userId",
        status: hasAccountUserId ? "pass" : "warn",
        detail: hasAccountUserId ? "WhatsAppAccount.userId exists." : "WhatsAppAccount.userId is missing; migration will add and backfill from Company.ownerId.",
      },
      {
        name: "schema.whatsAppGroup.userId",
        status: hasGroupUserId ? "pass" : "warn",
        detail: hasGroupUserId ? "WhatsAppGroup.userId exists." : "WhatsAppGroup.userId is missing; migration will add and backfill from WhatsAppAccount.userId.",
      },
    ];

    checks.push(check(
      "company.owner_orphans",
      await scalar(client, `
        SELECT COUNT(*) AS count
        FROM "Company" c
        LEFT JOIN "User" u ON u.id = c."ownerId"
        WHERE u.id IS NULL
      `),
      "Companies must have an existing owner before WhatsAppAccount.userId backfill.",
      await sample(client, `
        SELECT c.id, c.name, c."ownerId"
        FROM "Company" c
        LEFT JOIN "User" u ON u.id = c."ownerId"
        WHERE u.id IS NULL
        LIMIT 20
      `),
    ));

    checks.push(check(
      "whatsappAccount.company_orphans",
      await scalar(client, `
        SELECT COUNT(*) AS count
        FROM "WhatsAppAccount" a
        LEFT JOIN "Company" c ON c.id = a."companyId"
        WHERE c.id IS NULL
      `),
      "Every WhatsApp account must reference an existing company.",
      await sample(client, `
        SELECT a.id, a."companyId", a."phoneNumber"
        FROM "WhatsAppAccount" a
        LEFT JOIN "Company" c ON c.id = a."companyId"
        WHERE c.id IS NULL
        LIMIT 20
      `),
    ));

    checks.push(check(
      "whatsappGroup.account_orphans",
      await scalar(client, `
        SELECT COUNT(*) AS count
        FROM "WhatsAppGroup" g
        LEFT JOIN "WhatsAppAccount" a ON a.id = g."accountId"
        WHERE a.id IS NULL
      `),
      "Every WhatsApp group must reference an existing account.",
      await sample(client, `
        SELECT g.id, g."companyId", g."accountId", g."externalGroupId"
        FROM "WhatsAppGroup" g
        LEFT JOIN "WhatsAppAccount" a ON a.id = g."accountId"
        WHERE a.id IS NULL
        LIMIT 20
      `),
    ));

    checks.push(check(
      "whatsappGroup.account_company_mismatch",
      await scalar(client, `
        SELECT COUNT(*) AS count
        FROM "WhatsAppGroup" g
        JOIN "WhatsAppAccount" a ON a.id = g."accountId"
        WHERE g."companyId" <> a."companyId"
      `),
      "Group companyId must match its account companyId.",
      await sample(client, `
        SELECT g.id, g."companyId" AS "groupCompanyId", a."companyId" AS "accountCompanyId", g."accountId", g."externalGroupId"
        FROM "WhatsAppGroup" g
        JOIN "WhatsAppAccount" a ON a.id = g."accountId"
        WHERE g."companyId" <> a."companyId"
        LIMIT 20
      `),
    ));

    checks.push(check(
      "whatsappGroup.duplicate_account_jid",
      await scalar(client, `
        SELECT COUNT(*) AS count
        FROM (
          SELECT "accountId", "externalGroupId"
          FROM "WhatsAppGroup"
          GROUP BY "accountId", "externalGroupId"
          HAVING COUNT(*) > 1
        ) d
      `),
      "Migration requires unique WhatsApp groups per accountId + externalGroupId.",
      await sample(client, `
        SELECT "accountId", "externalGroupId", COUNT(*)::int AS count, array_agg(id ORDER BY "updatedAt" DESC) AS ids
        FROM "WhatsAppGroup"
        GROUP BY "accountId", "externalGroupId"
        HAVING COUNT(*) > 1
        LIMIT 20
      `),
    ));

    checks.push(check(
      "categoryGroup.orphans_or_cross_company",
      await scalar(client, `
        SELECT COUNT(*) AS count
        FROM "CategoryGroup" cg
        LEFT JOIN "Category" c ON c.id = cg."categoryId"
        LEFT JOIN "WhatsAppGroup" g ON g.id = cg."groupId"
        WHERE c.id IS NULL
           OR g.id IS NULL
           OR c."companyId" <> g."companyId"
      `),
      "Category assignments must reference existing same-company categories and groups.",
      await sample(client, `
        SELECT cg."categoryId", cg."groupId", c."companyId" AS "categoryCompanyId", g."companyId" AS "groupCompanyId"
        FROM "CategoryGroup" cg
        LEFT JOIN "Category" c ON c.id = cg."categoryId"
        LEFT JOIN "WhatsAppGroup" g ON g.id = cg."groupId"
        WHERE c.id IS NULL
           OR g.id IS NULL
           OR c."companyId" <> g."companyId"
        LIMIT 20
      `),
    ));

    checks.push(check(
      "messageRecipient.orphans_or_cross_scope",
      await scalar(client, `
        SELECT COUNT(*) AS count
        FROM "MessageRecipient" mr
         LEFT JOIN "MessageCampaign" mc ON mc.id = mr."campaignId"
         LEFT JOIN "WhatsAppAccount" a ON a.id = mr."accountId"
         LEFT JOIN "WhatsAppGroup" g ON g.id = mr."groupId"
         LEFT JOIN "Contact" c ON c.id = mr."contactId"
         WHERE mc.id IS NULL
            OR a.id IS NULL
            OR mc."companyId" <> a."companyId"
            OR (
              mr."targetType" = 'GROUP'
              AND (mr."groupId" IS NULL OR mr."contactId" IS NOT NULL OR g.id IS NULL OR mc."companyId" <> g."companyId" OR mr."accountId" <> g."accountId")
            )
            OR (
              mr."targetType" = 'CONTACT'
              AND (mr."contactId" IS NULL OR mr."groupId" IS NOT NULL OR c.id IS NULL OR mc."companyId" <> c."companyId" OR mr."accountId" <> c."accountId")
            )
       `),
      "Message recipients must reference an existing same-company account and exactly one account-owned group or contact target.",
      await sample(client, `
        SELECT mr.id, mr."campaignId", mr."accountId", mr."targetType", mr."groupId", mr."contactId", mc."companyId" AS "campaignCompanyId", a."companyId" AS "accountCompanyId", g."companyId" AS "groupCompanyId", g."accountId" AS "groupAccountId", c."companyId" AS "contactCompanyId", c."accountId" AS "contactAccountId"
         FROM "MessageRecipient" mr
         LEFT JOIN "MessageCampaign" mc ON mc.id = mr."campaignId"
         LEFT JOIN "WhatsAppAccount" a ON a.id = mr."accountId"
         LEFT JOIN "WhatsAppGroup" g ON g.id = mr."groupId"
         LEFT JOIN "Contact" c ON c.id = mr."contactId"
         WHERE mc.id IS NULL
            OR a.id IS NULL
            OR mc."companyId" <> a."companyId"
            OR (
              mr."targetType" = 'GROUP'
              AND (mr."groupId" IS NULL OR mr."contactId" IS NOT NULL OR g.id IS NULL OR mc."companyId" <> g."companyId" OR mr."accountId" <> g."accountId")
            )
            OR (
              mr."targetType" = 'CONTACT'
              AND (mr."contactId" IS NULL OR mr."groupId" IS NOT NULL OR c.id IS NULL OR mc."companyId" <> c."companyId" OR mr."accountId" <> c."accountId")
            )
         LIMIT 20
      `),
    ));

    if (hasAccountUserId && hasGroupUserId) {
      checks.push(check(
        "whatsapp.owner_mismatch_after_migration",
        await scalar(client, `
          SELECT COUNT(*) AS count
          FROM "WhatsAppGroup" g
          JOIN "WhatsAppAccount" a ON a.id = g."accountId"
          WHERE g."userId" IS DISTINCT FROM a."userId"
        `),
        "After migration, group userId must match account userId.",
      ));
    } else {
      checks.push({
        name: "whatsapp.owner_mismatch_after_migration",
        status: "not_applicable",
        detail: "Skipped because userId columns are not deployed yet.",
      });
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      migrationRequired: !hasAccountUserId || !hasGroupUserId,
      failedChecks: checks.filter((item) => item.status === "fail").length,
      warningChecks: checks.filter((item) => item.status === "warn").length,
      checks,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.failedChecks > 0) process.exitCode = 2;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
