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

async function countDuplicates(client: Client) {
  const result = await client.query(`
    SELECT
      COUNT(*)::int AS total_groups,
      COUNT(DISTINCT ("companyId" || ':' || "externalGroupId"))::int AS unique_company_groups,
      (COUNT(*) - COUNT(DISTINCT ("companyId" || ':' || "externalGroupId")))::int AS duplicate_rows
    FROM "WhatsAppGroup"
  `);
  return result.rows[0] as { total_groups: number; unique_company_groups: number; duplicate_rows: number };
}

loadEnvFile(path.join(process.cwd(), ".env.local"));

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");
  const migrationPath = path.join(process.cwd(), "prisma", "migrations", "20260623090000_unique_whatsapp_group_per_company", "migration.sql");
  const sql = readFileSync(migrationPath, "utf8");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const before = await countDuplicates(client);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    const after = await countDuplicates(client);
    console.log(JSON.stringify({ before, after }, null, 2));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
