import "./health";
import { Worker, type Job } from "bullmq";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { QUEUES, WHATSAPP_MESSAGE_JOB_OPTIONS } from "@/server/queues/contracts";
import { BaileysWhatsAppProvider } from "@/worker/baileys-provider";
import { nextRecurringRunAt, recurringJobId, type RecurringRule } from "@/server/queues/recurring";
import { campaignQueue, deadLetterQueue, messageQueue, redisConnectionOptions, whatsappQueue } from "@/server/queues/client";
import { logger } from "@/server/observability/logger";
import { cleanupStuckWhatsAppAccounts } from "@/server/whatsapp/cleanup";
import { writeWorkerHeartbeat } from "@/server/whatsapp/worker-heartbeat";
import { pairingUserMessage } from "@/server/whatsapp/pairing-errors";
import { resolveSendableWhatsAppGroups } from "@/server/whatsapp/sendable-groups";
import { createNotification, NOTIFICATION_TYPES } from "@/server/notifications/service";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { createMessageCorrelationId, readCampaignCorrelationId, withCampaignMetadata } from "@/server/messages/correlation";
import { traceMessageStage } from "@/server/messages/delivery-tracing";
import { isDeleteWindowOpen, parseStoredMessageKey, updateCampaignDeleteAggregate } from "@/server/messages/delete-for-everyone";
import type { MessageRecipientJobPayload } from "@/server/messages/delivery-pipeline";
import type { DeleteForEveryoneJob } from "@/server/queues/contracts";
/**
 * CRITICAL LOGIVYA WHATSAPP CONNECTION MODULE.
 * Do not modify without running the full WhatsApp regression test suite.
 */
import os from "node:os";
import { hasRestorableWhatsAppCredentials, restoreWhatsAppSessionFromDatabase } from "@/lib/whatsapp/session-manager";

if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required");
const connection = redisConnectionOptions();
const provider = new BaileysWhatsAppProvider();
const workerId = process.env.WORKER_ID || `${os.hostname()}-${process.pid}`;
const workers: Worker[] = [];

process.on("uncaughtException", (error) => {
  logger.error("worker.crash.prevented", error, { workerId, type: "uncaughtException" });
});

process.on("unhandledRejection", (reason) => {
  logger.error("worker.crash.prevented", reason instanceof Error ? reason : new Error(String(reason)), { workerId, type: "unhandledRejection" });
});

function isRecoverableWhatsAppSendError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /WHATSAPP_RECONNECT_REQUIRED|WHATSAPP_SESSION_CONNECTION_TIMEOUT|Connection Closed|Timed Out|restart|disconnected|socket/i.test(message);
}

function registerWorker(name: string, worker: Worker) {
  workers.push(worker);
  logger.info("worker.queue.registered", { workerId, queue: name });
  worker.on("ready", () => logger.info("worker.queue.ready", { workerId, queue: name }));
  worker.on("active", (job) => {
    const data = job.data as { correlationId?: string };
    logger.info("worker.job.received", { workerId, queue: name, jobId: job.id, jobName: job.name, correlationId: data.correlationId });
    if (name === QUEUES.sync) {
      const data = job.data as { action?: string; accountId?: string };
      logger.info("whatsapp.worker.job.received", { workerId, queue: name, jobId: job.id, jobName: job.name, action: data.action, accountId: data.accountId });
    }
  });
  worker.on("completed", (job) => logger.info("worker.job.completed", { workerId, queue: name, jobId: job.id, jobName: job.name, correlationId: (job.data as { correlationId?: string }).correlationId }));
  worker.on("failed", (job, error) => logger.error("worker.job.failed", error, { workerId, queue: name, jobId: job?.id, jobName: job?.name, correlationId: (job?.data as { correlationId?: string } | undefined)?.correlationId }));
  worker.on("error", (error) => logger.error("worker.queue.error", error, { workerId, queue: name }));
  return worker;
}

registerWorker(QUEUES.campaign, new Worker(QUEUES.campaign, async (job) => {
  const { templateCampaignId, companyId, correlationId: queuedCorrelationId } = job.data as { templateCampaignId: string; companyId: string; correlationId?: string };
  const template = await prisma.messageCampaign.findFirst({ where: { id: templateCampaignId, companyId, deletedAt: null, scheduleType: "RECURRING" }, include: { recipients: true } });
  const templateCorrelationId = queuedCorrelationId ?? readCampaignCorrelationId(template?.contentJson);
  if (!template || ["CANCELED", "DELETED"].includes(template.status)) return;
  if (!(await subscriptionAccess.canUseRecurringMessages(companyId))) {
    logger.warn("message.recurring.skipped_subscription", { workerId, companyId, templateCampaignId, correlationId: templateCorrelationId });
    return;
  }
  const accountIds = [...new Set(template.recipients.map((recipient) => recipient.accountId).filter(Boolean))];
  if (accountIds.length !== 1) {
    logger.error("message.recurring.invalid_account_scope", new Error("RECURRING_CAMPAIGN_ACCOUNT_SCOPE_INVALID"), { workerId, companyId, templateCampaignId, accountIds, correlationId: templateCorrelationId });
    return;
  }
  let groups: Awaited<ReturnType<typeof resolveSendableWhatsAppGroups>>;
  try {
    groups = await resolveSendableWhatsAppGroups(
      companyId,
      template.recipients.map((recipient) => recipient.groupId).filter((groupId): groupId is string => Boolean(groupId)),
      { userId: template.createdById, accountId: accountIds[0] },
    );
  } catch (error) {
    logger.error("message.recurring.group_resolution_failed", error, { workerId, companyId, templateCampaignId, accountId: accountIds[0], correlationId: templateCorrelationId });
    return;
  }
  if (!groups.length) {
    logger.warn("message.recurring.skipped_no_sendable_groups", { workerId, companyId, templateCampaignId, accountId: accountIds[0], correlationId: templateCorrelationId });
    return;
  }
  const correlationId = createMessageCorrelationId();
  const occurrence = await prisma.messageCampaign.create({
    data: {
      companyId,
      createdById: template.createdById,
      title: template.title,
      content: template.content,
      contentJson: withCampaignMetadata(template.contentJson, { source: "recurring", correlationId, templateCampaignId, templateCorrelationId }),
      type: template.type,
      status: "QUEUED",
      scheduleType: "RECURRING",
      recurringRule: template.recurringRule ?? undefined,
      totalRecipients: groups.length,
      recipients: {
        create: groups.map((group) => ({
          accountId: group.accountId,
          groupId: group.id,
          recipientName: group.name,
          recipientExternalId: group.externalGroupId,
        })),
      },
    },
    include: { recipients: true },
  });
  const queue = messageQueue();
  try {
    for (const [index, recipient] of occurrence.recipients.entries()) {
      const payload: MessageRecipientJobPayload = { companyId, campaignId: occurrence.id, recipientId: recipient.id, correlationId, source: "recurring" };
      await queue.add("send-recipient", payload, {
        jobId: `recipient-${recipient.id}`,
        delay: index * Number(process.env.WHATSAPP_MIN_DELAY_MS || 3000),
        ...WHATSAPP_MESSAGE_JOB_OPTIONS,
      });
    }
  } finally {
    await queue.close().catch(() => undefined);
  }
  const recurringQueue = campaignQueue();
  const nextRunAt = nextRecurringRunAt(template.recurringRule as RecurringRule);
  const nextPayload = templateCorrelationId ? { companyId, templateCampaignId, correlationId: templateCorrelationId } : { companyId, templateCampaignId };
  try {
    await recurringQueue.add("recurring-run", nextPayload, { jobId: recurringJobId(templateCampaignId, nextRunAt), delay: Math.max(0, nextRunAt - Date.now()) });
  } finally {
    await recurringQueue.close().catch(() => undefined);
  }
}, { connection, concurrency: 2 }));

registerWorker(QUEUES.sync, new Worker(QUEUES.sync, async (job) => {
  const { action, accountId, phoneNumber } = job.data as { action: "connect" | "pairing" | "sync" | "disconnect" | "reconnect"; accountId: string; phoneNumber?: string };
  try{
    logger.info("whatsapp.worker.job.received", { workerId, jobId: job.id, action, accountId });
    logger.info("whatsapp.job.received", { workerId, jobId: job.id, action, accountId });
    const account=await prisma.whatsAppAccount.findUnique({where:{id:accountId},select:{status:true,archivedAt:true,updatedAt:true}});
    if(!account||account.archivedAt)return;
    if(action==="connect"&&account.updatedAt<new Date(Date.now()-10*60_000)&&["PENDING_QR","QR_READY"].includes(account.status)){
      await prisma.whatsAppAccount.update({where:{id:accountId},data:{status:"FAILED",lastError:"WHATSAPP_QR_EXPIRED",qrCode:null,qrExpiresAt:null}});
      return;
    }
    if(["connect","reconnect"].includes(action)&&account.status==="ERROR")return;
    if (action === "connect") return provider.createFreshQrSession(accountId);if(action==="pairing"){if(!phoneNumber)throw new Error("Invalid phone number.");return provider.requestPairingCode(accountId,phoneNumber)}if (action === "sync") return provider.syncGroups(accountId);if (action === "disconnect") return provider.disconnect(accountId);return provider.reconnect(accountId)}
  catch(error){const hasCredentials=await hasRestorableWhatsAppCredentials(accountId).catch(()=>false);const status=action==="pairing"||action==="connect"?"FAILED":hasCredentials?"DISCONNECTED":"RECONNECT_REQUIRED";const lastError=action==="pairing"?pairingUserMessage(error):action==="connect"?"WHATSAPP_QR_FAILED":hasCredentials?"WHATSAPP_TRANSIENT_DISCONNECT":"WHATSAPP_CREDENTIALS_MISSING";await prisma.whatsAppAccount.update({where:{id:accountId},data:{status,lastError,qrCode:null,qrExpiresAt:null}});logger.error("whatsapp.job.failed",error,{jobId:job.id,accountId,action,status,lastError});throw error}
}, { connection, concurrency: 5 }));

registerWorker(QUEUES.message, new Worker(QUEUES.message, async (job) => {
  if (job.name === "delete-for-everyone") return processDeleteForEveryoneJob(job as Job<DeleteForEveryoneJob>);
  const jobData = job.data as Partial<MessageRecipientJobPayload>;
  if (!jobData.recipientId) throw new Error("MESSAGE_JOB_RECIPIENT_MISSING");
  const recipient = await prisma.messageRecipient.findUnique({
    where: { id: jobData.recipientId },
    include: { campaign: true, group: true, account: { select: { id: true, companyId: true, userId: true } } },
  });
  const correlationId = jobData.correlationId ?? readCampaignCorrelationId(recipient?.campaign.contentJson) ?? createMessageCorrelationId();
  const baseLog = {
    workerId,
    jobId: job.id,
    companyId: jobData.companyId ?? recipient?.campaign.companyId,
    campaignId: jobData.campaignId ?? recipient?.campaignId,
    recipientId: jobData.recipientId,
    source: jobData.source,
    correlationId,
  };
  logger.info("message.job.received", baseLog);
  if (!recipient?.group) {
    logger.warn("message.job.skipped", { ...baseLog, reason: "RECIPIENT_OR_GROUP_MISSING" });
    return;
  }
  if (jobData.companyId && jobData.companyId !== recipient.campaign.companyId) {
    logger.error("message.job.company_mismatch", new Error("MESSAGE_JOB_COMPANY_MISMATCH"), { ...baseLog, actualCompanyId: recipient.campaign.companyId });
    throw new Error("MESSAGE_JOB_COMPANY_MISMATCH");
  }
  if (jobData.campaignId && jobData.campaignId !== recipient.campaignId) {
    logger.error("message.job.campaign_mismatch", new Error("MESSAGE_JOB_CAMPAIGN_MISMATCH"), { ...baseLog, actualCampaignId: recipient.campaignId });
    throw new Error("MESSAGE_JOB_CAMPAIGN_MISMATCH");
  }
  if (recipient.group.companyId !== recipient.campaign.companyId || recipient.account.companyId !== recipient.campaign.companyId) {
    logger.error("message.job.tenant_mismatch", new Error("MESSAGE_JOB_TENANT_MISMATCH"), {
      ...baseLog,
      groupCompanyId: recipient.group.companyId,
      accountCompanyId: recipient.account.companyId,
      campaignCompanyId: recipient.campaign.companyId,
    });
    throw new Error("MESSAGE_JOB_TENANT_MISMATCH");
  }
  if (recipient.group.userId !== recipient.campaign.createdById || recipient.account.userId !== recipient.campaign.createdById || recipient.group.accountId !== recipient.accountId) {
    logger.error("message.job.ownership_mismatch", new Error("MESSAGE_JOB_OWNERSHIP_MISMATCH"), {
      ...baseLog,
      groupUserId: recipient.group.userId,
      accountUserId: recipient.account.userId,
      campaignCreatedById: recipient.campaign.createdById,
      groupAccountId: recipient.group.accountId,
      recipientAccountId: recipient.accountId,
    });
    throw new Error("MESSAGE_JOB_OWNERSHIP_MISMATCH");
  }
  if (recipient.status === "SENT" || ["CANCELED", "CANCELING", "DELETED"].includes(recipient.campaign.status)) {
    logger.info("message.job.skipped", { ...baseLog, recipientStatus: recipient.status, campaignStatus: recipient.campaign.status });
    return;
  }
  const claimed = await prisma.messageRecipient.updateMany({ where: { id: recipient.id, status: { in: ["PENDING", "FAILED"] } }, data: { status: "SENDING" } });
  if (!claimed.count) {
    logger.info("message.job.claim_skipped", { ...baseLog, recipientStatus: recipient.status });
    return;
  }
  const sourceGroup = recipient.group;
  await prisma.messageCampaign.updateMany({ where: { id: recipient.campaignId, status: "QUEUED" }, data: { status: "SENDING" } });
  try {
    const [target] = await traceMessageStage("worker.target.resolve", baseLog, async () =>
      resolveSendableWhatsAppGroups(recipient.campaign.companyId, [sourceGroup.id], { userId: recipient.campaign.createdById, accountId: recipient.accountId }),
    );
    if (!target) throw new Error("WHATSAPP_RECONNECT_REQUIRED");
    if (target.id !== sourceGroup.id || target.accountId !== recipient.accountId) {
      await traceMessageStage("worker.recipient.retarget", { ...baseLog, accountId: target.accountId, groupId: target.id }, async () => {
        await prisma.messageRecipient.update({ where: { id: recipient.id }, data: { groupId: target.id, accountId: target.accountId, recipientName: target.name, recipientExternalId: target.externalGroupId } });
      });
    }
    logger.info("message.send.attempt", { ...baseLog, accountId: target.accountId, groupId: target.id, groupExternalId: target.externalGroupId });
    const sendResult = await traceMessageStage("worker.baileys.send", { ...baseLog, accountId: target.accountId, groupId: target.id, groupExternalId: target.externalGroupId }, async () =>
      provider.sendGroupMessage({
        accountId: target.accountId,
        groupExternalId: target.externalGroupId,
        content: recipient.campaign.content,
        correlationId,
        campaignId: recipient.campaignId,
        recipientId: recipient.id,
      }),
    );
    const sentAt = new Date();
    const messageKeyJson = JSON.parse(JSON.stringify(sendResult.messageKey)) as Prisma.InputJsonValue;
    await traceMessageStage("worker.recipient.mark_sent", { ...baseLog, accountId: target.accountId, externalMessageId: sendResult.externalMessageId }, async () => {
      await prisma.messageRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "SENT",
          sentAt,
          failedAt: null,
          errorMessage: null,
          externalMessageId: sendResult.externalMessageId,
          messageKeyJson,
          messageKeyFromMe: sendResult.messageKey.fromMe ?? null,
          messageKeyParticipant: sendResult.messageKey.participant ?? null,
          deleteForEveryoneStatus: "NOT_REQUESTED",
          deleteForEveryoneAttemptedAt: null,
          deleteForEveryoneCompletedAt: null,
          deleteForEveryoneError: null,
        },
      });
    });
    logger.info("message.send.succeeded", { ...baseLog, accountId: target.accountId, externalMessageId: sendResult.externalMessageId });
  } catch (error) {
    const attempts = Number(job.opts.attempts ?? 1);
    const finalAttempt = job.attemptsMade + 1 >= attempts;
    const errorMessage = error instanceof Error ? error.message : "Send failed";
    const recoverable = isRecoverableWhatsAppSendError(error);
    if (recoverable) {
      await prisma.messageRecipient.update({
        where: { id: recipient.id },
        data: { status: "PENDING", failedAt: null, errorMessage: finalAttempt ? "WHATSAPP_RESTORING_CONNECTION" : "WHATSAPP_RETRYING_CONNECTION" },
      });
      await prisma.whatsAppAccount.updateMany({
        where: { id: recipient.accountId, archivedAt: null, lastError: { notIn: ["WHATSAPP_LOGGED_OUT", "WHATSAPP_CREDENTIALS_MISSING"] } },
        data: { status: "CONNECTING", lastError: "WHATSAPP_TRANSIENT_DISCONNECT" },
      });
      const reconnectQueue = whatsappQueue();
      try {
        await reconnectQueue.add("reconnect", { action: "reconnect", accountId: recipient.accountId }, { jobId: `send-reconnect-${recipient.accountId}`, removeOnComplete: 50, removeOnFail: 100 });
      } catch (queueError) {
        logger.error("message.reconnect.enqueue_failed", queueError, { ...baseLog, accountId: recipient.accountId });
      } finally {
        await reconnectQueue.close().catch(() => undefined);
      }
      if (finalAttempt) {
        const retryQueue = messageQueue();
        const delay = Math.min(120_000, Number(process.env.WHATSAPP_RECOVERABLE_RETRY_DELAY_MS || 20_000));
        try {
          const retryPayload: MessageRecipientJobPayload = { ...jobData, companyId: recipient.campaign.companyId, campaignId: recipient.campaignId, recipientId: recipient.id, correlationId, source: "recoverable-retry", recoveryRetry: true };
          await retryQueue.add(
            "send-recipient",
            retryPayload,
            {
              jobId: `recoverable-recipient-${recipient.id}-${Date.now()}`,
              delay,
              ...WHATSAPP_MESSAGE_JOB_OPTIONS,
            },
          );
        } catch (queueError) {
          logger.error("message.recoverable_retry.enqueue_failed", queueError, { ...baseLog, accountId: recipient.accountId });
        } finally {
          await retryQueue.close().catch(() => undefined);
        }
      }
      logger.warn("MESSAGE_RETRY", { ...baseLog, accountId: recipient.accountId, finalAttempt });
      logger.warn("message.send.retrying_connection", { ...baseLog, accountId: recipient.accountId, finalAttempt });
      if (finalAttempt) return;
      throw error;
    }
    await prisma.messageRecipient.update({
      where: { id: recipient.id },
      data: { status: finalAttempt ? "FAILED" : "PENDING", failedAt: finalAttempt ? new Date() : null, errorMessage },
    });
    if (finalAttempt) {
      logger.error("MESSAGE_FAILED", error, { ...baseLog, accountId: recipient.accountId });
      const queue = deadLetterQueue();
      try {
        await queue.add("message-send-failed", { ...jobData, companyId: recipient.campaign.companyId, campaignId: recipient.campaignId, recipientId: recipient.id, correlationId, errorMessage }, { jobId: `dead-letter-${recipient.id}` });
      } finally {
        await queue.close();
      }
    }
    logger.error("message.send.failed", error, { ...baseLog, accountId: recipient.accountId, finalAttempt });
    throw error;
  } finally {
    const counts = await prisma.messageRecipient.groupBy({ by: ["status"], where: { campaignId: recipient.campaignId }, _count: { _all: true } });
    const count = (status: string) => counts.find((item) => item.status === status)?._count._all ?? 0;
    const pending = count("PENDING") + count("SENDING");
    const sent = count("SENT"), failed = count("FAILED"), canceled = count("CANCELED");
    const nextStatus = pending ? "SENDING" : failed ? sent ? "PARTIALLY_COMPLETED" : "FAILED" : "COMPLETED";
    const updatedCampaign = await prisma.messageCampaign.update({
      where: { id: recipient.campaignId },
      data: {
        sentCount: sent,
        failedCount: failed,
        canceledCount: canceled,
        status: nextStatus,
      },
      select: { id: true, companyId: true, createdById: true, title: true, status: true, sentCount: true, failedCount: true, totalRecipients: true },
    });
    if (!pending && ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(nextStatus) && recipient.campaign.status !== nextStatus) {
      void createCampaignFinalNotification(updatedCampaign).catch((error) => logger.error("notification.campaign_final.failed", error, { campaignId: updatedCampaign.id, correlationId }));
    }
  }
}, {
  connection,
  concurrency: 1,
  limiter: { max: Number(process.env.WHATSAPP_MAX_MESSAGES_PER_MINUTE || 12), duration: 60000 },
  settings: { backoffStrategy: () => Number(process.env.WHATSAPP_MIN_DELAY_MS || 3000) + Math.floor(Math.random() * Number(process.env.WHATSAPP_MAX_DELAY_MS || 6000)) },
}));

async function processDeleteForEveryoneJob(job: Job<DeleteForEveryoneJob>) {
  const jobData = job.data;
  const recipient = await prisma.messageRecipient.findUnique({
    where: { id: jobData.recipientId },
    include: { campaign: true, group: true, account: { select: { id: true, companyId: true, userId: true, archivedAt: true } } },
  });
  const baseLog = {
    workerId,
    jobId: job.id,
    companyId: jobData.companyId,
    campaignId: jobData.campaignId,
    recipientId: jobData.recipientId,
    accountId: jobData.whatsappAccountId,
    groupJid: jobData.groupJid,
    correlationId: jobData.correlationId,
  };
  logger.info("message.delete.job.received", baseLog);
  if (!recipient) {
    logger.warn("message.delete.job.skipped", { ...baseLog, reason: "RECIPIENT_MISSING" });
    return;
  }
  const finishAggregate = () => updateCampaignDeleteAggregate(recipient.campaignId).catch((error) => logger.error("message.delete.aggregate_failed", error, baseLog));
  if (
    recipient.campaignId !== jobData.campaignId ||
    recipient.campaign.companyId !== jobData.companyId ||
    recipient.campaign.createdById !== jobData.userId ||
    recipient.accountId !== jobData.whatsappAccountId ||
    recipient.account.id !== jobData.whatsappAccountId ||
    recipient.account.companyId !== jobData.companyId ||
    recipient.account.userId !== jobData.userId ||
    recipient.group?.companyId !== jobData.companyId ||
    recipient.group?.userId !== jobData.userId ||
    recipient.group?.accountId !== jobData.whatsappAccountId
  ) {
    await prisma.messageRecipient.update({ where: { id: recipient.id }, data: { deleteForEveryoneStatus: "FAILED", deleteForEveryoneError: "MESSAGE_DELETE_TENANT_MISMATCH" } });
    await finishAggregate();
    logger.error("message.delete.tenant_mismatch", new Error("MESSAGE_DELETE_TENANT_MISMATCH"), baseLog);
    return;
  }
  if (recipient.status !== "SENT") {
    await prisma.messageRecipient.update({ where: { id: recipient.id }, data: { deleteForEveryoneStatus: "FAILED", deleteForEveryoneError: "MESSAGE_NOT_SENT" } });
    await finishAggregate();
    return;
  }
  if (!isDeleteWindowOpen(recipient.sentAt)) {
    await prisma.messageRecipient.update({ where: { id: recipient.id }, data: { deleteForEveryoneStatus: "EXPIRED", deleteForEveryoneError: "WHATSAPP_DELETE_WINDOW_EXPIRED" } });
    await finishAggregate();
    logger.warn("message.delete.expired", baseLog);
    return;
  }
  const messageKey = parseStoredMessageKey(recipient.messageKeyJson);
  if (!messageKey) {
    await prisma.messageRecipient.update({ where: { id: recipient.id }, data: { deleteForEveryoneStatus: "FAILED", deleteForEveryoneError: "WHATSAPP_MESSAGE_KEY_MISSING" } });
    await finishAggregate();
    logger.warn("message.delete.missing_key", baseLog);
    return;
  }
  const claimed = await prisma.messageRecipient.updateMany({
    where: { id: recipient.id, deleteForEveryoneStatus: { in: ["PENDING", "FAILED"] } },
    data: { deleteForEveryoneStatus: "PROCESSING", deleteForEveryoneAttemptedAt: new Date(), deleteForEveryoneError: null },
  });
  if (!claimed.count && recipient.deleteForEveryoneStatus !== "PROCESSING") {
    logger.info("message.delete.claim_skipped", { ...baseLog, deleteForEveryoneStatus: recipient.deleteForEveryoneStatus });
    return;
  }
  try {
    await provider.deleteGroupMessage({
      accountId: recipient.accountId,
      groupExternalId: recipient.recipientExternalId,
      messageKey,
      campaignId: recipient.campaignId,
      recipientId: recipient.id,
      correlationId: jobData.correlationId,
    });
    await prisma.messageRecipient.update({
      where: { id: recipient.id },
      data: { deleteForEveryoneStatus: "DELETED", deleteForEveryoneCompletedAt: new Date(), deleteForEveryoneError: null },
    });
    logger.info("message.delete.succeeded", baseLog);
  } catch (error) {
    const recoverable = isRecoverableWhatsAppSendError(error);
    const attempts = Number(job.opts.attempts ?? 1);
    const finalAttempt = job.attemptsMade + 1 >= attempts;
    const errorMessage = error instanceof Error ? error.message : "WhatsApp delete failed";
    await prisma.messageRecipient.update({
      where: { id: recipient.id },
      data: {
        deleteForEveryoneStatus: recoverable && !finalAttempt ? "PENDING" : "FAILED",
        deleteForEveryoneError: recoverable && !finalAttempt ? "WHATSAPP_DELETE_RETRYING" : errorMessage,
      },
    });
    logger.error("message.delete.failed", error, { ...baseLog, recoverable, finalAttempt });
    if (recoverable && !finalAttempt) throw error;
  } finally {
    await finishAggregate();
  }
}

async function recoverSessions() {
  const recoverableAccounts = await prisma.whatsAppAccount.findMany({
    where: {
      archivedAt: null,
      OR: [
        { status: { in: ["PENDING_QR", "QR_READY", "CONNECTING", "CONNECTED", "DISCONNECTED", "RECONNECT_REQUIRED"] } },
        { sessions: { some: { sessionDataEncrypted: { not: null } } } },
      ],
    },
    select: { id: true, pairingCode: true },
  });
  for (const account of recoverableAccounts) {
    if (account.pairingCode) continue;
    if (!(await hasRestorableWhatsAppCredentials(account.id))) {
      await prisma.whatsAppAccount.updateMany({
        where: { id: account.id, archivedAt: null, status: { in: ["CONNECTED", "CONNECTING", "DISCONNECTED", "RECONNECT_REQUIRED"] } },
        data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_CREDENTIALS_MISSING" },
      });
      continue;
    }
    await restoreWhatsAppSessionFromDatabase(account.id).catch((error) => logger.error("whatsapp.session.restore_failed", error, { accountId: account.id }));
    void provider.reconnect(account.id).catch((error) => logger.error("whatsapp.session.recovery_bootstrap_failed", error, { accountId: account.id }));
  }
}
void recoverSessions().catch((error) => console.error("WhatsApp session recovery bootstrap failed", error));

async function cleanupStuckSessions() {
  const result = await cleanupStuckWhatsAppAccounts();
  if (result.count) logger.warn("whatsapp.stuck_sessions.cleaned", { count: result.count });
}
void cleanupStuckSessions().catch((error) => logger.error("whatsapp.stuck_sessions.cleanup_failed", error));
setInterval(() => void cleanupStuckSessions().catch((error) => logger.error("whatsapp.stuck_sessions.cleanup_failed", error)), 60_000).unref();
logger.info("worker.started", { workerId, queues: [QUEUES.campaign, QUEUES.sync, QUEUES.message] });
void writeWorkerHeartbeat(workerId).catch((error) => logger.error("worker.heartbeat.failed", error));
setInterval(() => void writeWorkerHeartbeat(workerId).catch((error) => logger.error("worker.heartbeat.failed", error)), Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS || 30_000)).unref();

console.log("Logivya WhatsApp worker is ready");

async function shutdown(signal: string) {
  logger.warn("worker.shutdown.started", { workerId, signal });
  await Promise.all(workers.map((worker) => worker.close().catch((error) => logger.error("worker.shutdown.queue_failed", error, { workerId, queue: worker.name }))));
  await prisma.$disconnect();
  logger.warn("worker.shutdown.completed", { workerId, signal });
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

async function createCampaignFinalNotification(campaign: {
  id: string;
  companyId: string;
  createdById: string;
  title: string;
  status: string;
  sentCount: number;
  failedCount: number;
  totalRecipients: number;
}) {
  const type =
    campaign.status === "COMPLETED"
      ? NOTIFICATION_TYPES.CAMPAIGN_COMPLETED
      : campaign.status === "PARTIALLY_COMPLETED"
        ? NOTIFICATION_TYPES.CAMPAIGN_PARTIAL_DELIVERY
        : NOTIFICATION_TYPES.CAMPAIGN_FAILED;
  const title =
    campaign.status === "COMPLETED"
      ? "Kampanya tamamlandı"
      : campaign.status === "PARTIALLY_COMPLETED"
        ? "Kampanya kısmen tamamlandı"
        : "Kampanya başarısız oldu";
  const message =
    campaign.status === "COMPLETED"
      ? `${campaign.title} kampanyası başarıyla tamamlandı.`
      : `${campaign.title} kampanyasında ${campaign.sentCount} başarılı, ${campaign.failedCount} başarısız teslimat var.`;
  await createNotification({
    companyId: campaign.companyId,
    userId: campaign.createdById,
    type,
    title,
    message,
    payload: {
      campaignId: campaign.id,
      status: campaign.status,
      sentCount: campaign.sentCount,
      failedCount: campaign.failedCount,
      totalRecipients: campaign.totalRecipients
    }
  });
}
