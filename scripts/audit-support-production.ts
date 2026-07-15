import { Client } from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

async function count(client: Client, sql: string) {
  const result = await client.query(sql);
  return Number(result.rows[0]?.count ?? 0);
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const checks = {
      tickets: await count(client, `SELECT COUNT(*) AS count FROM "SupportTicket"`),
      messages: await count(client, `SELECT COUNT(*) AS count FROM "SupportTicketMessage" WHERE "deletedAt" IS NULL`),
      ticketsWithoutMessages: await count(client, `
        SELECT COUNT(*) AS count
        FROM "SupportTicket" ticket
        WHERE NOT EXISTS (
          SELECT 1 FROM "SupportTicketMessage" message
          WHERE message."ticketId" = ticket.id AND message."deletedAt" IS NULL
        )
      `),
      ticketCompanyOrphans: await count(client, `
        SELECT COUNT(*) AS count FROM "SupportTicket" ticket
        LEFT JOIN "Company" company ON company.id = ticket."companyId"
        WHERE company.id IS NULL
      `),
      ticketCreatorOrphans: await count(client, `
        SELECT COUNT(*) AS count FROM "SupportTicket" ticket
        LEFT JOIN "User" creator ON creator.id = ticket."createdById"
        WHERE creator.id IS NULL
      `),
      tenantCompanyMismatches: await count(client, `
        SELECT COUNT(*) AS count FROM "SupportTicket"
        WHERE "tenantId" <> "companyId"
      `),
      userCreatorMismatches: await count(client, `
        SELECT COUNT(*) AS count FROM "SupportTicket"
        WHERE "userId" <> "createdById"
      `),
      messageOrphans: await count(client, `
        SELECT COUNT(*) AS count FROM "SupportTicketMessage" message
        LEFT JOIN "SupportTicket" ticket ON ticket.id = message."ticketId"
        WHERE ticket.id IS NULL
      `),
      failedOutbox: await count(client, `SELECT COUNT(*) AS count FROM "SupportNotificationOutbox" WHERE status = 'FAILED'`),
      pendingOutbox: await count(client, `SELECT COUNT(*) AS count FROM "SupportNotificationOutbox" WHERE status = 'PENDING'`),
      staleProcessingOutbox: await count(client, `
        SELECT COUNT(*) AS count FROM "SupportNotificationOutbox"
        WHERE status = 'PROCESSING' AND "updatedAt" < CURRENT_TIMESTAMP - INTERVAL '10 minutes'
      `),
    };
    const integrityFailures = checks.ticketCompanyOrphans
      + checks.ticketCreatorOrphans
      + checks.tenantCompanyMismatches
      + checks.userCreatorMismatches
      + checks.messageOrphans;
    console.log(JSON.stringify({
      ok: integrityFailures === 0,
      generatedAt: new Date().toISOString(),
      integrityFailures,
      checks,
      migrationBackfillCandidates: checks.ticketsWithoutMessages,
    }, null, 2));
    if (integrityFailures > 0) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
