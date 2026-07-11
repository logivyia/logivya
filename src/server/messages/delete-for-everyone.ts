import { Prisma } from "@prisma/client";
import type { WAMessageKey } from "@whiskeysockets/baileys";

import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { messageQueue } from "@/server/queues/client";
import { WHATSAPP_DELETE_JOB_OPTIONS, type DeleteForEveryoneJob } from "@/server/queues/contracts";

export const WHATSAPP_DELETE_FOR_EVERYONE_WINDOW_MS = Number(process.env.WHATSAPP_DELETE_FOR_EVERYONE_WINDOW_MS || 48 * 60 * 60 * 1000);

export function createDeleteCorrelationId() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `DEL-${date}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function deleteWindowExpiresAt(sentAt: Date | null | undefined) {
  return sentAt ? new Date(sentAt.getTime() + WHATSAPP_DELETE_FOR_EVERYONE_WINDOW_MS) : null;
}

export function isDeleteWindowOpen(sentAt: Date | null | undefined, now = new Date()) {
  const expiresAt = deleteWindowExpiresAt(sentAt);
  return Boolean(expiresAt && expiresAt.getTime() > now.getTime());
}

export function parseStoredMessageKey(value: Prisma.JsonValue | null | undefined): WAMessageKey | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.id !== "string" || !source.id) return null;
  return {
    id: source.id,
    remoteJid: typeof source.remoteJid === "string" ? source.remoteJid : undefined,
    fromMe: typeof source.fromMe === "boolean" ? source.fromMe : true,
    participant: typeof source.participant === "string" ? source.participant : undefined,
    senderLid: typeof source.senderLid === "string" ? source.senderLid : undefined,
    server_id: typeof source.server_id === "string" ? source.server_id : undefined,
    senderPn: typeof source.senderPn === "string" ? source.senderPn : undefined,
    participantLid: typeof source.participantLid === "string" ? source.participantLid : undefined,
    participantPn: typeof source.participantPn === "string" ? source.participantPn : undefined,
  };
}

export async function getCampaignDeleteState(campaignId: string) {
  const campaign = await prisma.messageCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, deleteForEveryoneStatus: true, deleteForEveryoneRequestedAt: true, deleteForEveryoneCompletedAt: true, deleteForEveryoneError: true },
  });
  const recipients = await prisma.messageRecipient.findMany({
    where: { campaignId, status: "SENT", platformDeletedAt: null },
    select: { id: true, sentAt: true, messageKeyJson: true, deleteForEveryoneStatus: true },
  });
  const now = new Date();
  const sentTargets = recipients.length;
  const keyedTargets = recipients.filter((recipient) => parseStoredMessageKey(recipient.messageKeyJson)).length;
  const deleted = recipients.filter((recipient) => recipient.deleteForEveryoneStatus === "DELETED").length;
  const failed = recipients.filter((recipient) => recipient.deleteForEveryoneStatus === "FAILED").length;
  const pending = recipients.filter((recipient) => recipient.deleteForEveryoneStatus === "PENDING").length;
  const processing = recipients.filter((recipient) => recipient.deleteForEveryoneStatus === "PROCESSING").length;
  const expired = recipients.filter((recipient) => recipient.deleteForEveryoneStatus === "EXPIRED" || !isDeleteWindowOpen(recipient.sentAt, now)).length;
  const eligibleTargets = recipients.filter((recipient) => parseStoredMessageKey(recipient.messageKeyJson) && recipient.deleteForEveryoneStatus !== "DELETED" && isDeleteWindowOpen(recipient.sentAt, now)).length;
  const firstSentAt = recipients.reduce<Date | null>((earliest, recipient) => {
    if (!recipient.sentAt) return earliest;
    return !earliest || recipient.sentAt < earliest ? recipient.sentAt : earliest;
  }, null);
  return {
    status: campaign?.deleteForEveryoneStatus ?? "NOT_REQUESTED",
    requestedAt: campaign?.deleteForEveryoneRequestedAt ?? null,
    completedAt: campaign?.deleteForEveryoneCompletedAt ?? null,
    error: campaign?.deleteForEveryoneError ?? null,
    eligible: eligibleTargets > 0,
    expiresAt: deleteWindowExpiresAt(firstSentAt)?.toISOString() ?? null,
    progress: { sentTargets, keyedTargets, eligibleTargets, deleted, failed, pending, processing, expired },
  };
}

export async function updateCampaignDeleteAggregate(campaignId: string) {
  const recipients = await prisma.messageRecipient.findMany({
    where: { campaignId, status: "SENT", platformDeletedAt: null },
    select: { deleteForEveryoneStatus: true, messageKeyJson: true },
  });
  const targetRecipients = recipients.filter((recipient) => parseStoredMessageKey(recipient.messageKeyJson));
  const total = targetRecipients.length;
  const deleted = targetRecipients.filter((recipient) => recipient.deleteForEveryoneStatus === "DELETED").length;
  const failed = targetRecipients.filter((recipient) => recipient.deleteForEveryoneStatus === "FAILED").length;
  const expired = targetRecipients.filter((recipient) => recipient.deleteForEveryoneStatus === "EXPIRED").length;
  const processing = targetRecipients.filter((recipient) => recipient.deleteForEveryoneStatus === "PROCESSING").length;
  const pending = targetRecipients.filter((recipient) => recipient.deleteForEveryoneStatus === "PENDING").length;
  const status =
    total === 0
      ? "DELETE_FAILED"
      : pending
        ? "DELETE_PENDING"
        : processing
          ? "DELETE_PROCESSING"
          : deleted === total
            ? "DELETED_FOR_EVERYONE"
            : deleted > 0
              ? "PARTIALLY_DELETED"
              : expired === total
                ? "DELETE_EXPIRED"
                : failed || expired
                  ? "DELETE_FAILED"
                  : "NOT_REQUESTED";
  await prisma.messageCampaign.update({
    where: { id: campaignId },
    data: {
      deleteForEveryoneStatus: status,
      deleteForEveryoneCompletedAt: ["DELETED_FOR_EVERYONE", "PARTIALLY_DELETED", "DELETE_FAILED", "DELETE_EXPIRED"].includes(status) ? new Date() : null,
      deleteForEveryoneError: status === "DELETE_FAILED" ? "Silme islemi bazi hedeflerde basarisiz oldu." : null,
    },
  });
  return { status, total, deleted, failed, expired, processing, pending };
}

export async function attachDeleteState<T extends { id: string }>(campaigns: T[]) {
  const states = await Promise.all(campaigns.map((campaign) => getCampaignDeleteState(campaign.id)));
  return campaigns.map((campaign, index) => ({ ...campaign, deleteForEveryone: states[index] }));
}

export async function requestCampaignDeleteForEveryone(input: { campaignId: string; companyId: string; userId: string }) {
  const correlationId = createDeleteCorrelationId();
  const campaign = await prisma.messageCampaign.findFirst({
    where: { id: input.campaignId, companyId: input.companyId, createdById: input.userId, deletedAt: null },
    select: {
      id: true,
      recipients: {
        where: { status: "SENT", platformDeletedAt: null },
        select: {
          id: true,
          accountId: true,
          targetType: true,
          recipientExternalId: true,
          sentAt: true,
          messageKeyJson: true,
          account: { select: { id: true, companyId: true, userId: true, archivedAt: true } },
          group: { select: { companyId: true, userId: true, accountId: true } },
          contact: { select: { companyId: true, userId: true, accountId: true, isActive: true } },
        },
      },
    },
  });
  if (!campaign) return { ok: false as const, status: 404, error: "NOT_FOUND", correlationId };

  const now = new Date();
  const queue = messageQueue();
  let queued = 0;
  let expired = 0;
  let failed = 0;
  try {
    for (const recipient of campaign.recipients) {
      const messageKey = parseStoredMessageKey(recipient.messageKeyJson);
      if (!messageKey) {
        failed += 1;
        await prisma.messageRecipient.update({ where: { id: recipient.id }, data: { deleteForEveryoneStatus: "FAILED", deleteForEveryoneAttemptedAt: now, deleteForEveryoneError: "WHATSAPP_MESSAGE_KEY_MISSING" } });
        continue;
      }
      if (!isDeleteWindowOpen(recipient.sentAt, now)) {
        expired += 1;
        await prisma.messageRecipient.update({ where: { id: recipient.id }, data: { deleteForEveryoneStatus: "EXPIRED", deleteForEveryoneAttemptedAt: now, deleteForEveryoneError: "WHATSAPP_DELETE_WINDOW_EXPIRED" } });
        continue;
      }
      const groupOwnershipInvalid = recipient.targetType === "GROUP" && (
        recipient.group?.companyId !== input.companyId ||
        recipient.group?.userId !== input.userId ||
        recipient.group?.accountId !== recipient.accountId
      );
      const contactOwnershipInvalid = recipient.targetType === "CONTACT" && (
        recipient.contact?.companyId !== input.companyId ||
        recipient.contact?.userId !== input.userId ||
        recipient.contact?.accountId !== recipient.accountId
      );
      if (
        recipient.account.id !== recipient.accountId ||
        recipient.account.companyId !== input.companyId ||
        recipient.account.userId !== input.userId ||
        groupOwnershipInvalid ||
        contactOwnershipInvalid ||
        recipient.account.archivedAt
      ) {
        failed += 1;
        await prisma.messageRecipient.update({ where: { id: recipient.id }, data: { deleteForEveryoneStatus: "FAILED", deleteForEveryoneAttemptedAt: now, deleteForEveryoneError: "WHATSAPP_TARGET_OWNERSHIP_INVALID" } });
        continue;
      }
      await prisma.messageRecipient.update({
        where: { id: recipient.id },
        data: { deleteForEveryoneStatus: "PENDING", deleteForEveryoneAttemptedAt: now, deleteForEveryoneCompletedAt: null, deleteForEveryoneError: null },
      });
      const payload: DeleteForEveryoneJob = {
        companyId: input.companyId,
        campaignId: campaign.id,
        recipientId: recipient.id,
        whatsappAccountId: recipient.accountId,
        groupJid: recipient.targetType === "GROUP" ? recipient.recipientExternalId : undefined,
        targetJid: recipient.recipientExternalId,
        targetType: recipient.targetType,
        messageKeyJson: recipient.messageKeyJson,
        userId: input.userId,
        correlationId,
      };
      await queue.add("delete-for-everyone", payload, { jobId: `delete-everyone-${recipient.id}-${Date.now()}`, ...WHATSAPP_DELETE_JOB_OPTIONS });
      queued += 1;
    }
  } finally {
    await queue.close().catch(() => undefined);
  }
  await prisma.messageCampaign.update({
    where: { id: campaign.id },
    data: {
      deleteForEveryoneStatus: queued ? "DELETE_PENDING" : expired ? "DELETE_EXPIRED" : "DELETE_FAILED",
      deleteForEveryoneRequestedAt: now,
      deleteForEveryoneError: queued ? null : expired ? "WHATSAPP_DELETE_WINDOW_EXPIRED" : "WHATSAPP_MESSAGE_KEY_MISSING",
    },
  });
  const aggregate = await updateCampaignDeleteAggregate(campaign.id);
  logger.info("message.delete_for_everyone.queued", { campaignId: campaign.id, companyId: input.companyId, userId: input.userId, queued, expired, failed, correlationId, aggregateStatus: aggregate.status });
  return { ok: queued > 0, status: queued > 0 ? 202 : 409, queued, expired, failed, correlationId, aggregate };
}
