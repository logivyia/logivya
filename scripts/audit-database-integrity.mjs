import { Client } from "pg";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: databaseUrl });
await client.connect();
const rows = async (sql) => (await client.query(sql)).rows;
const scalar = async (sql) => Number((await client.query(sql)).rows[0].value);

try {
  const databaseInfo = (await rows(`
    SELECT current_database() AS database,
           current_schema() AS schema,
           current_setting('server_version') AS "serverVersion",
           current_setting('TimeZone') AS timezone
  `))[0];
  const migrationState = (await rows(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS incomplete,
           MAX(finished_at) AS latest
    FROM "_prisma_migrations"
  `))[0];
  const unvalidatedConstraints = await rows(`
    SELECT conrelid::regclass::text AS table_name, conname, contype
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace AND NOT convalidated
    ORDER BY 1, 2
  `);
  const foreignKeyCount = await scalar(`
    SELECT COUNT(*)::int AS value
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace AND contype = 'f'
  `);
  const indexNames = new Set((await rows(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`)).map((row) => row.indexname));
  const requiredIndexes = [
    "CompanyUser_companyId_userId_key",
    "WhatsAppSession_accountId_key",
    "WhatsAppGroup_accountId_externalGroupId_key",
    "Contact_accountId_externalContactId_key",
    "SupportTicketMessage_ticketId_clientMessageId_key",
    "SupportTicket_status_lastMessageAt_id_idx",
    "SupportTicket_subject_trgm_idx",
    "SupportTicket_title_trgm_idx",
    "SupportTicketMessage_message_trgm_idx",
  ];
  const missingIndexes = requiredIndexes.filter((name) => !indexNames.has(name));

  const integrity = {
    duplicateMemberships: await scalar(`SELECT COUNT(*)::int AS value FROM (SELECT "companyId", "userId" FROM "CompanyUser" GROUP BY 1,2 HAVING COUNT(*) > 1) x`),
    duplicateSessions: await scalar(`SELECT COUNT(*)::int AS value FROM (SELECT "accountId" FROM "WhatsAppSession" GROUP BY 1 HAVING COUNT(*) > 1) x`),
    duplicateGroups: await scalar(`SELECT COUNT(*)::int AS value FROM (SELECT "accountId", "externalGroupId" FROM "WhatsAppGroup" GROUP BY 1,2 HAVING COUNT(*) > 1) x`),
    duplicateContacts: await scalar(`SELECT COUNT(*)::int AS value FROM (SELECT "accountId", "externalContactId" FROM "Contact" GROUP BY 1,2 HAVING COUNT(*) > 1) x`),
    groupCompanyMismatch: await scalar(`SELECT COUNT(*)::int AS value FROM "WhatsAppGroup" g JOIN "WhatsAppAccount" a ON a.id = g."accountId" WHERE g."companyId" <> a."companyId"`),
    groupUserMismatch: await scalar(`SELECT COUNT(*)::int AS value FROM "WhatsAppGroup" g JOIN "WhatsAppAccount" a ON a.id = g."accountId" WHERE g."userId" IS NOT NULL AND g."userId" <> a."userId"`),
    contactCompanyMismatch: await scalar(`SELECT COUNT(*)::int AS value FROM "Contact" c JOIN "WhatsAppAccount" a ON a.id = c."accountId" WHERE c."companyId" <> a."companyId"`),
    contactUserMismatch: await scalar(`SELECT COUNT(*)::int AS value FROM "Contact" c JOIN "WhatsAppAccount" a ON a.id = c."accountId" WHERE c."userId" IS NOT NULL AND c."userId" <> a."userId"`),
    encryptedSnapshotRows: await scalar(`SELECT COUNT(*)::int AS value FROM "WhatsAppSession" WHERE "sessionDataEncrypted" IS NOT NULL`),
    snapshotMetadataWithoutSnapshot: await scalar(`
      SELECT COUNT(*)::int AS value
      FROM "WhatsAppAccount" a
      LEFT JOIN "WhatsAppSession" s ON s."accountId" = a.id AND s."sessionDataEncrypted" IS NOT NULL
      WHERE a."sessionSnapshotAt" IS NOT NULL AND s.id IS NULL
    `),
  };
  const criticalTables = ["User", "Company", "CompanyUser", "Subscription", "WhatsAppAccount", "WhatsAppSession", "WhatsAppGroup", "Contact", "Category", "MessageCampaign", "MessageRecipient", "SupportTicket", "SupportTicketMessage", "AuditLog"];
  const rowCounts = {};
  for (const table of criticalTables) {
    rowCounts[table] = await scalar(`SELECT COUNT(*)::int AS value FROM "${table}"`);
  }

  const criticalIntegrityKeys = Object.keys(integrity).filter((key) => !["encryptedSnapshotRows", "snapshotMetadataWithoutSnapshot"].includes(key));
  const criticalFailures = criticalIntegrityKeys.filter((key) => integrity[key] !== 0);
  if (args.has("--strict-snapshot-metadata") && integrity.snapshotMetadataWithoutSnapshot !== 0) criticalFailures.push("snapshotMetadataWithoutSnapshot");
  const report = {
    generatedAt: new Date().toISOString(),
    databaseInfo,
    migrationState,
    foreignKeyCount,
    unvalidatedConstraints,
    requiredIndexes,
    missingIndexes,
    integrity,
    rowCounts,
    status: migrationState.incomplete === 0 && unvalidatedConstraints.length === 0 && missingIndexes.length === 0 && criticalFailures.length === 0 ? "PASS" : "FAIL",
    warnings: integrity.snapshotMetadataWithoutSnapshot ? ["WHATSAPP_SNAPSHOT_METADATA_WITHOUT_ENCRYPTED_SNAPSHOT"] : [],
    criticalFailures,
  };
  const output = `${JSON.stringify(report, null, 2)}\n`;
  console.log(output.trim());
  const outputArg = process.argv.find((value) => value.startsWith("--output="));
  if (outputArg) await writeFile(path.resolve(outputArg.slice("--output=".length)), output, { mode: 0o600 });
  if (report.status !== "PASS") process.exitCode = 1;
} finally {
  await client.end();
}
