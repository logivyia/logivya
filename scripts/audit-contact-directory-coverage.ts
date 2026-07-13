import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { resolveWhatsAppContactDisplayName } from "../src/server/whatsapp/contact-normalization";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const [key, ...parts] = trimmed.split("=");
    if (key && !process.env[key]) {
      process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type CoverageRow = {
  account: string;
  status: string;
  membershipRole: string;
  planSlug: string | null;
  total: number;
  active: number;
  named: number;
  phoneFallback: number;
  lastSync: Date | null;
};

async function main() {
  const [rows, contacts, sourceRows, displaySourceRows] = await Promise.all([
    prisma.$queryRaw<CoverageRow[]>`
    SELECT
      LEFT(account."id", 8) AS account,
      account."status" AS status,
      COALESCE(member."role"::text, 'NO_ACTIVE_MEMBERSHIP') AS "membershipRole",
      current_plan."slug" AS "planSlug",
      COUNT(contact."id")::int AS total,
      COUNT(contact."id") FILTER (WHERE contact."isActive")::int AS active,
      COUNT(contact."id") FILTER (
        WHERE contact."isActive"
          AND (
            NULLIF(BTRIM(contact."name"), '') IS NOT NULL
            OR NULLIF(BTRIM(contact."pushName"), '') IS NOT NULL
          )
      )::int AS named,
      COUNT(contact."id") FILTER (
        WHERE contact."isActive"
          AND NULLIF(BTRIM(contact."name"), '') IS NULL
          AND NULLIF(BTRIM(contact."pushName"), '') IS NULL
      )::int AS "phoneFallback",
      MAX(account."lastContactSyncAt") AS "lastSync"
    FROM "WhatsAppAccount" account
    LEFT JOIN "Contact" contact ON contact."accountId" = account."id"
    LEFT JOIN "CompanyUser" member
      ON member."companyId" = account."companyId"
      AND member."userId" = account."userId"
      AND member."status" = 'ACTIVE'
    LEFT JOIN LATERAL (
      SELECT plan."slug"
      FROM "Subscription" subscription
      JOIN "Plan" plan ON plan."id" = subscription."planId"
      WHERE subscription."companyId" = account."companyId"
        AND subscription."status" IN ('ACTIVE', 'TRIALING')
        AND COALESCE(subscription."currentPeriodEndsAt", subscription."endsAt", subscription."trialEndsAt", NOW() + INTERVAL '100 years') > NOW()
      ORDER BY subscription."createdAt" DESC
      LIMIT 1
    ) current_plan ON true
    GROUP BY account."id", account."status", member."role", current_plan."slug"
    ORDER BY total DESC
    `,
    prisma.contact.findMany({
      where: { isActive: true },
      select: { accountId: true, phone: true, name: true, pushName: true },
    }),
    prisma.contact.groupBy({
      by: ["source"],
      where: { isActive: true },
      _count: { _all: true },
      orderBy: { _count: { source: "desc" } },
    }),
    prisma.contact.groupBy({
      by: ["displayNameSource"],
      where: { isActive: true },
      _count: { _all: true },
      orderBy: { _count: { displayNameSource: "desc" } },
    }),
  ]);

  const displayableByAccount = new Map<string, number>();
  for (const contact of contacts) {
    if (!resolveWhatsAppContactDisplayName(contact)) continue;
    displayableByAccount.set(contact.accountId, (displayableByAccount.get(contact.accountId) ?? 0) + 1);
  }

  const totals = rows.reduce(
    (result, row) => ({
      total: result.total + row.total,
      active: result.active + row.active,
      named: result.named + row.named,
      phoneFallback: result.phoneFallback + row.phoneFallback,
    }),
    { total: 0, active: 0, named: 0, phoneFallback: 0 },
  );

  console.log(JSON.stringify({
    accountCount: rows.length,
    totals: {
      ...totals,
      displayable: [...displayableByAccount.values()].reduce((sum, value) => sum + value, 0),
    },
    sources: sourceRows.map((row) => ({ source: row.source ?? "UNKNOWN", count: row._count._all })),
    displayNameSources: displaySourceRows.map((row) => ({ source: row.displayNameSource ?? "UNKNOWN", count: row._count._all })),
    accounts: rows.map((row) => ({
      ...row,
      displayable: displayableByAccount.get(row.account) ?? contacts.filter((contact) => contact.accountId.startsWith(row.account) && resolveWhatsAppContactDisplayName(contact)).length,
    })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
