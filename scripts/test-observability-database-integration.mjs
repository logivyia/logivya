import assert from "node:assert/strict";
import pg from "pg";

if (process.env.OBSERVABILITY_DB_INTEGRATION !== "1") {
  throw new Error("OBSERVABILITY_DB_INTEGRATION=1 is required.");
}
if (!process.env.DATABASE_URL?.includes("127.0.0.1") && !process.env.DATABASE_URL?.includes("localhost")) {
  throw new Error("Observability database integration requires a localhost PostgreSQL database.");
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function expectAppendOnlyFailure(statement) {
  await client.query("SAVEPOINT append_only_probe");
  try {
    await client.query(statement);
    assert.fail("AuditLog mutation unexpectedly succeeded.");
  } catch (error) {
    assert.equal(error?.code, "55000", "AuditLog mutation did not fail with the append-only SQLSTATE.");
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT append_only_probe");
  }
}

try {
  await client.query("BEGIN");
  const suffix = Date.now().toString(36);
  const userId = `observability-user-${suffix}`;
  const companyId = `observability-company-${suffix}`;
  const auditId = `observability-audit-${suffix}`;

  await client.query(
    `INSERT INTO "User" ("id", "name", "username", "email", "passwordHash", "updatedAt")
     VALUES ($1, 'Observability Test', $2, $3, 'not-a-real-password-hash', NOW())`,
    [userId, `observability-${suffix}`, `observability-${suffix}@example.test`],
  );
  await client.query(
    `INSERT INTO "Company" ("id", "name", "ownerId", "updatedAt") VALUES ($1, 'Observability Test', $2, NOW())`,
    [companyId, userId],
  );
  await client.query(
    `INSERT INTO "AuditLog" ("id", "companyId", "userId", "action", "entityType")
     VALUES ($1, $2, $3, 'ADMIN_SETTING_CHANGED', 'ObservabilityProbe')`,
    [auditId, companyId, userId],
  );

  await expectAppendOnlyFailure(`UPDATE "AuditLog" SET "action" = 'MUTATED' WHERE "id" = '${auditId}'`);
  await expectAppendOnlyFailure(`DELETE FROM "AuditLog" WHERE "id" = '${auditId}'`);

  const stored = await client.query(`SELECT "action" FROM "AuditLog" WHERE "id" = $1`, [auditId]);
  assert.equal(stored.rows[0]?.action, "ADMIN_SETTING_CHANGED");

  console.log(JSON.stringify({ verified: true, updateRejected: true, deleteRejected: true, sqlState: "55000" }, null, 2));
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  await client.end();
}
