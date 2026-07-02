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
    if (!process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function countRaw(query: TemplateStringsArray) {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(query[0]);
  return Number(rows[0]?.count ?? 0);
}

async function sampleRaw<T>(query: string) {
  return prisma.$queryRawUnsafe<T[]>(query);
}

async function columnExists(table: string, column: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      ) AS exists
    `,
    table,
    column,
  );
  return Boolean(rows[0]?.exists);
}

async function main() {
  const missingColumns = [];
  if (!(await columnExists("WhatsAppAccount", "userId"))) missingColumns.push("WhatsAppAccount.userId");
  if (!(await columnExists("WhatsAppGroup", "userId"))) missingColumns.push("WhatsAppGroup.userId");

  if (missingColumns.length > 0) {
    console.log(JSON.stringify({
      status: "blocked",
      migrationRequired: true,
      missingColumns,
      detail: "WhatsApp group isolation audit requires the ownership columns introduced by the pending migration.",
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  const report = {
    accountsWithoutUserId: await countRaw`SELECT COUNT(*) AS count FROM "WhatsAppAccount" WHERE "userId" IS NULL`,
    groupsWithoutUserId: await countRaw`SELECT COUNT(*) AS count FROM "WhatsAppGroup" WHERE "userId" IS NULL`,
    groupsWithWrongAccountOwner: await countRaw`
      SELECT COUNT(*) AS count
      FROM "WhatsAppGroup" AS g
      JOIN "WhatsAppAccount" AS a ON a.id = g."accountId"
      WHERE g."companyId" <> a."companyId"
         OR g."userId" IS DISTINCT FROM a."userId"
    `,
    duplicateGroupJidInsideAccount: await countRaw`
      SELECT COUNT(*) AS count
      FROM (
        SELECT "accountId", "externalGroupId"
        FROM "WhatsAppGroup"
        GROUP BY "accountId", "externalGroupId"
        HAVING COUNT(*) > 1
      ) AS duplicates
    `,
    categoryAssignmentsToForeignGroups: await countRaw`
      SELECT COUNT(*) AS count
      FROM "CategoryGroup" AS cg
      JOIN "Category" AS c ON c.id = cg."categoryId"
      JOIN "WhatsAppGroup" AS g ON g.id = cg."groupId"
      WHERE c."companyId" <> g."companyId"
    `,
    messageRecipientsToForeignGroups: await countRaw`
      SELECT COUNT(*) AS count
      FROM "MessageRecipient" AS mr
      JOIN "MessageCampaign" AS mc ON mc.id = mr."campaignId"
      JOIN "WhatsAppGroup" AS g ON g.id = mr."groupId"
      JOIN "WhatsAppAccount" AS a ON a.id = mr."accountId"
      WHERE mc."companyId" <> g."companyId"
         OR mc."companyId" <> a."companyId"
         OR mc."createdById" IS DISTINCT FROM g."userId"
         OR mc."createdById" IS DISTINCT FROM a."userId"
         OR mr."accountId" <> g."accountId"
    `,
  };

  const samples = {
    ownerMismatch: await sampleRaw<{ groupId: string; groupUserId: string | null; accountUserId: string | null }>(`
      SELECT g.id AS "groupId", g."userId" AS "groupUserId", a."userId" AS "accountUserId"
      FROM "WhatsAppGroup" AS g
      JOIN "WhatsAppAccount" AS a ON a.id = g."accountId"
      WHERE g."userId" IS DISTINCT FROM a."userId"
      LIMIT 20
    `),
    duplicateGroupJids: await sampleRaw<{ accountId: string; externalGroupId: string; count: number }>(`
      SELECT "accountId", "externalGroupId", COUNT(*)::int AS count
      FROM "WhatsAppGroup"
      GROUP BY "accountId", "externalGroupId"
      HAVING COUNT(*) > 1
      LIMIT 20
    `),
  };

  console.log(JSON.stringify({ report, samples }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
