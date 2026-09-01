import { Prisma } from "@prisma/client";
import type { PermissionCode, WorkspaceRole } from "@/server/auth/permissions";
import { hasPermission } from "@/server/auth/permissions";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { messageQueue, campaignQueue } from "@/server/queues/client";
import { SCHEDULED_MESSAGE_JOB_OPTIONS, WHATSAPP_MESSAGE_JOB_OPTIONS } from "@/server/queues/contracts";
import { nextRecurringRunAt, recurringJobId, type RecurringRule } from "@/server/queues/recurring";
import { writeAuditLog } from "@/server/security/audit";
import { requestGroupSyncIfStale, resolveCurrentWhatsAppAccount } from "@/server/whatsapp/account-scope";
import { resolveSendableWhatsAppGroups } from "@/server/whatsapp/sendable-groups";
import { createMessageCorrelationId, withCampaignMetadata } from "@/server/messages/correlation";
import { assertMessageDeliveryQueueReady, isMessageDeliveryReadinessError } from "@/server/messages/delivery-readiness";
import { traceMessageStage } from "@/server/messages/delivery-tracing";
import { resolveOwnedWhatsAppContacts } from "@/server/whatsapp/contacts";
import { resolveCategoryContactsForSend } from "@/server/categories/category-targets";
import { mediaFileReference, resolveOwnedMediaFiles } from "@/server/media/message-attachments";
import { MAX_MESSAGE_ATTACHMENTS, WHATSAPP_MAX_UPLOAD_BYTES } from "@/server/security/uploads";

type MessageScheduleType = "SEND_NOW" | "SCHEDULED" | "RECURRING";
type MessageDeliverySource = "web" | "mobile" | "recurring";

const WORKSPACE_ROLES = new Set<WorkspaceRole>(["OWNER", "ADMIN", "OPERATOR", "VIEWER"]);

export type MessageRecipientJobPayload = {
  companyId: string;
  campaignId: string;
  recipientId: string;
  correlationId: string;
  source: MessageDeliverySource | "retry" | "recoverable-retry";
  recoveryRetry?: boolean;
};

export class MessageDeliveryError extends Error {
  constructor(
    public readonly code: string,
    public readonly userMessage: string,
    public readonly status = 400,
    public readonly details?: Record<string, unknown>,
    public readonly correlationId?: string,
  ) {
    super(code);
    this.name = "MessageDeliveryError";
  }
}

export function isMessageDeliveryError(error: unknown): error is MessageDeliveryError {
  return error instanceof MessageDeliveryError;
}

function isWorkspaceRole(role: string): role is WorkspaceRole {
  return WORKSPACE_ROLES.has(role as WorkspaceRole);
}

function requiredPermission(scheduleType: MessageScheduleType): PermissionCode {
  return scheduleType === "SEND_NOW" ? "send_messages" : "schedule_messages";
}

async function assertCustomerMessagingPermission(
  actor: { companyId: string; userId: string; role: string },
  scheduleType: MessageScheduleType,
  correlationId: string,
) {
  const permission = requiredPermission(scheduleType);
  if (isWorkspaceRole(actor.role) && hasPermission(actor.role, permission)) return;

  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { ownerId: true },
  });
  if (company?.ownerId === actor.userId) {
    logger.warn("message.permission.owner_role_fallback", {
      companyId: actor.companyId,
      userId: actor.userId,
      role: actor.role,
      permission,
      correlationId,
    });
    return;
  }

  throw new MessageDeliveryError(
    "MESSAGING_PERMISSION_DENIED",
    permission === "send_messages" ? "Mesaj gonderme yetkiniz yok." : "Mesaj zamanlama yetkiniz yok.",
    403,
    { permission, role: actor.role },
    correlationId,
  );
}

function normalizeScheduleType(input: { scheduleType?: MessageScheduleType; scheduledAt?: Date }) {
  return input.scheduleType ?? (input.scheduledAt ? "SCHEDULED" : "SEND_NOW");
}

export async function enqueueMessageRecipientJobs(input: {
  companyId: string;
  campaignId: string;
  recipients: Array<{ id: string }>;
  scheduleType: MessageScheduleType;
  scheduledAt?: Date | null;
  correlationId: string;
  source: MessageRecipientJobPayload["source"];
  jobIdPrefix?: string;
}) {
  const queue = messageQueue();
  try {
    const baseDelay = input.scheduleType === "SCHEDULED" && input.scheduledAt ? Math.max(0, input.scheduledAt.getTime() - Date.now()) : 0;
    const options = input.scheduleType === "SCHEDULED" ? SCHEDULED_MESSAGE_JOB_OPTIONS : WHATSAPP_MESSAGE_JOB_OPTIONS;
    logger.info("message.queue.enqueue.started", {
      companyId: input.companyId,
      campaignId: input.campaignId,
      recipientCount: input.recipients.length,
      scheduleType: input.scheduleType,
      source: input.source,
      correlationId: input.correlationId,
    });
    for (const [index, recipient] of input.recipients.entries()) {
      const delayMs = baseDelay + index * Number(process.env.WHATSAPP_MIN_DELAY_MS || 3000);
      const payload: MessageRecipientJobPayload = {
        companyId: input.companyId,
        campaignId: input.campaignId,
        recipientId: recipient.id,
        correlationId: input.correlationId,
        source: input.source,
      };
      const job = await queue.add("send-recipient", payload, {
        jobId: `${input.jobIdPrefix ?? "recipient"}-${recipient.id}`,
        delay: delayMs,
        ...options,
      });
      logger.info("message.queue.recipient.enqueued", {
        companyId: input.companyId,
        campaignId: input.campaignId,
        recipientId: recipient.id,
        queueJobId: job.id,
        delayMs,
        source: input.source,
        correlationId: input.correlationId,
      });
    }
    logger.info("message.queue.enqueue.completed", {
      companyId: input.companyId,
      campaignId: input.campaignId,
      recipientCount: input.recipients.length,
      source: input.source,
      correlationId: input.correlationId,
    });
  } finally {
    await queue.close().catch(() => undefined);
  }
}

export async function createMessageDeliveryCampaign(
  request: Request,
  actor: { companyId: string; userId: string; role: string },
  input: {
    title: string;
    content: string;
    mediaFileId?: string;
    mediaFileIds?: string[];
    groupIds: string[];
    categoryIds: string[];
    contactIds: string[];
    scheduleType?: MessageScheduleType;
    scheduledAt?: Date;
    recurringRule?: RecurringRule;
    source: Exclude<MessageDeliverySource, "recurring">;
  },
) {
  const correlationId = createMessageCorrelationId();
  const scheduleType = normalizeScheduleType(input);
  const traceContext = {
    companyId: actor.companyId,
    userId: actor.userId,
    source: input.source,
    scheduleType,
    correlationId,
  };
  logger.info("message.delivery.request.received", {
    ...traceContext,
    requestedGroupCount: input.groupIds.length,
    requestedCategoryCount: input.categoryIds.length,
    requestedContactCount: input.contactIds.length,
  });

  await traceMessageStage("auth.permission", traceContext, async () => {
    await assertCustomerMessagingPermission(actor, scheduleType, correlationId);
  });

  await traceMessageStage("request.schedule.validate", traceContext, async () => {
    if (scheduleType === "SCHEDULED" && (!input.scheduledAt || input.scheduledAt.getTime() <= Date.now())) {
      throw new MessageDeliveryError("SCHEDULE_IN_PAST", "Gonderim zamani gelecekte olmalidir.", 400, undefined, correlationId);
    }
    if (scheduleType === "RECURRING" && !input.recurringRule) {
      throw new MessageDeliveryError("RECURRING_RULE_REQUIRED", "Tekrarlayan gonderim kurali eksik.", 400, undefined, correlationId);
    }
  });

  const requestedMediaFileIds = [...new Set([...(input.mediaFileIds ?? []), ...(input.mediaFileId ? [input.mediaFileId] : [])])];
  if (requestedMediaFileIds.length > MAX_MESSAGE_ATTACHMENTS) {
    throw new MessageDeliveryError("MEDIA_FILE_COUNT_LIMIT", `Tek gönderimde en fazla ${MAX_MESSAGE_ATTACHMENTS} dosya ekleyebilirsiniz.`, 400, undefined, correlationId);
  }
  const attachments = requestedMediaFileIds.length
    ? await traceMessageStage("request.media.resolve", traceContext, async () => {
        try {
          const files = await resolveOwnedMediaFiles(requestedMediaFileIds, actor.companyId, actor.userId);
          if (files.some((file) => file.size > WHATSAPP_MAX_UPLOAD_BYTES)) {
            throw new MessageDeliveryError("MEDIA_FILE_TOO_LARGE", "WhatsApp için her dosya en fazla 100 MB olabilir.", 400, undefined, correlationId);
          }
          return files.map(mediaFileReference);
        } catch (error) {
          if (error instanceof Error && error.message === "MEDIA_FILE_NOT_FOUND") {
            throw new MessageDeliveryError("MEDIA_FILE_NOT_FOUND", "Yüklenen dosya bulunamadı veya bu hesaba ait değil.", 400, undefined, correlationId);
          }
          throw error;
        }
      })
    : [];
  if (!input.content.trim() && !attachments.length) {
    throw new MessageDeliveryError("MESSAGE_CONTENT_REQUIRED", "Mesaj yazın veya bir dosya ekleyin.", 400, undefined, correlationId);
  }

  await traceMessageStage("queue.delivery_readiness", traceContext, async () => {
    try {
      await assertMessageDeliveryQueueReady({
        companyId: actor.companyId,
        userId: actor.userId,
        source: input.source,
        scheduleType,
        correlationId,
      });
    } catch (error) {
      if (isMessageDeliveryReadinessError(error)) {
        throw new MessageDeliveryError(
          error.code,
          "Mesaj teslim sistemi su anda hazir degil. Lutfen birkac dakika sonra tekrar deneyin.",
          503,
          error.details,
          correlationId,
        );
      }
      throw error;
    }
  });

  if (input.contactIds.length) {
    const contactAccess = await traceMessageStage("subscription.contact_access", traceContext, async () =>
      subscriptionAccess.canSendTargets(actor.companyId, { groupCount: 0, contactCount: 1 }),
    );
    if (!contactAccess.allowed) {
      const contactLocked = contactAccess.reason === "entitlement.contactMessaging";
      throw new MessageDeliveryError(
        contactLocked ? "CONTACT_MESSAGING_REQUIRES_PROFESSIONAL" : "SUBSCRIPTION_LOCKED",
        contactLocked ? "Kişilere mesaj göndermek için aktif bir abonelik gerekir." : "Aboneliğiniz aktif değil. Mesaj göndermek için paketinizi yenileyin.",
        403,
        { reason: contactAccess.reason },
        correlationId,
      );
    }
  }

  const currentAccount = await traceMessageStage("audience.current_account.resolve", traceContext, async () => {
    const account = await resolveCurrentWhatsAppAccount({ companyId: actor.companyId, userId: actor.userId });
    if (!account) {
      throw new MessageDeliveryError(
        "WHATSAPP_ACCOUNT_REQUIRED",
        "WhatsApp hesabinizi baglayin.",
        409,
        undefined,
        correlationId,
      );
    }
    void requestGroupSyncIfStale({ companyId: actor.companyId, userId: actor.userId }, account, `message-${input.source}`);
    return account;
  });

  const categoryGroups = await traceMessageStage("audience.category_groups.resolve", {
    ...traceContext,
    whatsappAccountId: currentAccount.id,
    requestedCategoryCount: input.categoryIds.length,
  }, async () => input.categoryIds.length
    ? prisma.categoryGroup.findMany({
        where: {
          categoryId: { in: input.categoryIds },
          category: { companyId: actor.companyId, archivedAt: null },
          group: { companyId: actor.companyId, userId: actor.userId, accountId: currentAccount.id, isArchived: false },
        },
        select: { groupId: true },
      })
    : []);
  const requestedIds = [...new Set([...input.groupIds, ...categoryGroups.map((item) => item.groupId)])];
  const groups = await traceMessageStage("audience.sendable_groups.resolve", {
    ...traceContext,
    requestedGroupCount: input.groupIds.length,
    requestedCategoryCount: input.categoryIds.length,
    resolvedRequestedIdCount: requestedIds.length,
    whatsappAccountId: currentAccount.id,
  }, async () => {
    try {
      return await resolveSendableWhatsAppGroups(actor.companyId, requestedIds, { userId: actor.userId, accountId: currentAccount.id });
    } catch (error) {
      if (error instanceof Error && error.message === "WHATSAPP_GROUP_OWNERSHIP_MISMATCH") {
        throw new MessageDeliveryError(
          "WHATSAPP_GROUP_OWNERSHIP_MISMATCH",
          "Bu grup bu hesaba ait degil.",
          403,
          { requestedGroupCount: requestedIds.length },
          correlationId,
        );
      }
      throw error;
    }
  });
  const categoryContactResolution = await traceMessageStage("audience.category_contacts.resolve", {
    ...traceContext,
    requestedCategoryCount: input.categoryIds.length,
    whatsappAccountId: currentAccount.id,
  }, async () => resolveCategoryContactsForSend(
    { companyId: actor.companyId, userId: actor.userId, accountId: currentAccount.id },
    input.categoryIds,
    { correlationId },
  ));
  if (categoryContactResolution.assignedCount && !(await subscriptionAccess.canUseContactMessaging(actor.companyId))) {
    throw new MessageDeliveryError(
      "CONTACT_MESSAGING_REQUIRES_PROFESSIONAL",
      "Kişilere mesaj göndermek için aktif bir abonelik gerekir.",
      403,
      { assignedContactCount: categoryContactResolution.assignedCount },
      correlationId,
    );
  }
  const directContacts = await traceMessageStage("audience.contacts.resolve", {
    ...traceContext,
    requestedContactCount: input.contactIds.length,
    whatsappAccountId: currentAccount.id,
  }, async () => {
    try {
      return await resolveOwnedWhatsAppContacts(
        { companyId: actor.companyId, userId: actor.userId, accountId: currentAccount.id },
        input.contactIds,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "WHATSAPP_CONTACT_OWNERSHIP_MISMATCH") {
        throw new MessageDeliveryError(
          "WHATSAPP_CONTACT_OWNERSHIP_MISMATCH",
          "Bu kisi bu WhatsApp hesabina ait degil.",
          403,
          { requestedContactCount: input.contactIds.length },
          correlationId,
        );
      }
      throw error;
    }
  });
  const contactsByIdentity = new Map<string, (typeof directContacts)[number]>();
  for (const contact of [...directContacts, ...categoryContactResolution.contacts]) {
    contactsByIdentity.set(`${contact.accountId}:${contact.externalContactId}`, contact);
  }
  const contacts = [...contactsByIdentity.values()];
  if (!groups.length && !contacts.length) {
    throw new MessageDeliveryError(
      "NO_SENDABLE_TARGETS",
      "Gonderilebilir WhatsApp grubu veya kisi bulunamadi.",
      400,
      {
        requestedGroupCount: input.groupIds.length,
        requestedCategoryCount: input.categoryIds.length,
        requestedContactCount: input.contactIds.length,
        skippedStaleCategoryContactCount: categoryContactResolution.skippedStaleCount,
      },
      correlationId,
    );
  }

  const access = await traceMessageStage("subscription.message_access", {
    ...traceContext,
    resolvedGroupCount: groups.length,
    resolvedContactCount: contacts.length,
  }, async () => subscriptionAccess.canSendTargets(actor.companyId, { groupCount: groups.length, contactCount: contacts.length }));
  if (!access.allowed) {
    await writeAuditLog(request, {
      companyId: actor.companyId,
      userId: actor.userId,
      action: "subscription.access_blocked",
      entityType: "MessageCampaign",
      after: { reason: access.reason, limit: access.limit, used: access.used, correlationId },
    });
    const contactLocked = access.reason === "entitlement.contactMessaging";
    throw new MessageDeliveryError(
      contactLocked ? "CONTACT_MESSAGING_REQUIRES_PROFESSIONAL" : "SUBSCRIPTION_LOCKED",
      contactLocked ? "Kisilere mesaj gondermek icin aktif bir abonelik gerekir." : "Aboneliginiz aktif degil. Mesaj gondermek icin paketinizi yenileyin.",
      403,
      { reason: access.reason, limit: access.limit, used: access.used },
      correlationId,
    );
  }

  await traceMessageStage("subscription.feature_access", traceContext, async () => {
    if (scheduleType === "SCHEDULED" && !(await subscriptionAccess.canUseScheduledMessages(actor.companyId))) {
      throw new MessageDeliveryError("SUBSCRIPTION_FEATURE_UNAVAILABLE", "Aktif abonelik bulunamadigi icin zamanli mesaj olusturulamadi.", 403, undefined, correlationId);
    }
    if (scheduleType === "RECURRING" && !(await subscriptionAccess.canUseRecurringMessages(actor.companyId))) {
      throw new MessageDeliveryError("SUBSCRIPTION_FEATURE_UNAVAILABLE", "Aktif abonelik bulunamadigi icin tekrarlayan mesaj olusturulamadi.", 403, undefined, correlationId);
    }
  });

  const campaign = await traceMessageStage("campaign.create", {
    ...traceContext,
    resolvedGroupCount: groups.length,
    resolvedContactCount: contacts.length,
  }, async () => {
    const firstRecurringRunAt = scheduleType === "RECURRING"
      ? new Date(nextRecurringRunAt(input.recurringRule as RecurringRule))
      : undefined;
    return prisma.messageCampaign.create({
    data: {
      companyId: actor.companyId,
      createdById: actor.userId,
      title: input.title,
      content: input.content,
      type: groups.length && contacts.length ? "WHATSAPP_MIXED" : contacts.length ? "WHATSAPP_CONTACT" : "WHATSAPP_GROUP",
      status: "QUEUED",
      scheduleType,
      scheduledAt: scheduleType === "SCHEDULED" ? input.scheduledAt : undefined,
      recurringRule: scheduleType === "RECURRING" ? (input.recurringRule as Prisma.InputJsonValue) : undefined,
      nextRunAt: firstRecurringRunAt,
      totalRecipients: groups.length + contacts.length,
      contentJson: withCampaignMetadata(undefined, {
        source: input.source,
        correlationId,
        requestedGroupCount: input.groupIds.length,
        requestedCategoryCount: input.categoryIds.length,
        requestedContactCount: input.contactIds.length,
        categoryAssignedContactCount: categoryContactResolution.assignedCount,
        skippedStaleCategoryContactCount: categoryContactResolution.skippedStaleCount,
        resolvedGroupCount: groups.length,
        resolvedContactCount: contacts.length,
        attachment: attachments[0] ?? undefined,
        attachments: attachments.length ? attachments : undefined,
      }),
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
    });
  });

  if (scheduleType === "RECURRING") {
    await traceMessageStage("queue.recurring.enqueue", { ...traceContext, campaignId: campaign.id }, async () => {
      const queue = campaignQueue();
      const nextRunAt = campaign.nextRunAt ?? new Date(nextRecurringRunAt(input.recurringRule as RecurringRule));
      try {
        const job = await queue.add(
          "recurring-run",
          { companyId: actor.companyId, templateCampaignId: campaign.id, correlationId, runAt: nextRunAt.toISOString() },
          { jobId: recurringJobId(campaign.id, nextRunAt.getTime()), delay: Math.max(0, nextRunAt.getTime() - Date.now()) },
        );
        logger.info("message.queue.recurring.enqueued", { ...traceContext, campaignId: campaign.id, queueJobId: job.id, nextRunAt: nextRunAt.toISOString() });
      } finally {
        await queue.close().catch(() => undefined);
      }
    });
  } else {
    await traceMessageStage("queue.recipients.enqueue", { ...traceContext, campaignId: campaign.id }, async () => {
      await enqueueMessageRecipientJobs({
        companyId: actor.companyId,
        campaignId: campaign.id,
        recipients: campaign.recipients,
        scheduleType,
        scheduledAt: campaign.scheduledAt,
        correlationId,
        source: input.source,
        jobIdPrefix: input.source === "mobile" ? "mobile-recipient" : "recipient",
      });
    });
  }

  await traceMessageStage("audit.write", { ...traceContext, campaignId: campaign.id }, async () => {
    await writeAuditLog(request, {
      companyId: actor.companyId,
      userId: actor.userId,
      action: input.source === "mobile" ? (scheduleType === "SCHEDULED" ? "mobile.message.scheduled" : "mobile.message.sent") : "campaign.created",
      entityType: "MessageCampaign",
      entityId: campaign.id,
      after: { scheduleType: campaign.scheduleType, totalRecipients: campaign.totalRecipients, correlationId, source: input.source },
    });
  });
  logger.info("message.campaign.queued", {
    companyId: actor.companyId,
    userId: actor.userId,
    campaignId: campaign.id,
    totalRecipients: campaign.totalRecipients,
    scheduleType: campaign.scheduleType,
    source: input.source,
    correlationId,
  });

  return { campaign, correlationId };
}
