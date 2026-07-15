import assert from "node:assert/strict";
import pg from "pg";

if (process.env.MIGRATION_FAILURE_INTEGRATION !== "1") throw new Error("MIGRATION_FAILURE_INTEGRATION=1 is required.");
if (!process.env.DATABASE_URL?.includes("127.0.0.1") && !process.env.DATABASE_URL?.includes("localhost")) {
  throw new Error("Migration failure integration test requires a localhost PostgreSQL database.");
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('DROP TABLE IF EXISTS "_MigrationFailureSafetyProbe"');
  let failed = false;
  try {
    await client.query("BEGIN");
    await client.query('CREATE TABLE "_MigrationFailureSafetyProbe" (id TEXT PRIMARY KEY)');
    await client.query('ALTER TABLE "_MigrationFailureSafetyProbe" ADD CONSTRAINT "forced_failure" FOREIGN KEY (id) REFERENCES "TableThatDoesNotExist"(id)');
    await client.query("COMMIT");
  } catch {
    failed = true;
    await client.query("ROLLBACK");
  }
  assert.equal(failed, true);
  const probe = await client.query(`SELECT to_regclass('public."_MigrationFailureSafetyProbe"') AS relation`);
  assert.equal(probe.rows[0].relation, null, "Failed migration left a partial table behind.");
  console.log(JSON.stringify({ verified: true, migrationStopped: true, transactionRolledBack: true, partialSchemaLeftBehind: false }, null, 2));
} finally {
  await client.end();
}
