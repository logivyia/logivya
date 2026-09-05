import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import pg from "pg";

const MIGRATION_NAME = "20260824213000_freight_marketplace_foundation";
const CONFIRMATION = "APPLY_FREIGHT_MARKETPLACE_ONLY";
const REQUIRED_FLAGS = [
  ["freight_marketplace_public", false, 0],
  ["freight_marketplace_internal", true, 100],
];

function assertProductionDatabase(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const host = parsed.hostname.toLowerCase();

  if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1") {
    throw new Error("Production migration refused: DATABASE_URL points to a local host.");
  }

  if (process.env.CONFIRM_FREIGHT_MARKETPLACE_MIGRATION !== CONFIRMATION) {
    throw new Error(
      `Migration refused. Set CONFIRM_FREIGHT_MARKETPLACE_MIGRATION=${CONFIRMATION}.`,
    );
  }

  return { host, database: parsed.pathname.replace(/^\//, "") };
}

async function inspect(client) {
  const migrationResult = await client.query(
    `SELECT finished_at IS NOT NULL AND rolled_back_at IS NULL AS applied
       FROM "_prisma_migrations"
      WHERE migration_name = $1
      ORDER BY started_at DESC
      LIMIT 1`,
    [MIGRATION_NAME],
  );
  const objectResult = await client.query(`
    SELECT
      to_regclass('public."FreightListing"') IS NOT NULL AS table_exists,
      to_regtype('public."FreightListingStatus"') IS NOT NULL AS status_type_exists,
      to_regtype('public."FreightTrailerType"') IS NOT NULL AS trailer_type_exists,
      to_regtype('public."FreightContainerStatus"') IS NOT NULL AS container_type_exists,
      to_regtype('public."FreightWeightUnit"') IS NOT NULL AS weight_type_exists
  `);
  const flagResult = await client.query(
    `SELECT "key", "isEnabled", "rolloutPercentage"
       FROM "FeatureFlag"
      WHERE "key" = ANY($1::text[])
      ORDER BY "key"`,
    [REQUIRED_FLAGS.map(([key]) => key)],
  );

  return {
    migrationApplied: migrationResult.rows[0]?.applied === true,
    objects: objectResult.rows[0],
    flags: flagResult.rows,
  };
}

function validateObjects(state) {
  const objectValues = Object.values(state.objects);
  const allObjectsExist = objectValues.every(Boolean);
  const noObjectsExist = objectValues.every((value) => !value);

  if (!allObjectsExist && !noObjectsExist) {
    throw new Error(
      `Partial Freight Marketplace schema detected; refusing automatic migration: ${JSON.stringify(state.objects)}`,
    );
  }

  return { allObjectsExist, noObjectsExist };
}

function validateFinalState(state) {
  const { allObjectsExist } = validateObjects(state);
  if (!allObjectsExist) {
    throw new Error("Freight Marketplace schema verification failed.");
  }

  for (const [key, isEnabled, rolloutPercentage] of REQUIRED_FLAGS) {
    const flag = state.flags.find((candidate) => candidate.key === key);
    if (
      !flag ||
      flag.isEnabled !== isEnabled ||
      flag.rolloutPercentage !== rolloutPercentage
    ) {
      throw new Error(`Feature flag verification failed for ${key}.`);
    }
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const database = assertProductionDatabase(databaseUrl);
const migrationPath = path.resolve(
  "prisma",
  "migrations",
  MIGRATION_NAME,
  "migration.sql",
);
const migrationSql = await fs.readFile(migrationPath, "utf8");

const executableSql = migrationSql
  .split(/\r?\n/)
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

if (
  /"(?:WhatsApp|Message)[^"]*"/i.test(executableSql) ||
  !executableSql.includes('CREATE TABLE "FreightListing"')
) {
  throw new Error("Migration content guard failed; refusing execution.");
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  const before = await inspect(client);
  const { allObjectsExist, noObjectsExist } = validateObjects(before);

  if (before.migrationApplied) {
    validateFinalState(before);
    console.log(
      JSON.stringify({ status: "already-applied", database, migration: MIGRATION_NAME }, null, 2),
    );
    process.exitCode = 0;
  } else if (allObjectsExist) {
    throw new Error(
      "Schema objects exist but Prisma migration is not recorded. Resolve this state manually.",
    );
  } else if (noObjectsExist) {
    await client.query("BEGIN");
    try {
      await client.query(migrationSql);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    const after = await inspect(client);
    validateFinalState(after);
    console.log(
      JSON.stringify(
        {
          status: "schema-applied-awaiting-prisma-resolve",
          database,
          migration: MIGRATION_NAME,
          flags: after.flags,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await client.end();
}
