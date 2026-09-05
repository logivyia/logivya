import { prisma } from "@/server/db";

export async function ownedMonthlyMessageMetrics(companyId: string, userId: string, requestedTimezone: string, now = new Date()) {
  let timezone = requestedTimezone;
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(now); } catch { timezone = "Europe/Istanbul"; }
  const rows = await prisma.$queryRaw<Array<{ sent: bigint; failed: bigint; startsAt: Date; endsAt: Date }>>`
    WITH period AS (SELECT
      date_trunc('month', ${now}::timestamptz AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone} AS start_time,
      (date_trunc('month', ${now}::timestamptz AT TIME ZONE ${timezone}) + interval '1 month') AT TIME ZONE ${timezone} AS end_time)
    SELECT count(r.id) FILTER (WHERE r."sentAt" >= (p.start_time AT TIME ZONE 'UTC') AND r."sentAt" < (p.end_time AT TIME ZONE 'UTC')) AS sent,
      count(r.id) FILTER (WHERE r.status = 'FAILED' AND r."failedAt" >= (p.start_time AT TIME ZONE 'UTC') AND r."failedAt" < (p.end_time AT TIME ZONE 'UTC')) AS failed,
      p.start_time AS "startsAt", p.end_time AS "endsAt"
    FROM period p LEFT JOIN "MessageRecipient" r ON
      ((r."sentAt" >= (p.start_time AT TIME ZONE 'UTC') AND r."sentAt" < (p.end_time AT TIME ZONE 'UTC')) OR (r."failedAt" >= (p.start_time AT TIME ZONE 'UTC') AND r."failedAt" < (p.end_time AT TIME ZONE 'UTC')))
      AND EXISTS (SELECT 1 FROM "MessageCampaign" c WHERE c.id = r."campaignId" AND c."companyId" = ${companyId} AND c."createdById" = ${userId})
    GROUP BY p.start_time, p.end_time`;
  const row = rows[0];
  return { sent: Number(row.sent), failed: Number(row.failed), startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), timezone };
}
