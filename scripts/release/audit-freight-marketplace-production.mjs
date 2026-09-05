import process from "node:process";

import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const parsed = new URL(databaseUrl);
if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname.toLowerCase())) {
  throw new Error("Production audit refused: DATABASE_URL points to a local host.");
}

function maskEmail(email) {
  const [local = "", domain = ""] = String(email ?? "").split("@");
  if (!domain) return "missing";
  return `${local.slice(0, 2)}***@${domain}`;
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  const schema = await client.query(`
    SELECT
      to_regclass('public."FreightListing"') IS NOT NULL AS table_exists,
      to_regtype('public."FreightListingStatus"') IS NOT NULL AS status_type_exists,
      to_regtype('public."FreightTrailerType"') IS NOT NULL AS trailer_type_exists,
      to_regtype('public."FreightContainerStatus"') IS NOT NULL AS container_type_exists,
      to_regtype('public."FreightWeightUnit"') IS NOT NULL AS weight_type_exists
  `);
  const migration = await client.query(
    `SELECT migration_name, finished_at IS NOT NULL AND rolled_back_at IS NULL AS applied
       FROM "_prisma_migrations"
      WHERE migration_name = $1
      ORDER BY started_at DESC
      LIMIT 1`,
    ["20260824213000_freight_marketplace_foundation"],
  );
  const flags = await client.query(
    `SELECT "key", "isEnabled", "rolloutPercentage"
       FROM "FeatureFlag"
      WHERE "key" = ANY($1::text[])
      ORDER BY "key"`,
    [["freight_marketplace_internal", "freight_marketplace_public"]],
  );
  const admins = await client.query(`
    SELECT u.email, pa.role::text AS role, pa."isActive", pa.permissions,
           (pa.role::text = 'SUPER_ADMIN' OR 'freight_marketplace_internal_access' = ANY(pa.permissions))
             AS freight_eligible
      FROM "PlatformAdmin" pa
      JOIN "User" u ON u.id = pa."userId"
     ORDER BY pa."isActive" DESC, freight_eligible DESC, u.email
  `);

  console.log(
    JSON.stringify(
      {
        database: { host: parsed.hostname, name: parsed.pathname.replace(/^\//, "") },
        schema: schema.rows[0],
        migration: migration.rows[0] ?? null,
        flags: flags.rows,
        platformAdmins: admins.rows.map((admin) => ({
          email: maskEmail(admin.email),
          role: admin.role,
          isActive: admin.isActive,
          freightEligible: admin.freight_eligible,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
