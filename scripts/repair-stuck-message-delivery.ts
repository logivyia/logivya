import type { JobsOptions, Queue } from "bullmq";
import { prisma } from "@/server/db";
import { readCampaignCorrelationId } from "@/server/messages/correlation";
import { inspectMessageDeliveryQueueReadiness } from "@/server/messages/delivery-readiness";
import { updateMessageCampaignDeliveryAggregate } from "@/server/messages/delivery-state";
import { logger } from "@/server/observability/logger";
import { messageQueue } from "@/server/queues/client";
import { SCHEDULED_MESSAGE_JOB_OPTIONS, WHATSAPP_MESSAGE_JOB_OPTIONS } from "@/server/queues/contracts";

const ACTIVE_JOB_STATES = new Set(["active", "waiting", "delayed", "prioritized", "waiting-children"]);

function argValue(name: string, fallback: string) {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function boundedInteger(value: string, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(parsed, max)) : fallback;
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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

async function failRecipient(recipientId: string, campaignId: string, errorCode: string, apply: boolean) {
  if (!apply) return;
  await prisma.messageRecipient.update({
    where: { id: recipientId },
    data: {
      status: "FAILED",
      failedAt: new Date(),
      errorMessage: errorCode,
    },
  });
  await updateMessageCampaignDeliveryAggregate(campaignId, { correlationId: `REPAIR-${campaignId.slice(-12)}` });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const limit = boundedInteger(argValue("--limit", "200"), 200, 1, 2_000);
  const staleMinutes = boundedInteger(argValue("--stale-minutes", "15"), 15, 1, 24 * 60);
  const staleBefore = new Date(Date.now() - staleMinutes * 60_000);
  const now = new Date();
  const summary = {
    mode: apply ? "apply" : "dry-run",
    inspected: 0,
    activeJobSkipped: 0,
    requeued: 0,
    failed: 0,
    skipped: 0,
    queueReady: false,
    queueReason: null as string | null,
  };

  const readiness = await inspectMessageDeliveryQueueReadiness({ scheduleType: "SEND_NOW", force: true });
  summary.queueReady = readiness.every((queue) => (queue.workerCount ?? 0) > 0 && !queue.paused);
  if (!summary.queueReady) {
    summary.queueReason = readiness
      .map((queue) => `${queue.queueName}:${queue.workerCount ?? "unknown"}:${queue.paused ? "paused" : "active"}`)
      .join(",");
  }

  const recipients = await prisma.messageRecipient.findMany({
    where: {
      status: { in: ["PENDING", "RETRYING", "SENDING"] },
      updatedAt: { lt: staleBefore },
      campaign: {
        deletedAt: null,
        status: { in: ["QUEUED", "SENDING"] },
        OR: [
          { scheduleType: "SEND_NOW" },
          { scheduleType: "SCHEDULED", scheduledAt: { lte: now } },
          { scheduleType: "RECURRING", recurringOccurrenceKey: { not: null } },
        ],
      },
    },
    include: {
      campaign: { select: { id: true, companyId: true, createdById: true, scheduleType: true, scheduledAt: true, contentJson: true } },
      account: { select: { id: true, companyId: true, userId: true, archivedAt: true } },
      group: { select: { id: true, companyId: true, userId: true, accountId: true, isArchived: true } },
      contact: { select: { id: true, companyId: true, userId: true, accountId: true, isActive: true, isWhatsAppUser: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  summary.inspected = recipients.length;

  let queue: Queue | null = null;
  let activeRecipientIds = new Set<string>();
  if (summary.queueReady) {
    queue = messageQueue();
    const activeJobs = await queue.getJobs(["active", "waiting", "delayed", "prioritized", "waiting-children"], 0, Math.max(limit * 5, 500), false);
    activeRecipientIds = new Set(activeJobs.map((job) => (job.data as { recipientId?: string }).recipientId).filter((id): id is string => Boolean(id)));
  }

  try {
    for (const recipient of recipients) {
      const target = recipient.targetType === "CONTACT" ? recipient.contact : recipient.group;
      const targetMissing = !target;
      const targetArchived = recipient.targetType === "CONTACT"
        ? recipient.contact && (!recipient.contact.isActive || !recipient.contact.isWhatsAppUser)
        : recipient.group?.isArchived;
      const ownershipMismatch = Boolean(
        target &&
        (target.companyId !== recipient.campaign.companyId ||
          target.userId !== recipient.campaign.createdById ||
          target.accountId !== recipient.accountId ||
          recipient.account.companyId !== recipient.campaign.companyId ||
          recipient.account.userId !== recipient.campaign.createdById ||
          recipient.account.archivedAt),
      );

      if (targetMissing || targetArchived || ownershipMismatch) {
        const errorCode = targetMissing
          ? "MESSAGE_TARGET_MISSING"
          : targetArchived
            ? "MESSAGE_TARGET_NOT_SENDABLE"
            : "MESSAGE_TARGET_OWNERSHIP_MISMATCH";
        await failRecipient(recipient.id, recipient.campaignId, errorCode, apply);
        summary.failed += 1;
        logger.warn("message.repair.failed_stale_recipient", { recipientId: recipient.id, campaignId: recipient.campaignId, targetType: recipient.targetType, errorCode, apply });
        continue;
      }

      if (!summary.queueReady || !queue) {
        await failRecipient(recipient.id, recipient.campaignId, summary.queueReason ? "MESSAGE_QUEUE_NO_CONSUMER" : "MESSAGE_QUEUE_UNAVAILABLE", apply);
        summary.failed += 1;
        continue;
      }

      if (activeRecipientIds.has(recipient.id)) {
        summary.activeJobSkipped += 1;
        continue;
      }

      if (apply) {
        await prisma.messageRecipient.update({
          where: { id: recipient.id },
          data: { status: "RETRYING", errorMessage: "QUEUE_REPAIR_REQUEUED", failedAt: null },
        });
        const correlationId = readCampaignCorrelationId(recipient.campaign.contentJson) ?? `REPAIR-${recipient.campaignId.slice(-12)}`;
        const delay = recipient.campaign.scheduleType === "SCHEDULED" && recipient.campaign.scheduledAt
          ? Math.max(0, recipient.campaign.scheduledAt.getTime() - Date.now())
          : 0;
        const added = await ensureJob(queue, "send-recipient", {
          companyId: recipient.campaign.companyId,
          campaignId: recipient.campaignId,
          recipientId: recipient.id,
          correlationId,
          source: "retry",
        }, {
          ...(recipient.campaign.scheduleType === "SCHEDULED" ? SCHEDULED_MESSAGE_JOB_OPTIONS : WHATSAPP_MESSAGE_JOB_OPTIONS),
          jobId: `repair-recipient-${recipient.id}`,
          delay,
        });
        if (!added) {
          summary.activeJobSkipped += 1;
          continue;
        }
        await updateMessageCampaignDeliveryAggregate(recipient.campaignId, { correlationId });
      }
      summary.requeued += 1;
    }
  } finally {
    await queue?.close().catch(() => undefined);
    await prisma.$disconnect();
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: safeErrorMessage(error) }, null, 2));
  process.exitCode = 1;
});
