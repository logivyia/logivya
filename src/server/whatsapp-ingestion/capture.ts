// This server module is imported by the standalone WhatsApp worker as well as
// Next.js route handlers. The `server-only` sentinel intentionally throws when
// it is executed outside Next's bundler, so importing it here prevents the
// production worker from booting. Keep this module free of client exports and
// enforce the boundary at its callers instead.

import { createHash, randomUUID } from "node:crypto";
import { Prisma, type WhatsAppInboundAttachmentKind } from "@prisma/client";

import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { encryptPrivateValue, keyedPrivateHash } from "@/server/security/private-fields";
import { enqueueWhatsAppIngestionStage } from "@/server/whatsapp-ingestion/queue";

export type CapturedAttachment = {
  providerAttachmentId?: string | null;
  kind: WhatsAppInboundAttachmentKind;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  contentHash?: string | null;
  caption?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type CaptureWhatsAppMessageInput = {
  accountId: string;
  externalGroupId: string;
  providerMessageId: string;
  sourceMessageTimestamp: Date;
  text: string;
  messageType: string;
  senderJid?: string | null;
  senderDisplayName?: string | null;
  attachments?: CapturedAttachment[];
  edited?: boolean;
};

export async function captureApprovedWhatsAppMessage(input: CaptureWhatsAppMessageInput) {
  const control = await prisma.whatsAppIngestionControl.findUnique({ where: { id: "global" } });
  if (control?.emergencyKillSwitch || control?.globallyPaused) {
    return { accepted: false, reason: control.emergencyKillSwitch ? "EMERGENCY_KILL_SWITCH" : "GLOBALLY_PAUSED" } as const;
  }

  const group = await prisma.whatsAppGroup.findFirst({
    where: {
      accountId: input.accountId,
      externalGroupId: input.externalGroupId,
      isArchived: false,
      ingestionEnabled: true,
      ingestionApprovedAt: { not: null },
      ingestionPausedAt: null,
      account: { archivedAt: null, status: "CONNECTED" },
    },
    select: { id: true, accountId: true },
  });
  if (!group) return { accepted: false, reason: "SOURCE_NOT_APPROVED" } as const;

  const text = input.text.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, 12_000);
  if (!text) return { accepted: false, reason: "EMPTY_CONTENT" } as const;
  const contentHash = sha256(text);
  const retentionDays = Math.min(30, Math.max(1, control?.rawRetentionDays ?? 7));
  const rawExpiresAt = new Date(Date.now() + retentionDays * 86_400_000);
  const encryptedText = encryptPrivateValue(text);
  const senderIdentityHash = input.senderJid ? keyedPrivateHash("whatsapp-inbound-sender", input.senderJid) : null;
  const senderPhone = senderPhoneFromJid(input.senderJid);
  const senderDisplayName = safeSenderDisplayName(input.senderDisplayName);
  const senderPhoneEncrypted = senderPhone ? encryptPrivateValue(senderPhone) : null;
  const senderDisplayNameEncrypted = senderDisplayName ? encryptPrivateValue(senderDisplayName) : null;
  const providerMessageKeyHash = sha256(`${input.accountId}:${input.externalGroupId}:${input.providerMessageId}`);

  const existing = await prisma.whatsAppInboundMessage.findUnique({
    where: { accountId_providerMessageId: { accountId: input.accountId, providerMessageId: input.providerMessageId } },
    select: {
      id: true, contentHash: true, stageVersion: true, groupId: true, status: true,
      extractions: { select: { publishedListingKind: true, publishedListingId: true } },
    },
  });
  const edited = Boolean(existing && (input.edited || existing.contentHash !== contentHash));
  const stageVersion = edited ? existing!.stageVersion + 1 : existing?.stageVersion ?? 1;

  const message = await prisma.$transaction(async (tx) => {
    const row = await tx.whatsAppInboundMessage.upsert({
      where: { accountId_providerMessageId: { accountId: input.accountId, providerMessageId: input.providerMessageId } },
      create: {
        accountId: input.accountId,
        groupId: group.id,
        providerMessageId: input.providerMessageId,
        providerMessageKeyHash,
        senderIdentityHash,
        senderPhoneEncrypted,
        senderDisplayNameEncrypted,
        messageType: input.messageType.slice(0, 80),
        rawTextEncrypted: encryptedText,
        contentHash,
        sourceMessageTimestamp: input.sourceMessageTimestamp,
        rawExpiresAt,
      },
      update: edited ? {
        groupId: group.id,
        senderIdentityHash,
        senderPhoneEncrypted,
        senderDisplayNameEncrypted,
        messageType: input.messageType.slice(0, 80),
        rawTextEncrypted: encryptedText,
        normalizedText: null,
        contentHash,
        status: "RECEIVED",
        currentStage: "WHATSAPP_INBOUND",
        stageVersion,
        attemptCount: 0,
        nextAttemptAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastHeartbeatAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        processedAt: null,
        editedAtSource: new Date(),
        deletedAtSource: null,
        rawExpiresAt,
      } : {
        receivedAt: new Date(),
        ...(senderPhoneEncrypted ? { senderPhoneEncrypted } : {}),
        ...(senderDisplayNameEncrypted ? { senderDisplayNameEncrypted } : {}),
      },
      select: { id: true, accountId: true, groupId: true, stageVersion: true },
    });

    if (edited) {
      for (const extraction of existing?.extractions ?? []) {
        if (!extraction.publishedListingId || !extraction.publishedListingKind) continue;
        if (extraction.publishedListingKind === "LOAD") {
          await tx.freightListing.updateMany({ where: { id: extraction.publishedListingId }, data: { status: "INACTIVE", deactivatedAt: new Date() } });
        } else if (extraction.publishedListingKind === "VEHICLE") {
          await tx.vehicleListing.updateMany({ where: { id: extraction.publishedListingId }, data: { status: "INACTIVE", deactivatedAt: new Date() } });
        } else {
          await tx.driverListing.updateMany({ where: { id: extraction.publishedListingId }, data: { status: "INACTIVE", deactivatedAt: new Date() } });
        }
      }
      await tx.whatsAppListingExtraction.updateMany({
        where: { inboundMessageId: row.id, reviewStatus: { not: "DELETED_AT_SOURCE" } },
        data: { reviewStatus: "EXPIRED", reviewNote: "SOURCE_MESSAGE_EDITED" },
      });
    }

    for (const [index, attachment] of (input.attachments ?? []).entries()) {
      const providerAttachmentId = attachment.providerAttachmentId || `${input.providerMessageId}:${index}`;
      await tx.whatsAppInboundAttachment.upsert({
        where: { inboundMessageId_providerAttachmentId: { inboundMessageId: row.id, providerAttachmentId } },
        create: {
          inboundMessageId: row.id,
          providerAttachmentId,
          kind: attachment.kind,
          mimeType: attachment.mimeType?.slice(0, 160) || null,
          fileName: attachment.fileName?.slice(0, 240) || null,
          fileSize: attachment.fileSize ?? null,
          contentHash: attachment.contentHash || null,
          captionEncrypted: attachment.caption ? encryptPrivateValue(attachment.caption.slice(0, 4_000)) : null,
          latitude: attachment.latitude == null ? null : new Prisma.Decimal(attachment.latitude),
          longitude: attachment.longitude == null ? null : new Prisma.Decimal(attachment.longitude),
          expiresAt: rawExpiresAt,
        },
        update: { expiresAt: rawExpiresAt },
      });
    }

    await tx.whatsAppGroup.update({
      where: { id: group.id },
      data: { lastInboundMessageAt: new Date() },
    });
    await tx.whatsAppIngestionAuditLog.create({
      data: {
        inboundMessageId: row.id,
        groupId: group.id,
        action: edited ? "inbound.message.edited" : existing ? "inbound.message.replayed" : "inbound.message.received",
        stage: "WHATSAPP_INBOUND",
        status: "RECEIVED",
        metadata: { messageType: input.messageType, attachmentCount: input.attachments?.length ?? 0 },
      },
    });
    return row;
  });

  if (!existing || edited) {
    await enqueueWhatsAppIngestionStage({
      inboundMessageId: message.id,
      accountId: message.accountId,
      groupId: message.groupId,
      stage: "WHATSAPP_INBOUND",
      stageVersion: message.stageVersion,
      correlationId: `ing-${randomUUID()}`,
    });
  }

  logger.info("whatsapp_ingestion.message_captured", {
    inboundMessageId: message.id,
    groupId: message.groupId,
    replay: Boolean(existing && !edited),
    edited,
  });
  return { accepted: true, inboundMessageId: message.id, replay: Boolean(existing && !edited), edited } as const;
}

export async function markWhatsAppSourceMessageDeleted(input: {
  accountId: string;
  providerMessageId: string;
}) {
  const message = await prisma.whatsAppInboundMessage.findUnique({
    where: { accountId_providerMessageId: input },
    select: {
      id: true,
      groupId: true,
      extractions: { select: { id: true, publishedListingKind: true, publishedListingId: true } },
    },
  });
  if (!message) return { found: false };
  await prisma.$transaction(async (tx) => {
    await tx.whatsAppInboundMessage.update({
      where: { id: message.id },
      data: { status: "DELETED_AT_SOURCE", currentStage: "COMPLETED", deletedAtSource: new Date(), processedAt: new Date() },
    });
    await tx.whatsAppListingExtraction.updateMany({
      where: { inboundMessageId: message.id },
      data: { reviewStatus: "DELETED_AT_SOURCE", reviewNote: "SOURCE_MESSAGE_DELETED" },
    });
    for (const extraction of message.extractions) {
      if (!extraction.publishedListingId || !extraction.publishedListingKind) continue;
      if (extraction.publishedListingKind === "LOAD") {
        await tx.freightListing.updateMany({ where: { id: extraction.publishedListingId }, data: { status: "INACTIVE", deactivatedAt: new Date() } });
      } else if (extraction.publishedListingKind === "VEHICLE") {
        await tx.vehicleListing.updateMany({ where: { id: extraction.publishedListingId }, data: { status: "INACTIVE", deactivatedAt: new Date() } });
      } else {
        await tx.driverListing.updateMany({ where: { id: extraction.publishedListingId }, data: { status: "INACTIVE", deactivatedAt: new Date() } });
      }
    }
    await tx.whatsAppIngestionAuditLog.create({
      data: { inboundMessageId: message.id, groupId: message.groupId, action: "inbound.message.deleted", status: "DELETED_AT_SOURCE" },
    });
  });
  return { found: true };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function senderPhoneFromJid(value: string | null | undefined) {
  const candidate = value?.trim().toLowerCase();
  if (!candidate?.endsWith("@s.whatsapp.net")) return null;
  const phone = candidate.slice(0, -"@s.whatsapp.net".length).replace(/:\d+$/u, "").replace(/\D/gu, "");
  return phone.length >= 7 && phone.length <= 20 ? phone : null;
}

function safeSenderDisplayName(value: string | null | undefined) {
  const candidate = value?.normalize("NFKC").replace(/[\p{Cc}\p{Cf}]+/gu, " ").replace(/\s+/gu, " ").trim();
  if (!candidate || /(?:@s\.whatsapp\.net|@lid|@g\.us)$/iu.test(candidate)) return null;
  if (/^[+\d\s().-]{7,}$/u.test(candidate)) return null;
  if (/^(?:null|undefined|unknown|n\/a)$/iu.test(candidate)) return null;
  return candidate.slice(0, 120);
}
