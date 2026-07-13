import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const { prisma } = await import("../src/server/db");

  const [ticketCounts, messageCounts, integrity, duplicateCandidates] = await Promise.all([
  prisma.$queryRawUnsafe<Array<{ status: string; count: number }>>(
    `SELECT "status"::text AS status, COUNT(*)::int AS count
     FROM "SupportTicket"
     GROUP BY "status"
     ORDER BY "status"`,
  ),
  prisma.$queryRawUnsafe<Array<{ senderType: string; isInternal: boolean; count: number }>>(
    `SELECT "senderType"::text AS "senderType", "isInternal", COUNT(*)::int AS count
     FROM "SupportTicketMessage"
     GROUP BY "senderType", "isInternal"
     ORDER BY "senderType", "isInternal"`,
  ),
  prisma.$queryRawUnsafe<Array<Record<string, number>>>(
    `SELECT
      (SELECT COUNT(*)::int FROM "SupportTicket") AS tickets,
      (SELECT COUNT(*)::int FROM "SupportTicketMessage") AS messages,
      (SELECT COUNT(*)::int FROM "SupportTicket" t LEFT JOIN "User" u ON u.id = t."createdById" WHERE u.id IS NULL) AS orphan_creators,
      (SELECT COUNT(*)::int FROM "SupportTicket" t LEFT JOIN "Company" c ON c.id = t."companyId" WHERE c.id IS NULL) AS orphan_companies,
      (SELECT COUNT(*)::int FROM "SupportTicketMessage" m LEFT JOIN "SupportTicket" t ON t.id = m."ticketId" WHERE t.id IS NULL) AS orphan_messages,
      (SELECT COUNT(*)::int FROM "SupportTicket" t WHERE NOT EXISTS (SELECT 1 FROM "SupportTicketMessage" m WHERE m."ticketId" = t.id)) AS tickets_without_messages,
      (SELECT COUNT(*)::int FROM "SupportTicket" WHERE COALESCE(TRIM("subject"), '') = '') AS empty_subjects,
      (SELECT COUNT(*)::int FROM "SupportTicket" WHERE COALESCE(TRIM("category"), '') = '') AS empty_categories,
      (SELECT COUNT(*)::int FROM "SupportTicket" WHERE "tenantId" <> "companyId" OR "userId" <> "createdById") AS identity_mismatches`,
  ),
  prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count FROM (
      SELECT "createdById", "subject", date_trunc('minute', "createdAt"), COUNT(*)
      FROM "SupportTicket"
      GROUP BY "createdById", "subject", date_trunc('minute', "createdAt")
      HAVING COUNT(*) > 1
    ) duplicates`,
  ),
  ]);

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    integrity: integrity[0],
    ticketCounts,
    messageCounts,
    duplicateCandidateGroups: duplicateCandidates[0]?.count ?? 0,
  }, null, 2));

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
