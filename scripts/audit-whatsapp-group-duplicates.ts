import { Client } from "pg";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    const value = parts.join("=").replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const summary = await client.query(`
      SELECT
        COUNT(*)::int AS total_groups,
        COUNT(DISTINCT ("companyId" || ':' || "externalGroupId"))::int AS unique_company_groups,
        (COUNT(*) - COUNT(DISTINCT ("companyId" || ':' || "externalGroupId")))::int AS duplicate_rows,
        COUNT(DISTINCT "externalGroupId")::int AS unique_global_groups
      FROM "WhatsAppGroup"
    `);
    const duplicates = await client.query(`
      SELECT
        "companyId",
        "externalGroupId",
        COUNT(*)::int AS duplicate_count,
        array_agg(json_build_object(
          'id', "id",
          'name', "name",
          'accountId', "accountId",
          'createdAt', "createdAt",
          'updatedAt', "updatedAt"
        ) ORDER BY "updatedAt" DESC, "lastSyncedAt" DESC, "createdAt" DESC) AS rows
      FROM "WhatsAppGroup"
      GROUP BY "companyId", "externalGroupId"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, MAX("updatedAt") DESC
    `);
    console.log(JSON.stringify({ summary: summary.rows[0], duplicates: duplicates.rows }, null, 2));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
