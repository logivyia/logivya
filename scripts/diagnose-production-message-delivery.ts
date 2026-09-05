import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 15_000) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), timeoutMs);
      timer.unref?.();
    }),
  ]);
}

function ageMinutes(value: Date | number | null | undefined) {
  if (!value) return null;
  const timestamp = value instanceof Date ? value.getTime() : value;
  return Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

async function main() {
  const [{ prisma }, { messageQueue }] = await Promise.all([
    import("@/server/db"),
    import("@/server/queues/client"),
  ]);
  const queue = messageQueue();
  const staleBefore = new Date(Date.now() - 15 * 60_000);
  const recentSince = new Date(Date.now() - 24 * 60 * 60_000);

  try {
    const [queueCounts, workers, jobs, staleByStatus, recentCampaigns] = await Promise.all([
      withTimeout(queue.getJobCounts("waiting", "active", "delayed", "failed", "completed"), "QUEUE_COUNTS"),
      withTimeout(queue.getWorkersCount(), "QUEUE_WORKERS"),
      withTimeout(queue.getJobs(["active", "waiting", "delayed", "failed"], 0, 199, false), "QUEUE_JOBS"),
      withTimeout(prisma.messageRecipient.groupBy({
        by: ["status"],
        where: {
          status: { in: ["PENDING", "RETRYING", "SENDING"] },
          updatedAt: { lt: staleBefore },
          campaign: { deletedAt: null, status: { in: ["QUEUED", "SENDING"] } },
        },
        _count: { _all: true },
      }), "STALE_RECIPIENT_COUNTS"),
      withTimeout(prisma.messageCampaign.findMany({
        where: {
          createdAt: { gte: recentSince },
          deletedAt: null,
          status: { in: ["QUEUED", "SENDING", "COMPLETED", "FAILED"] },
        },
        select: {
          id: true,
          status: true,
          scheduleType: true,
          totalRecipients: true,
          sentCount: true,
          failedCount: true,
          createdAt: true,
          updatedAt: true,
          recipients: {
            select: {
              id: true,
              accountId: true,
              targetType: true,
              status: true,
              attemptCount: true,
              errorMessage: true,
              sentAt: true,
              createdAt: true,
              updatedAt: true,
              account: {
                select: {
                  status: true,
                  archivedAt: true,
                  lastConnectedAt: true,
                  lastHeartbeatAt: true,
                  lastError: true,
                  sessionSnapshotAt: true,
                  sessions: {
                    select: {
                      status: true,
                      updatedAt: true,
                      sessionDataEncrypted: true,
                    },
                    take: 1,
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }), "RECENT_CAMPAIGNS", 30_000),
    ]);

    const jobSummaries = await Promise.all(jobs.map(async (job) => ({
      id: job.id,
      name: job.name,
      state: await withTimeout(job.getState(), `JOB_STATE_${job.id}`, 5_000).catch(() => "unknown"),
      recipientId: (job.data as { recipientId?: string }).recipientId ?? null,
      campaignId: (job.data as { campaignId?: string }).campaignId ?? null,
      source: (job.data as { source?: string }).source ?? null,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
      ageMinutes: ageMinutes(job.timestamp),
      activeMinutes: ageMinutes(job.processedOn),
      delayMs: job.delay,
      failureCode: job.failedReason?.slice(0, 120) ?? null,
    })));

    const activeRecipientIds = new Set(
      jobSummaries.filter((job) => job.state === "active").map((job) => job.recipientId).filter(Boolean),
    );
    const affectedCampaigns = recentCampaigns
      .map((campaign) => ({
        id: campaign.id,
        status: campaign.status,
        scheduleType: campaign.scheduleType,
        createdAgeMinutes: ageMinutes(campaign.createdAt),
        updatedAgeMinutes: ageMinutes(campaign.updatedAt),
        counters: {
          total: campaign.totalRecipients,
          sent: campaign.sentCount,
          failed: campaign.failedCount,
        },
        recipients: campaign.recipients.map((recipient) => {
          const session = recipient.account.sessions[0];
          return {
            id: recipient.id,
            accountId: recipient.accountId,
            targetType: recipient.targetType,
            status: recipient.status,
            attemptCount: recipient.attemptCount,
            ageMinutes: ageMinutes(recipient.createdAt),
            updatedAgeMinutes: ageMinutes(recipient.updatedAt),
            activeInQueue: activeRecipientIds.has(recipient.id),
            errorCode: recipient.errorMessage?.slice(0, 120) ?? null,
            account: {
              status: recipient.account.status,
              archived: Boolean(recipient.account.archivedAt),
              lastConnectedAgeMinutes: ageMinutes(recipient.account.lastConnectedAt),
              lastHeartbeatAgeMinutes: ageMinutes(recipient.account.lastHeartbeatAt),
              snapshotAgeMinutes: ageMinutes(recipient.account.sessionSnapshotAt),
              lastErrorCode: recipient.account.lastError?.slice(0, 120) ?? null,
              sessionRow: Boolean(session),
              sessionStatus: session?.status ?? null,
              sessionPayloadPresent: Boolean(session?.sessionDataEncrypted),
              sessionUpdatedAgeMinutes: ageMinutes(session?.updatedAt),
            },
          };
        }),
      }))
      .filter((campaign) => campaign.recipients.some((recipient) =>
        ["PENDING", "RETRYING", "SENDING", "FAILED"].includes(recipient.status)
      ));

    console.log(JSON.stringify({
      checkedAt: new Date().toISOString(),
      queue: { workerCount: workers, counts: queueCounts, jobs: jobSummaries },
      database: { staleByStatus, affectedCampaigns },
    }, null, 2));
  } finally {
    await queue.close().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
