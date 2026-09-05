import process from "node:process";

import pg from "pg";

const MIGRATION_NAME = "20260824213000_freight_marketplace_foundation";
const MIGRATION_CHECKSUM = "c9dc9cfbc619fc3ccdff38f5a9bb85746009093f7976be86f3953db2e0d17ce2";
const CONFIRMATION = "ROLLBACK_ERRONEOUS_FREIGHT_MIGRATION";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (process.env.CONFIRM_OLD_NEON_CLEANUP !== CONFIRMATION) {
  throw new Error(`Cleanup refused. Set CONFIRM_OLD_NEON_CLEANUP=${CONFIRMATION}.`);
}

const parsed = new URL(databaseUrl);
if (!parsed.hostname.toLowerCase().endsWith(".neon.tech")) {
  throw new Error("Cleanup refused: target is not an old Neon database.");
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  const tableExists = (
    await client.query(`SELECT to_regclass('public."FreightListing"') IS NOT NULL AS value`)
  ).rows[0]?.value;
  if (!tableExists) throw new Error("Cleanup refused: FreightListing table is absent.");

  const rowCount = (await client.query(`SELECT count(*)::integer AS value FROM "FreightListing"`))
    .rows[0]?.value;
  if (rowCount !== 0) {
    throw new Error(`Cleanup refused: FreightListing contains ${rowCount} row(s).`);
  }

  const migration = await client.query(
    `SELECT id, checksum, finished_at, rolled_back_at
       FROM "_prisma_migrations"
      WHERE migration_name = $1
      ORDER BY started_at DESC`,
    [MIGRATION_NAME],
  );
  if (
    migration.rowCount !== 1 ||
    migration.rows[0].checksum !== MIGRATION_CHECKSUM ||
    !migration.rows[0].finished_at ||
    migration.rows[0].rolled_back_at
  ) {
    throw new Error("Cleanup refused: migration record does not match this run.");
  }

  const flags = await client.query(
    `SELECT id, "key", "isEnabled", "rolloutPercentage"
       FROM "FeatureFlag"
      WHERE "key" = ANY($1::text[])
      ORDER BY "key"`,
    [["freight_marketplace_internal", "freight_marketplace_public"]],
  );
  if (
    flags.rowCount !== 2 ||
    flags.rows[0].key !== "freight_marketplace_internal" ||
    flags.rows[0].id !== "freight-marketplace-internal-flag" ||
    flags.rows[0].isEnabled !== true ||
    flags.rows[0].rolloutPercentage !== 100 ||
    flags.rows[1].key !== "freight_marketplace_public" ||
    flags.rows[1].id !== "freight-marketplace-public-flag" ||
    flags.rows[1].isEnabled !== false ||
    flags.rows[1].rolloutPercentage !== 0
  ) {
    throw new Error("Cleanup refused: old Neon feature flags differ from the inserted defaults.");
  }

  await client.query("BEGIN");
  try {
    await client.query(
      `DELETE FROM "FeatureFlag" WHERE "key" = ANY($1::text[])`,
      [["freight_marketplace_internal", "freight_marketplace_public"]],
    );
    await client.query(`DROP TABLE "FreightListing"`);
    await client.query(`DROP TYPE "FreightWeightUnit"`);
    await client.query(`DROP TYPE "FreightContainerStatus"`);
    await client.query(`DROP TYPE "FreightTrailerType"`);
    await client.query(`DROP TYPE "FreightListingStatus"`);
    await client.query(`DELETE FROM "_prisma_migrations" WHERE id = $1`, [migration.rows[0].id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  const after = await client.query(`
    SELECT
      to_regclass('public."FreightListing"') IS NULL AS table_removed,
      to_regtype('public."FreightListingStatus"') IS NULL AS types_removed,
      (SELECT count(*) FROM "FeatureFlag" WHERE "key" LIKE 'freight_marketplace_%') = 0 AS flags_removed,
      (SELECT count(*) FROM "_prisma_migrations" WHERE migration_name = '${MIGRATION_NAME}') = 0 AS migration_removed
  `);
  if (!Object.values(after.rows[0]).every(Boolean)) {
    throw new Error(`Cleanup verification failed: ${JSON.stringify(after.rows[0])}`);
  }

  console.log(
    JSON.stringify(
      {
        status: "old-neon-cleaned",
        host: parsed.hostname,
        migration: MIGRATION_NAME,
        freightRowsRemoved: 0,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
