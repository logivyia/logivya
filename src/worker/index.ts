import "./health";
import { Worker, type Job } from "bullmq";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { QUEUES, WHATSAPP_MESSAGE_JOB_OPTIONS } from "@/server/queues/contracts";
import { BaileysWhatsAppProvider } from "@/worker/baileys-provider";
import { parseRecurringRule } from "@/server/queues/recurring";
import { deadLetterQueue, messageQueue, redisConnectionOptions, redisConnectionUrl, whatsappQueue } from "@/server/queues/client";
import { reconcileDurableMessageQueues, scheduleFollowingRecurringRun } from "@/server/queues/recovery";
import { logger } from "@/server/observability/logger";
import { raiseOperationalAlert } from "@/server/observability/alerts";
import { cleanupStuckWhatsAppAccounts } from "@/server/whatsapp/cleanup";
import { withWhatsAppAccountLock } from "@/server/whatsapp/account-lock";
import { writeWorkerHeartbeat } from "@/server/whatsapp/worker-heartbeat";
import { pairingUserMessage } from "@/server/whatsapp/pairing-errors";
import { hasActivePhonePairing, isPhonePairingActive } from "@/server/whatsapp/pairing-guard";
import { resolveSendableWhatsAppGroups } from "@/server/whatsapp/sendable-groups";
import {
  completeContactSyncRun,
  failContactSyncRun,
  resolveOwnedWhatsAppContacts,
  startContactSyncRun,
} from "@/server/whatsapp/contacts";
import { createNotification, NOTIFICATION_TYPES } from "@/server/notifications/service";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { composeOutboundMessage } from "@/server/messages/outbound-composer";
import { createMessageCorrelationId, readCampaignCorrelationId, withCampaignMetadata } from "@/server/messages/correlation";
import { updateMessageCampaignDeliveryAggregate } from "@/server/messages/delivery-state";
import { traceMessageStage } from "@/server/messages/delivery-tracing";
import { isDeleteWindowOpen, parseStoredMessageKey, updateCampaignDeleteAggregate } from "@/server/messages/delete-for-everyone";
import type { MessageRecipientJobPayload } from "@/server/messages/delivery-pipeline";
import type { DeleteForEveryoneJob } from "@/server/queues/contracts";
/**
 * STABLE WHATSAPP/MESSAGE CORE - DO NOT MODIFY WITHOUT EXPLICIT APPROVAL.
 * CRITICAL LOGIVYA WHATSAPP CONNECTION MODULE.
 * Do not modify without running the full WhatsApp regression test suite.
 */
import os from "node:os";
import { hasRestorableWhatsAppCredentials, restoreWhatsAppSessionFromDatabase } from "@/lib/whatsapp/session-manager";

const workerId = process.env.WORKER_ID || `${os.hostname()}-${process.pid}`;
const workerStartedAt = new Date().toISOString();
const workerCapacity = 8;
let activeWorkerJobs = 0;
const redisUrl = redisConnectionUrl();

function hostnameFromConnectionString(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLocalHost(hostname: string | null) {
  return Boolean(hostname && ["localhost", "127.0.0.1", "::1"].includes(hostname));
}

function isRemoteConnectionString(value: string | undefined) {
  const hostname = hostnameFromConnectionString(value);
  return Boolean(hostname && !isLocalHost(hostname));
}

function assertLocalWorkerDoesNotConsumeProductionQueues() {
  const localWorker = /(^|[-_])local([-_]|$)/i.test(workerId);
  if (!localWorker) return;
  const remoteTargets = [
    isRemoteConnectionString(redisUrl) ? "REDIS_URL" : null,
    isRemoteConnectionString(process.env.DATABASE_URL) ? "DATABASE_URL" : null,
  ].filter((target): target is string => Boolean(target));
  if (!remoteTargets.length) return;
  if (process.env.ALLOW_LOCAL_PRODUCTION_WORKER === "1") {
    logger.warn("worker.local_production_guard.overridden", { workerId, remoteTargets });
    return;
  }
  const error = new Error("LOCAL_WORKER_PRODUCTION_TARGET_BLOCKED");
  logger.error("worker.local_production_guard.blocked", error, { workerId, remoteTargets });
  throw error;
}

assertLocalWorkerDoesNotConsumeProductionQueues();

const connection = redisConnectionOptions();
const provider = new BaileysWhatsAppProvider();
const workers: Worker[] = [];
let shutdownStarted = false;

async function reportFatalAndShutdown(type: string) {
  await Promise.race([
    raiseOperationalAlert({ type, severity: "CRITICAL", service: "logivya-worker", message: "Worker process encountered a fatal error.", metadata: { workerId } }),
    new Promise((resolve) => setTimeout(resolve, 1_000)),
  ]).catch((alertError) => logger.error("worker.fatal_alert.failed", alertError, { workerId, type }));
  await shutdown(type, 1);
}

process.on("uncaughtException", (error) => {
  logger.fatal("worker.process.uncaught_exception", error, { workerId, result: "FAILED" });
  void reportFatalAndShutdown("WORKER_UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason) => {
  logger.fatal("worker.process.unhandled_rejection", reason instanceof Error ? reason : new Error(String(reason)), { workerId, result: "FAILED" });
  void reportFatalAndShutdown("WORKER_UNHANDLED_REJECTION");
});

function isRecoverableWhatsAppSendError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /WHATSAPP_PAIRING_IN_PROGRESS|WHATSAPP_RECONNECT_REQUIRED|WHATSAPP_TRANSIENT_DISCONNECT|WHATSAPP_RESTORING_CONNECTION|WHATSAPP_RETRYING_CONNECTION|WHATSAPP_SESSION_CONNECTION_TIMEOUT|WHATSAPP_ACCOUNT_LOCK_TIMEOUT|Connection Closed|Timed Out|restart|disconnected|socket/i.test(message);
}

function isExplicitWhatsAppAuthFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /WHATSAPP_LOGGED_OUT|LOGGED_OUT|AUTH_REQUIRED|WHATSAPP_CREDENTIALS_MISSING/i.test(message);
}

function isPermanentMessageDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /MESSAGE_TARGET_MISSING|MESSAGE_JOB_COMPANY_MISMATCH|MESSAGE_JOB_CAMPAIGN_MISMATCH|MESSAGE_JOB_TENANT_MISMATCH|MESSAGE_JOB_OWNERSHIP_MISMATCH|WHATSAPP_CONTACT_OWNERSHIP_MISMATCH|WHATSAPP_GROUP_OWNERSHIP_MISMATCH|GROUP_MESSAGING_NOT_AVAILABLE|CONTACT_MESSAGING_REQUIRES_PROFESSIONAL|SUBSCRIPTION_LOCKED|MESSAGE_ATTRIBUTION_LENGTH_EXCEEDED/i.test(message);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function registerWorker(name: string, worker: Worker) {
  workers.push(worker);
  logger.info("worker.queue.registered", { workerId, queue: name });
  worker.on("ready", () => logger.info("worker.queue.ready", { workerId, queue: name }));
  worker.on("active", (job) => {
    activeWorkerJobs += 1;
    const data = job.data as { correlationId?: string };
    logger.debug("worker.job.received", { workerId, queue: name, jobId: job.id, jobName: job.name, correlationId: data.correlationId, attempt: job.attemptsMade + 1 });
    if (name === QUEUES.sync) {
      const data = job.data as { action?: string; accountId?: string };
      logger.info("whatsapp.worker.job.received", { workerId, queue: name, jobId: job.id, jobName: job.name, action: data.action, accountId: data.accountId });
    }
  });
  worker.on("completed", (job) => {
    activeWorkerJobs = Math.max(0, activeWorkerJobs - 1);
    logger.info("worker.job.completed", { workerId, queue: name, jobId: job.id, jobName: job.name, correlationId: (job.data as { correlationId?: string }).correlationId, attempt: job.attemptsMade + 1, durationMs: job.processedOn ? Date.now() - job.processedOn : undefined, result: "SUCCESS" });
  });
  worker.on("failed", (job, error) => {
    activeWorkerJobs = Math.max(0, activeWorkerJobs - 1);
    const attempts = Number(job?.opts.attempts ?? 1);
    const finalAttempt = !job || job.attemptsMade >= attempts;
    const correlationId = (job?.data as { correlationId?: string } | undefined)?.correlationId;
    logger.error("worker.job.failed", error, { workerId, queue: name, jobId: job?.id, jobName: job?.name, correlationId, attempt: job?.attemptsMade, finalAttempt, retryable: !finalAttempt, durationMs: job?.processedOn ? Date.now() - job.processedOn : undefined });
    if (finalAttempt) {
      void raiseOperationalAlert({ type: "WORKER_JOB_FINAL_FAILURE", severity: "HIGH", service: "logivya-worker", message: "A queue job exhausted its retry budget.", correlationId, metadata: { workerId, queueName: name, jobName: job?.name } })
        .catch((alertError) => logger.error("worker.job_failure_alert.failed", alertError, { workerId, queue: name }));
    }
  });
  worker.on("error", (error) => logger.error("worker.queue.error", error, { workerId, queue: name }));
  return worker;
}

registerWorker(QUEUES.campaign, new Worker(QUEUES.campaign, async (job) => {
  const { templateCampaignId, companyId, correlationId: queuedCorrelationId, runAt: queuedRunAt } = job.data as { templateCampaignId: string; companyId: string; correlationId?: string; runAt?: string };
  const template = await prisma.messageCampaign.findFirst({ where: { id: templateCampaignId, companyId, deletedAt: null, scheduleType: "RECURRING" }, include: { recipients: true } });
  const templateCorrelationId = queuedCorrelationId ?? readCampaignCorrelationId(template?.contentJson);
  if (!template || ["CANCELED", "DELETED"].includes(template.status)) return;
  const recurringRule = parseRecurringRule(template.recurringRule);
  if (!recurringRule) {
    logger.error("message.recurring.invalid_rule", new Error("RECURRING_RULE_INVALID"), { workerId, companyId, templateCampaignId, correlationId: templateCorrelationId });
    return;
  }
  const parsedRunAt = queuedRunAt ? new Date(queuedRunAt) : template.nextRunAt ?? new Date();
  if (Number.isNaN(parsedRunAt.getTime())) throw new Error("RECURRING_RUN_AT_INVALID");
  await scheduleFollowingRecurringRun({
    templateCampaignId,
    companyId,
    recurringRule,
    currentRunAt: parsedRunAt,
    correlationId: templateCorrelationId,
  });
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
  let contacts: Awaited<ReturnType<typeof resolveOwnedWhatsAppContacts>>;
  try {
    const groupIds = template.recipients.filter((recipient) => recipient.targetType === "GROUP").map((recipient) => recipient.groupId).filter((groupId): groupId is string => Boolean(groupId));
    const contactIds = template.recipients.filter((recipient) => recipient.targetType === "CONTACT").map((recipient) => recipient.contactId).filter((contactId): contactId is string => Boolean(contactId));
    groups = groupIds.length
      ? await resolveSendableWhatsAppGroups(companyId, groupIds, { userId: template.createdById, accountId: accountIds[0] })
      : [];
    contacts = contactIds.length
      ? await resolveOwnedWhatsAppContacts({ companyId, userId: template.createdById, accountId: accountIds[0] }, contactIds)
      : [];
  } catch (error) {
    logger.error("message.recurring.group_resolution_failed", error, { workerId, companyId, templateCampaignId, accountId: accountIds[0], correlationId: templateCorrelationId, includesContactTargets: template.recipients.some((recipient) => recipient.targetType === "CONTACT") });
    return;
  }
  if (contacts.length && !(await subscriptionAccess.canUseContactMessaging(companyId))) {
    logger.warn("message.recurring.skipped_contact_entitlement", { workerId, companyId, templateCampaignId, correlationId: templateCorrelationId });
    return;
  }
  if (!groups.length && !contacts.length) {
    logger.warn("message.recurring.skipped_no_sendable_targets", { workerId, companyId, templateCampaignId, accountId: accountIds[0], correlationId: templateCorrelationId });
    return;
  }
  const correlationId = createMessageCorrelationId();
  const recurringOccurrenceKey = `${templateCampaignId}:${parsedRunAt.toISOString()}`;
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
      recurringOccurrenceKey,
      totalRecipients: groups.length + contacts.length,
      recipients: {
        create: [
          ...groups.map((group) => ({
            accountId: group.accountId,
            groupId: group.id,
            targetType: "GROUP" as const,
            recipientName: group.name,
            recipientExternalId: group.externalGroupId,
          })),
          ...contacts.map((contact) => ({
            accountId: contact.accountId,
            contactId: contact.id,
            targetType: "CONTACT" as const,
            recipientName: contact.name || contact.pushName || contact.phone,
            recipientExternalId: contact.externalContactId,
          })),
        ],
      },
    },
    include: { recipients: true },
  }).catch((error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      logger.warn("message.recurring.duplicate_occurrence_skipped", { workerId, companyId, templateCampaignId, recurringOccurrenceKey, correlationId: templateCorrelationId });
      return null;
    }
    throw error;
  });
  if (!occurrence) return;
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
}, { connection, concurrency: 2 }));

registerWorker(QUEUES.sync, new Worker(QUEUES.sync, async (job) => {
  const { action, accountId, phoneNumber, preserveRetryCounter, syncRunId } = job.data as { action: "connect" | "pairing" | "pairing-refresh" | "sync" | "sync-contacts" | "disconnect" | "reconnect"; accountId: string; phoneNumber?: string; preserveRetryCounter?: boolean; syncRunId?: string };
  return withWhatsAppAccountLock(accountId, `worker:${action}`, async () => {
    try {
      logger.info("whatsapp.worker.job.received", { workerId, jobId: job.id, action, accountId });
      logger.info("whatsapp.job.received", { workerId, jobId: job.id, action, accountId });
      const account = await prisma.whatsAppAccount.findUnique({
        where: { id: accountId },
        select: { companyId: true, status: true, archivedAt: true, updatedAt: true, pairingCode: true, pairingCodeExpiresAt: true, lastError: true },
      });
      if (!account || account.archivedAt) {
        await failContactSyncRun(syncRunId, accountId, "WHATSAPP_ACCOUNT_NOT_FOUND");
        return;
      }
      if (action === "sync-contacts" && !(await subscriptionAccess.canUseContactMessaging(account.companyId))) {
        await failContactSyncRun(syncRunId, accountId, "CONTACT_MESSAGING_REQUIRES_PROFESSIONAL");
        logger.warn("whatsapp.contacts.sync_skipped", { workerId, jobId: job.id, accountId, companyId: account.companyId, reason: "CONTACT_MESSAGING_REQUIRES_PROFESSIONAL" });
        return;
      }
      if ((action === "reconnect" || action === "sync" || action === "sync-contacts") && hasActivePhonePairing(account)) {
        if (action === "sync-contacts") {
          await completeContactSyncRun(syncRunId, accountId, { status: "PARTIAL", errorCode: "WHATSAPP_PAIRING_IN_PROGRESS" });
        }
        logger.warn("whatsapp.worker.reconnect.skipped_active_pairing", { workerId, jobId: job.id, accountId, action, status: account.status });
        return;
      }
      if (action === "reconnect" && account.status === "CONNECTED" && typeof job.timestamp === "number" && account.updatedAt.getTime() > job.timestamp + 1_000) {
        logger.warn("whatsapp.worker.reconnect.skipped_stale_connected_job", { workerId, jobId: job.id, accountId, accountUpdatedAt: account.updatedAt.toISOString(), jobTimestamp: job.timestamp });
        return;
      }
      if (action === "connect" && account.updatedAt < new Date(Date.now() - 10 * 60_000) && ["PENDING_QR", "QR_READY"].includes(account.status)) {
        await prisma.whatsAppAccount.update({
          where: { id: accountId },
          data: { status: "FAILED", lastError: "WHATSAPP_QR_EXPIRED", qrCode: null, qrExpiresAt: null },
        });
        return;
      }
      if (["connect", "reconnect"].includes(action) && account.status === "ERROR") return;
      if (action === "connect") return await provider.createFreshQrSession(accountId);
      if (action === "pairing") {
        if (!phoneNumber) throw new Error("Invalid phone number.");
        return await provider.requestPairingCode(accountId, phoneNumber, { preserveRetryCounter });
      }
      if (action === "pairing-refresh") {
        if (!phoneNumber) throw new Error("Invalid phone number.");
        return await provider.refreshPairingCode(accountId, phoneNumber);
      }
      if (action === "sync") return await provider.syncGroups(accountId);
      if (action === "sync-contacts") {
        await startContactSyncRun(syncRunId, accountId);
        const result = await provider.syncContacts(accountId);
        await completeContactSyncRun(syncRunId, accountId, result.deferred
          ? { status: "PARTIAL", errorCode: "CONTACT_SYNC_DEFERRED_ACTIVE_DELIVERY" }
          : { status: "COMPLETED" });
        return result;
      }
      if (action === "disconnect") return await provider.disconnect(accountId);
      return await provider.reconnect(accountId);
    } catch (error) {
      if (action === "sync-contacts") {
        await failContactSyncRun(syncRunId, accountId, errorMessage(error)).catch((syncRunError) =>
          logger.error("whatsapp.contacts.sync_run_failure_update_failed", syncRunError, { accountId, syncRunId }),
        );
        logger.error("whatsapp.contacts.sync_failed_without_connection_downgrade", error, { workerId, jobId: job.id, accountId, syncRunId });
        throw error;
      }
      if (action === "pairing" && errorMessage(error).includes("WHATSAPP_PAIRING_RETRY_SCHEDULED")) {
        logger.warn("whatsapp.worker.pairing_retry_scheduled", { workerId, jobId: job.id, accountId, action });
        return;
      }
      const guardedAccount = await prisma.whatsAppAccount.findUnique({
        where: { id: accountId },
        select: { status: true, pairingCode: true, pairingCodeExpiresAt: true, updatedAt: true, lastError: true },
      }).catch(() => null);
      if ((action === "reconnect" || action === "sync") && guardedAccount && hasActivePhonePairing(guardedAccount)) {
        logger.warn("whatsapp.worker.reconnect.failure_skipped_active_pairing", { workerId, jobId: job.id, accountId, action, status: guardedAccount.status });
        return;
      }
      const hasCredentials = await hasRestorableWhatsAppCredentials(accountId).catch(() => false);
      const explicitAuthFailure = isExplicitWhatsAppAuthFailure(error);
      const status = action === "pairing" || action === "connect" ? "FAILED" : explicitAuthFailure ? "RECONNECT_REQUIRED" : "CONNECTING";
      const lastError = action === "pairing"
        ? pairingUserMessage(error)
        : action === "connect"
          ? "WHATSAPP_QR_FAILED"
          : explicitAuthFailure
            ? error instanceof Error && /LOGGED_OUT|WHATSAPP_LOGGED_OUT/i.test(error.message) ? "WHATSAPP_LOGGED_OUT" : "WHATSAPP_CREDENTIALS_MISSING"
            : "WHATSAPP_TRANSIENT_DISCONNECT";
      await prisma.whatsAppAccount.update({
        where: { id: accountId },
        data: { status, lastError, qrCode: null, qrExpiresAt: null, recoveryLevel: explicitAuthFailure ? 5 : hasCredentials ? 2 : 3 },
      });
      logger.error("whatsapp.job.failed", error, { jobId: job.id, accountId, action, status, lastError });
      throw error;
    }
  }, { ttlMs: action === "sync-contacts" ? 15 * 60_000 : 180_000, timeoutMs: 45_000, correlationId: String(job.id ?? "") });
}, { connection, concurrency: 5 }));

registerWorker(QUEUES.message, new Worker(QUEUES.message, async (job) => {
  if (job.name === "delete-for-everyone") return processDeleteForEveryoneJob(job as Job<DeleteForEveryoneJob>);
  const jobData = job.data as Partial<MessageRecipientJobPayload>;
  if (!jobData.recipientId) throw new Error("MESSAGE_JOB_RECIPIENT_MISSING");
  const recipient = await prisma.messageRecipient.findUnique({
    where: { id: jobData.recipientId },
    include: { campaign: true, group: true, contact: true, account: { select: { id: true, companyId: true, userId: true, provider: true } } },
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
  if (!recipient) {
    logger.warn("message.job.skipped", { ...baseLog, reason: "RECIPIENT_MISSING" });
    return;
  }
  const targetType = recipient.targetType;
  if (recipient.status === "SENT" || ["CANCELED", "CANCELING", "DELETED"].includes(recipient.campaign.status)) {
    logger.info("message.job.skipped", { ...baseLog, recipientStatus: recipient.status, campaignStatus: recipient.campaign.status });
    return;
  }
  const claimed = await prisma.messageRecipient.updateMany({
    where: { id: recipient.id, status: { in: ["PENDING", "FAILED", "RETRYING"] } },
    data: { status: "SENDING", attemptCount: { increment: 1 } },
  });
  if (!claimed.count) {
    logger.info("message.job.claim_skipped", { ...baseLog, recipientStatus: recipient.status });
    return;
  }
  await prisma.messageCampaign.updateMany({ where: { id: recipient.campaignId, status: "QUEUED" }, data: { status: "SENDING" } });
  try {
    logger.info("message.job.started", { ...baseLog, targetType, attempt: job.attemptsMade + 1 });
    if ((targetType === "GROUP" && !recipient.group) || (targetType === "CONTACT" && !recipient.contact)) {
      logger.warn("message.target_resolution_failed", { ...baseLog, reason: "MESSAGE_TARGET_MISSING", targetType });
      throw new Error("MESSAGE_TARGET_MISSING");
    }
    if (jobData.companyId && jobData.companyId !== recipient.campaign.companyId) {
      logger.error("message.job.company_mismatch", new Error("MESSAGE_JOB_COMPANY_MISMATCH"), { ...baseLog, actualCompanyId: recipient.campaign.companyId });
      throw new Error("MESSAGE_JOB_COMPANY_MISMATCH");
    }
    if (jobData.campaignId && jobData.campaignId !== recipient.campaignId) {
      logger.error("message.job.campaign_mismatch", new Error("MESSAGE_JOB_CAMPAIGN_MISMATCH"), { ...baseLog, actualCampaignId: recipient.campaignId });
      throw new Error("MESSAGE_JOB_CAMPAIGN_MISMATCH");
    }
    const targetCompanyId = targetType === "CONTACT" ? recipient.contact!.companyId : recipient.group!.companyId;
    if (targetCompanyId !== recipient.campaign.companyId || recipient.account.companyId !== recipient.campaign.companyId) {
      logger.error("message.job.tenant_mismatch", new Error("MESSAGE_JOB_TENANT_MISMATCH"), {
        ...baseLog,
        targetType,
        targetCompanyId,
        accountCompanyId: recipient.account.companyId,
        campaignCompanyId: recipient.campaign.companyId,
      });
      throw new Error("MESSAGE_JOB_TENANT_MISMATCH");
    }
    const targetUserId = targetType === "CONTACT" ? recipient.contact!.userId : recipient.group!.userId;
    const targetAccountId = targetType === "CONTACT" ? recipient.contact!.accountId : recipient.group!.accountId;
    if (targetUserId !== recipient.campaign.createdById || recipient.account.userId !== recipient.campaign.createdById || targetAccountId !== recipient.accountId) {
      logger.error("message.job.ownership_mismatch", new Error("MESSAGE_JOB_OWNERSHIP_MISMATCH"), {
        ...baseLog,
        targetType,
        targetUserId,
        accountUserId: recipient.account.userId,
        campaignCreatedById: recipient.campaign.createdById,
        targetAccountId,
        recipientAccountId: recipient.accountId,
      });
      throw new Error("MESSAGE_JOB_OWNERSHIP_MISMATCH");
    }
    const deliveryPolicy = await composeOutboundMessage({
      companyId: recipient.campaign.companyId,
      userId: recipient.campaign.createdById,
      whatsappAccountId: recipient.accountId,
      originalText: recipient.campaign.content,
      messageType: targetType,
      recipientId: recipient.id,
      transportAdapter: recipient.account.provider,
      existingRendering: {
        renderedContent: recipient.renderedContent ?? "",
        attributionApplied: recipient.attributionApplied,
        attributionLocale: recipient.attributionLocale,
        attributionVersion: recipient.attributionVersion,
        effectivePlanCode: recipient.effectivePlanCode,
        renderedAt: recipient.renderedAt,
      },
    });
    if (targetType === "GROUP" && !deliveryPolicy.entitlements.groupMessaging) throw new Error("GROUP_MESSAGING_NOT_AVAILABLE");
    if (targetType === "CONTACT" && !deliveryPolicy.entitlements.contactMessaging) throw new Error("CONTACT_MESSAGING_REQUIRES_PROFESSIONAL");
    logger.info("message.outbound_payload.prepared", {
      ...baseLog,
      targetType,
      whatsappAccountId: recipient.accountId,
      planCode: deliveryPolicy.effectivePlanCode,
      brandingRequired: deliveryPolicy.attributionApplied,
      brandingLocale: deliveryPolicy.attributionLocale,
      brandingVersion: deliveryPolicy.attributionVersion,
      finalBodyLength: deliveryPolicy.finalBodyLength,
      finalPayloadHash: deliveryPolicy.finalPayloadHash,
      transportAdapter: recipient.account.provider,
      reusedStableRendering: deliveryPolicy.reusedStableRendering,
    });
    if (!deliveryPolicy.reusedStableRendering) {
      await traceMessageStage("worker.recipient.persist_rendering", baseLog, async () => {
        await prisma.messageRecipient.update({
          where: { id: recipient.id },
          data: {
            renderedContent: deliveryPolicy.content,
            attributionApplied: deliveryPolicy.attributionApplied,
            attributionLocale: deliveryPolicy.attributionLocale,
            attributionVersion: deliveryPolicy.attributionVersion,
            effectivePlanCode: deliveryPolicy.effectivePlanCode,
            renderedAt: deliveryPolicy.renderedAt,
          },
        });
      });
    }
    const sendOutcome = targetType === "CONTACT"
      ? await (async () => {
          const target = await prisma.contact.findFirst({
            where: {
              id: recipient.contact!.id,
              companyId: recipient.campaign.companyId,
              userId: recipient.campaign.createdById,
              accountId: recipient.accountId,
              isActive: true,
              isWhatsAppUser: true,
              account: { id: recipient.accountId, companyId: recipient.campaign.companyId, userId: recipient.campaign.createdById, archivedAt: null },
            },
          });
          if (!target) throw new Error("WHATSAPP_CONTACT_OWNERSHIP_MISMATCH");
          logger.debug("message.send.attempt", { ...baseLog, targetType, accountId: target.accountId, contactId: target.id });
          const result = await traceMessageStage("worker.baileys.contact_send", { ...baseLog, accountId: target.accountId, contactId: target.id }, async () =>
            withWhatsAppAccountLock(
              target.accountId,
              "message-send-contact",
              () => provider.sendContactMessage({
                accountId: target.accountId,
                contactExternalId: target.externalContactId,
                content: deliveryPolicy.content,
                correlationId,
                campaignId: recipient.campaignId,
                recipientId: recipient.id,
              }),
              { ttlMs: 180_000, timeoutMs: 45_000, correlationId },
            ),
          );
          return { accountId: target.accountId, result };
        })()
      : await (async () => {
          const sourceGroup = recipient.group!;
          const [target] = await traceMessageStage("worker.target.resolve", baseLog, async () =>
            resolveSendableWhatsAppGroups(recipient.campaign.companyId, [sourceGroup.id], { userId: recipient.campaign.createdById, accountId: recipient.accountId }),
          );
          if (!target) throw new Error("WHATSAPP_RECONNECT_REQUIRED");
          if (target.id !== sourceGroup.id || target.accountId !== recipient.accountId) {
            await traceMessageStage("worker.recipient.retarget", { ...baseLog, accountId: target.accountId, groupId: target.id }, async () => {
              await prisma.messageRecipient.update({ where: { id: recipient.id }, data: { groupId: target.id, accountId: target.accountId, recipientName: target.name, recipientExternalId: target.externalGroupId } });
            });
          }
          logger.debug("message.send.attempt", { ...baseLog, targetType, accountId: target.accountId, groupId: target.id });
          const result = await traceMessageStage("worker.baileys.send", { ...baseLog, accountId: target.accountId, groupId: target.id, groupExternalId: target.externalGroupId }, async () =>
            withWhatsAppAccountLock(
              target.accountId,
              "message-send",
              () => provider.sendGroupMessage({
                accountId: target.accountId,
                groupExternalId: target.externalGroupId,
                content: deliveryPolicy.content,
                correlationId,
                campaignId: recipient.campaignId,
                recipientId: recipient.id,
              }),
              { ttlMs: 180_000, timeoutMs: 45_000, correlationId },
            ),
          );
          return { accountId: target.accountId, result };
        })();
    const sendResult = sendOutcome.result;
    const sentAt = new Date();
    const messageKeyJson = JSON.parse(JSON.stringify(sendResult.messageKey)) as Prisma.InputJsonValue;
    await traceMessageStage("worker.recipient.mark_sent", { ...baseLog, accountId: sendOutcome.accountId, externalMessageId: sendResult.externalMessageId }, async () => {
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
    logger.debug("message.send.succeeded", { ...baseLog, targetType, accountId: sendOutcome.accountId });
  } catch (error) {
    const attempts = Number(job.opts.attempts ?? 1);
    const finalAttempt = job.attemptsMade + 1 >= attempts;
    const errorMessage = error instanceof Error ? error.message : "Send failed";
    const recoverable = isRecoverableWhatsAppSendError(error);
    if (recoverable) {
      await prisma.messageRecipient.update({
        where: { id: recipient.id },
        data: { status: "RETRYING", failedAt: null, errorMessage: finalAttempt ? "WHATSAPP_RESTORING_CONNECTION" : "WHATSAPP_RETRYING_CONNECTION" },
      });
      const activePairing = await isPhonePairingActive(recipient.accountId).catch(() => false);
      if (activePairing) {
        logger.warn("message.reconnect.skipped_active_pairing", { ...baseLog, accountId: recipient.accountId, finalAttempt });
      } else {
        await prisma.whatsAppAccount.updateMany({
          where: { id: recipient.accountId, archivedAt: null, OR: [{ lastError: null }, { lastError: { not: "WHATSAPP_LOGGED_OUT" } }] },
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
    const permanentFailure = isPermanentMessageDeliveryError(error);
    await prisma.messageRecipient.update({
      where: { id: recipient.id },
      data: { status: finalAttempt || permanentFailure ? "FAILED" : "PENDING", failedAt: finalAttempt || permanentFailure ? new Date() : null, errorMessage },
    });
    if (finalAttempt || permanentFailure) {
      logger.error("MESSAGE_FAILED", error, { ...baseLog, accountId: recipient.accountId });
      const queue = deadLetterQueue();
      try {
        await queue.add("message-send-failed", { ...jobData, companyId: recipient.campaign.companyId, campaignId: recipient.campaignId, recipientId: recipient.id, correlationId, errorMessage, permanentFailure }, { jobId: `dead-letter-${recipient.id}` });
      } finally {
        await queue.close();
      }
    }
    logger.error("message.send.failed", error, { ...baseLog, accountId: recipient.accountId, finalAttempt, permanentFailure });
    if (permanentFailure) return;
    throw error;
  } finally {
    const aggregate = await updateMessageCampaignDeliveryAggregate(recipient.campaignId, { correlationId, workerId });
    if (aggregate && !aggregate.pending && ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(aggregate.nextStatus) && aggregate.previousStatus !== aggregate.nextStatus) {
      void createCampaignFinalNotification(aggregate.campaign).catch((error) => logger.error("notification.campaign_final.failed", error, { campaignId: aggregate.campaign.id, correlationId }));
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
    include: { campaign: true, group: true, contact: true, account: { select: { id: true, companyId: true, userId: true, archivedAt: true } } },
  });
  const targetJid = jobData.targetJid ?? jobData.groupJid;
  const baseLog = {
    workerId,
    jobId: job.id,
    companyId: jobData.companyId,
    campaignId: jobData.campaignId,
    recipientId: jobData.recipientId,
    accountId: jobData.whatsappAccountId,
    targetType: jobData.targetType,
    targetJid,
    correlationId: jobData.correlationId,
  };
  logger.info("message.delete.job.received", baseLog);
  if (!recipient) {
    logger.warn("message.delete.job.skipped", { ...baseLog, reason: "RECIPIENT_MISSING" });
    return;
  }
  const finishAggregate = () => updateCampaignDeleteAggregate(recipient.campaignId).catch((error) => logger.error("message.delete.aggregate_failed", error, baseLog));
  const targetOwnershipValid = recipient.targetType === "CONTACT"
    ? recipient.contact?.companyId === jobData.companyId && recipient.contact.userId === jobData.userId && recipient.contact.accountId === jobData.whatsappAccountId
    : recipient.group?.companyId === jobData.companyId && recipient.group.userId === jobData.userId && recipient.group.accountId === jobData.whatsappAccountId;
  if (
    recipient.campaignId !== jobData.campaignId ||
    recipient.campaign.companyId !== jobData.companyId ||
    recipient.campaign.createdById !== jobData.userId ||
    recipient.accountId !== jobData.whatsappAccountId ||
    recipient.account.id !== jobData.whatsappAccountId ||
    recipient.account.companyId !== jobData.companyId ||
    recipient.account.userId !== jobData.userId ||
    !targetOwnershipValid ||
    (jobData.targetType && recipient.targetType !== jobData.targetType) ||
    !targetJid ||
    recipient.recipientExternalId !== targetJid
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
  if (!claimed.count) {
    logger.info("message.delete.claim_skipped", { ...baseLog, deleteForEveryoneStatus: recipient.deleteForEveryoneStatus });
    return;
  }
  try {
    await withWhatsAppAccountLock(
      recipient.accountId,
      "message-delete-for-everyone",
      () => recipient.targetType === "CONTACT"
        ? provider.deleteContactMessage({
            accountId: recipient.accountId,
            contactExternalId: recipient.recipientExternalId,
            messageKey,
            campaignId: recipient.campaignId,
            recipientId: recipient.id,
            correlationId: jobData.correlationId,
          })
        : provider.deleteGroupMessage({
            accountId: recipient.accountId,
            groupExternalId: recipient.recipientExternalId,
            messageKey,
            campaignId: recipient.campaignId,
            recipientId: recipient.id,
            correlationId: jobData.correlationId,
          }),
      { ttlMs: 120_000, timeoutMs: 45_000, correlationId: jobData.correlationId },
    );
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
    if (recoverable) {
      const activePairing = await isPhonePairingActive(recipient.accountId).catch(() => false);
      if (activePairing) {
        logger.warn("message.delete.reconnect.skipped_active_pairing", { ...baseLog, accountId: recipient.accountId, finalAttempt });
      } else {
        await prisma.whatsAppAccount.updateMany({
          where: { id: recipient.accountId, archivedAt: null, OR: [{ lastError: null }, { lastError: { not: "WHATSAPP_LOGGED_OUT" } }] },
          data: { status: "CONNECTING", lastError: "WHATSAPP_TRANSIENT_DISCONNECT" },
        });
        const reconnectQueue = whatsappQueue();
        try {
          await reconnectQueue.add("reconnect", { action: "reconnect", accountId: recipient.accountId }, { jobId: `delete-reconnect-${recipient.accountId}`, removeOnComplete: 50, removeOnFail: 100 });
        } catch (queueError) {
          logger.error("message.delete.reconnect.enqueue_failed", queueError, baseLog);
        } finally {
          await reconnectQueue.close().catch(() => undefined);
        }
      }
    }
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
    select: { id: true, pairingCode: true, pairingCodeExpiresAt: true, status: true, updatedAt: true, lastError: true },
  });
  for (const account of recoverableAccounts) {
    if (hasActivePhonePairing(account)) {
      logger.warn("whatsapp.session.recovery_skipped_active_pairing", { workerId, accountId: account.id, status: account.status });
      continue;
    }
    if (!(await hasRestorableWhatsAppCredentials(account.id))) {
      logger.warn("whatsapp.session.recovery_skipped_no_restorable_credentials", {
        workerId,
        accountId: account.id,
        status: account.status,
      });
      await prisma.whatsAppAccount.updateMany({
        where: { id: account.id, archivedAt: null, status: { in: ["CONNECTED", "CONNECTING", "DISCONNECTED"] } },
        data: { status: "DISCONNECTED", lastError: "WHATSAPP_TRANSIENT_DISCONNECT" },
      });
      continue;
    }
    await restoreWhatsAppSessionFromDatabase(account.id).catch((error) => logger.error("whatsapp.session.restore_failed", error, { accountId: account.id }));
    void provider.reconnect(account.id).catch((error) => logger.error("whatsapp.session.recovery_bootstrap_failed", error, { accountId: account.id }));
  }
}
void recoverSessions().catch((error) => logger.error("whatsapp.session.recovery_bootstrap_failed", error, { workerId }));
setInterval(
  () => void recoverSessions().catch((error) => logger.error("whatsapp.session.periodic_recovery_failed", error, { workerId })),
  Number(process.env.WHATSAPP_SESSION_RECOVERY_INTERVAL_MS || 180_000),
).unref();

async function cleanupStuckSessions() {
  const result = await cleanupStuckWhatsAppAccounts();
  if (result.count) logger.warn("whatsapp.stuck_sessions.cleaned", { count: result.count });
}
void cleanupStuckSessions().catch((error) => logger.error("whatsapp.stuck_sessions.cleanup_failed", error));
setInterval(() => void cleanupStuckSessions().catch((error) => logger.error("whatsapp.stuck_sessions.cleanup_failed", error)), 60_000).unref();
let queueRecoveryRunning = false;
async function recoverDurableQueues() {
  if (queueRecoveryRunning) return;
  queueRecoveryRunning = true;
  try {
    await reconcileDurableMessageQueues();
  } finally {
    queueRecoveryRunning = false;
  }
}
void recoverDurableQueues().catch((error) => logger.error("queue.recovery.failed", error, { workerId }));
setInterval(
  () => void recoverDurableQueues().catch((error) => logger.error("queue.recovery.failed", error, { workerId })),
  Number(process.env.QUEUE_RECOVERY_INTERVAL_MS || 60_000),
).unref();
logger.info("worker.started", { workerId, queues: [QUEUES.campaign, QUEUES.sync, QUEUES.message] });
function heartbeatDetails() {
  return {
    queueNames: [QUEUES.campaign, QUEUES.sync, QUEUES.message],
    startedAt: workerStartedAt,
    currentJobs: activeWorkerJobs,
    capacity: workerCapacity,
    status: activeWorkerJobs >= workerCapacity ? "BUSY" as const : "HEALTHY" as const,
  };
}
void writeWorkerHeartbeat(workerId, heartbeatDetails()).catch((error) => logger.error("worker.heartbeat.failed", error));
setInterval(() => void writeWorkerHeartbeat(workerId, heartbeatDetails()).catch((error) => logger.error("worker.heartbeat.failed", error)), Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS || 30_000)).unref();

logger.info("worker.ready", { workerId });

async function shutdown(signal: string, exitCode = 0) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  logger.warn("worker.shutdown.started", { workerId, signal });
  await Promise.all(workers.map((worker) => worker.close().catch((error) => logger.error("worker.shutdown.queue_failed", error, { workerId, queue: worker.name }))));
  await prisma.$disconnect();
  logger.warn("worker.shutdown.completed", { workerId, signal });
  process.exit(exitCode);
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
