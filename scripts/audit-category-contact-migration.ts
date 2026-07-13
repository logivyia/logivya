import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";

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

async function count(client: Client, sql: string) {
  const result = await client.query(sql);
  return Number(result.rows[0]?.count ?? 0);
}

async function tableExists(client: Client, table: string) {
  return (await count(client, `SELECT COUNT(*) AS count FROM pg_class WHERE oid = to_regclass('"${table}"')`)) > 0;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const categoryContactExists = await tableExists(client, "CategoryContact");
    const report = {
      generatedAt: new Date().toISOString(),
      categoryGroupRows: await count(client, `SELECT COUNT(*) AS count FROM "CategoryGroup"`),
      duplicateCategoryGroups: await count(client, `SELECT COUNT(*) AS count FROM (SELECT "categoryId", "groupId" FROM "CategoryGroup" GROUP BY 1, 2 HAVING COUNT(*) > 1) duplicate_rows`),
      orphanOrCrossCompanyCategoryGroups: await count(client, `SELECT COUNT(*) AS count FROM "CategoryGroup" link LEFT JOIN "Category" category ON category.id = link."categoryId" LEFT JOIN "WhatsAppGroup" target ON target.id = link."groupId" WHERE category.id IS NULL OR target.id IS NULL OR category."companyId" <> target."companyId"`),
      categoriesNamedContacts: await count(client, `SELECT COUNT(*) AS count FROM "Category" WHERE LOWER(name) IN ('kişiler', 'kisiler', 'contacts')`),
      contactsWithoutAccount: await count(client, `SELECT COUNT(*) AS count FROM "Contact" contact LEFT JOIN "WhatsAppAccount" account ON account.id = contact."accountId" WHERE account.id IS NULL`),
      contactsWithScopeMismatch: await count(client, `SELECT COUNT(*) AS count FROM "Contact" contact JOIN "WhatsAppAccount" account ON account.id = contact."accountId" WHERE contact."companyId" <> account."companyId" OR contact."userId" IS DISTINCT FROM account."userId"`),
      duplicateContactsWithinAccount: await count(client, `SELECT COUNT(*) AS count FROM (SELECT "accountId", "externalContactId" FROM "Contact" GROUP BY 1, 2 HAVING COUNT(*) > 1) duplicate_rows`),
      existingCategoryContactRows: categoryContactExists ? await count(client, `SELECT COUNT(*) AS count FROM "CategoryContact"`) : 0,
      invalidExistingCategoryContacts: categoryContactExists ? await count(client, `SELECT COUNT(*) AS count FROM "CategoryContact" link LEFT JOIN "Category" category ON category.id = link."categoryId" LEFT JOIN "Contact" contact ON contact.id = link."contactId" LEFT JOIN "WhatsAppAccount" account ON account.id = link."accountId" WHERE category.id IS NULL OR contact.id IS NULL OR account.id IS NULL OR link."companyId" <> category."companyId" OR link."companyId" <> contact."companyId" OR link."companyId" <> account."companyId" OR link."userId" IS DISTINCT FROM contact."userId" OR link."userId" IS DISTINCT FROM account."userId" OR link."accountId" <> contact."accountId"`) : 0,
    };
    const blockers = [
      report.duplicateCategoryGroups,
      report.orphanOrCrossCompanyCategoryGroups,
      report.contactsWithoutAccount,
      report.contactsWithScopeMismatch,
      report.duplicateContactsWithinAccount,
      report.invalidExistingCategoryContacts,
    ];
    console.log(JSON.stringify({ report, categoryContactExists, safeToMigrate: blockers.every((value) => value === 0) }, null, 2));
    if (blockers.some((value) => value > 0)) process.exitCode = 2;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
