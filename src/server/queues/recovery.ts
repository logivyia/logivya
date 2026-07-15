import type { JobsOptions, Queue } from "bullmq";
import { prisma } from "@/server/db";
import { readCampaignCorrelationId, readCampaignMetadata } from "@/server/messages/correlation";
import { logger } from "@/server/observability/logger";
import { campaignQueue, messageQueue } from "@/server/queues/client";
import {
  SCHEDULED_MESSAGE_JOB_OPTIONS,
  WHATSAPP_DELETE_JOB_OPTIONS,
  WHATSAPP_MESSAGE_JOB_OPTIONS,
  type DeleteForEveryoneJob,
} from "@/server/queues/contracts";
import { nextRecurringRunAfter, parseRecurringRule, recurringJobId } from "@/server/queues/recurring";

type QueueRecoveryResult = {
  resetStaleRecipients: number;
  resetStaleDeletes: number;
  recipientJobs: number;
  deleteJobs: number;
  recurringJobs: number;
  skipped: number;
};

const ACTIVE_JOB_STATES = new Set(["active", "waiting", "delayed", "prioritized", "waiting-children"]);

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(parsed, max)) : fallback;
}

async function ensureJob(
  queue: Queue,
  name: string,
  data: object,
  options: JobsOptions & { jobId: string },
) {
  const existing = await queue.getJob(options.jobId);
  if (existing) {
    const state = await existing.getState();
    if (ACTIVE_JOB_STATES.has(state)) return false;
    await existing.remove().catch(() => undefined);
  }
  await queue.add(name, data, options);
  return true;
}

function isRecurringOccurrence(contentJson: unknown, occurrenceKey: string | null) {
  if (occurrenceKey) return true;
  const metadata = readCampaignMetadata(contentJson);
  return metadata.source === "recurring" && typeof metadata.templateCampaignId === "string";
}

export async function scheduleFollowingRecurringRun(input: {
  templateCampaignId: string;
  companyId: string;
  recurringRule: unknown;
  currentRunAt: Date;
  correlationId?: string;
}) {
  const rule = parseRecurringRule(input.recurringRule);
  if (!rule) throw new Error("RECURRING_RULE_INVALID");
  const nextRunAt = new Date(nextRecurringRunAfter(rule, input.currentRunAt.getTime()));
  const updated = await prisma.messageCampaign.updateMany({
    where: {
      id: input.templateCampaignId,
      companyId: input.companyId,
      deletedAt: null,
      scheduleType: "RECURRING",
      status: { notIn: ["CANCELED", "DELETED"] },
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: nextRunAt } }],
    },
    data: { nextRunAt },
  });
  if (!updated.count) return null;

  const queue = campaignQueue();
  const payload = input.correlationId
    ? { companyId: input.companyId, templateCampaignId: input.templateCampaignId, correlationId: input.correlationId, runAt: nextRunAt.toISOString() }
    : { companyId: input.companyId, templateCampaignId: input.templateCampaignId, runAt: nextRunAt.toISOString() };
  try {
    await ensureJob(queue, "recurring-run", payload, {
      jobId: recurringJobId(input.templateCampaignId, nextRunAt.getTime()),
      delay: Math.max(0, nextRunAt.getTime() - Date.now()),
    });
  } finally {
    await queue.close().catch(() => undefined);
  }
  return nextRunAt;
}

export async function reconcileDurableMessageQueues(): Promise<QueueRecoveryResult> {
  const startedAt = Date.now();
  const batchSize = boundedInteger(process.env.QUEUE_RECOVERY_BATCH_SIZE, 500, 1, 5_000);
  const staleBefore = new Date(Date.now() - boundedInteger(process.env.QUEUE_RECOVERY_STALE_CLAIM_MS, 10 * 60_000, 60_000, 24 * 60 * 60_000));
  const result: QueueRecoveryResult = {
    resetStaleRecipients: 0,
    resetStaleDeletes: 0,
    recipientJobs: 0,
    deleteJobs: 0,
    recurringJobs: 0,
    skipped: 0,
  };

  const reset = await prisma.messageRecipient.updateMany({
    where: {
      status: "SENDING",
      updatedAt: { lt: staleBefore },
      campaign: { deletedAt: null, status: { in: ["QUEUED", "SENDING"] } },
    },
    data: { status: "RETRYING", errorMessage: "QUEUE_RECOVERY_RETRY" },
  });
  result.resetStaleRecipients = reset.count;

  const resetDeletes = await prisma.messageRecipient.updateMany({
    where: {
      status: "SENT",
      deleteForEveryoneStatus: "PROCESSING",
      deleteForEveryoneAttemptedAt: { lt: staleBefore },
      platformDeletedAt: null,
      campaign: { deletedAt: null },
      account: { archivedAt: null },
    },
    data: {
      deleteForEveryoneStatus: "PENDING",
      deleteForEveryoneError: "QUEUE_RECOVERY_RETRY",
    },
  });
  result.resetStaleDeletes = resetDeletes.count;

  const recipients = await prisma.messageRecipient.findMany({
    where: {
      status: { in: ["PENDING", "RETRYING"] },
      campaign: { deletedAt: null, status: { in: ["QUEUED", "SENDING"] } },
    },
    select: {
      id: true,
      campaignId: true,
      campaign: {
        select: {
          companyId: true,
          scheduleType: true,
          scheduledAt: true,
          recurringOccurrenceKey: true,
          contentJson: true,
        },
      },
    },
    orderBy: { updatedAt: "asc" },
    take: batchSize,
  });

  const sendQueue = messageQueue();
  try {
    for (const recipient of recipients) {
      if (recipient.campaign.scheduleType === "RECURRING" && !isRecurringOccurrence(recipient.campaign.contentJson, recipient.campaign.recurringOccurrenceKey)) {
        result.skipped += 1;
        continue;
      }
      const correlationId = readCampaignCorrelationId(recipient.campaign.contentJson) ?? `RECOVERY-${recipient.campaignId.slice(-12)}`;
      const delay = recipient.campaign.scheduleType === "SCHEDULED" && recipient.campaign.scheduledAt
        ? Math.max(0, recipient.campaign.scheduledAt.getTime() - Date.now())
        : 0;
      const jobId = `recovery-recipient-${recipient.id}`;
      const added = await ensureJob(
        sendQueue,
        "send-recipient",
        {
          companyId: recipient.campaign.companyId,
          campaignId: recipient.campaignId,
          recipientId: recipient.id,
          correlationId,
          source: "retry",
        },
        {
          ...(recipient.campaign.scheduleType === "SCHEDULED" ? SCHEDULED_MESSAGE_JOB_OPTIONS : WHATSAPP_MESSAGE_JOB_OPTIONS),
          jobId,
          delay,
        },
      );
      if (added) result.recipientJobs += 1;
      else result.skipped += 1;
    }

    const pendingDeletes = await prisma.messageRecipient.findMany({
      where: {
        status: "SENT",
        deleteForEveryoneStatus: "PENDING",
        platformDeletedAt: null,
        campaign: { deletedAt: null },
        account: { archivedAt: null },
      },
      select: {
        id: true,
        campaignId: true,
        accountId: true,
        targetType: true,
        recipientExternalId: true,
        messageKeyJson: true,
        campaign: { select: { companyId: true, createdById: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: batchSize,
    });
    for (const recipient of pendingDeletes) {
      if (!recipient.messageKeyJson) {
        result.skipped += 1;
        continue;
      }
      const payload: DeleteForEveryoneJob = {
        companyId: recipient.campaign.companyId,
        campaignId: recipient.campaignId,
        recipientId: recipient.id,
        whatsappAccountId: recipient.accountId,
        groupJid: recipient.targetType === "GROUP" ? recipient.recipientExternalId : undefined,
        targetJid: recipient.recipientExternalId,
        targetType: recipient.targetType,
        messageKeyJson: recipient.messageKeyJson,
        userId: recipient.campaign.createdById,
        correlationId: `DEL-RECOVERY-${recipient.id.slice(-12)}`,
      };
      const added = await ensureJob(sendQueue, "delete-for-everyone", payload, {
        ...WHATSAPP_DELETE_JOB_OPTIONS,
        jobId: `recovery-delete-${recipient.id}`,
      });
      if (added) result.deleteJobs += 1;
      else result.skipped += 1;
    }
  } finally {
    await sendQueue.close().catch(() => undefined);
  }

  const templates = await prisma.messageCampaign.findMany({
    where: {
      scheduleType: "RECURRING",
      recurringOccurrenceKey: null,
      deletedAt: null,
      status: { notIn: ["CANCELED", "DELETED"] },
    },
    select: { id: true, companyId: true, createdAt: true, nextRunAt: true, recurringRule: true, contentJson: true },
    orderBy: { createdAt: "asc" },
    take: batchSize * 2,
  });
  const recurringQueue = campaignQueue();
  try {
    for (const template of templates) {
      if (isRecurringOccurrence(template.contentJson, null)) {
        result.skipped += 1;
        continue;
      }
      const rule = parseRecurringRule(template.recurringRule);
      if (!rule) {
        result.skipped += 1;
        logger.error("queue.recovery.recurring_rule_invalid", new Error("RECURRING_RULE_INVALID"), { campaignId: template.id, companyId: template.companyId });
        continue;
      }
      const runAt = template.nextRunAt ?? new Date(nextRecurringRunAfter(rule, template.createdAt.getTime()));
      if (!template.nextRunAt) {
        await prisma.messageCampaign.updateMany({ where: { id: template.id, nextRunAt: null }, data: { nextRunAt: runAt } });
      }
      const correlationId = readCampaignCorrelationId(template.contentJson);
      const payload = correlationId
        ? { companyId: template.companyId, templateCampaignId: template.id, correlationId, runAt: runAt.toISOString() }
        : { companyId: template.companyId, templateCampaignId: template.id, runAt: runAt.toISOString() };
      const added = await ensureJob(recurringQueue, "recurring-run", payload, {
        jobId: recurringJobId(template.id, runAt.getTime()),
        delay: Math.max(0, runAt.getTime() - Date.now()),
      });
      if (added) result.recurringJobs += 1;
      else result.skipped += 1;
    }
  } finally {
    await recurringQueue.close().catch(() => undefined);
  }

  logger.info("queue.recovery.completed", { ...result, durationMs: Date.now() - startedAt });
  return result;
}
