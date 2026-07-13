import "server-only";

import type { Prisma } from "@prisma/client";
import { after } from "next/server";
import { getEmailProviderStatus } from "@/lib/email/email-provider";
import { LOGIVYA_PLATFORM_OWNER_EMAIL } from "@/server/auth/platform-owner";
import { prisma } from "@/server/db";
import { sendTemplateEmailSafely } from "@/server/email/service";
import type { EmailTemplate } from "@/server/email/provider";
import {
  localizeNotificationRecord,
  sendPushToUserStrict,
  type NotificationPayload,
} from "@/server/notifications/service";

const MAX_DELIVERY_ATTEMPTS = 5;
const PROCESSING_LEASE_MS = 10 * 60_000;
const EMAIL_TEMPLATES = new Set<EmailTemplate>(["support_created", "support_replied"]);
type OutboxResult = { claimed: number; delivered: number; failed: number };
let activeOutboxProcessing: Promise<OutboxResult> | null = null;

export type SupportNotificationRecipient = {
  userId: string;
  companyId: string;
  email: string;
};

type EnqueueSupportNotificationInput = {
  ticketId: string;
  recipient: SupportNotificationRecipient;
  eventKey: string;
  type: string;
  title: string;
  message: string;
  emailTemplate: EmailTemplate;
  payload: NotificationPayload;
};

function asObject(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function deliveryError(error: unknown) {
  return error instanceof Error && error.message
    ? error.message.slice(0, 240)
    : "SUPPORT_NOTIFICATION_DELIVERY_FAILED";
}

function nextAttemptAt(attempts: number) {
  const delayMs = Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + delayMs);
}

export async function resolvePlatformSupportRecipient(): Promise<SupportNotificationRecipient | null> {
  const owner = await prisma.user.findUnique({
    where: { email: LOGIVYA_PLATFORM_OWNER_EMAIL },
    select: {
      id: true,
      email: true,
      memberships: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { companyId: true },
      },
    },
  });
  const companyId = owner?.memberships[0]?.companyId;
  return owner && companyId ? { userId: owner.id, companyId, email: owner.email } : null;
}

export async function enqueueSupportNotification(
  tx: Prisma.TransactionClient,
  input: EnqueueSupportNotificationInput,
) {
  const notification = await tx.notification.create({
    data: {
      companyId: input.recipient.companyId,
      userId: input.recipient.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      payload: input.payload as Prisma.InputJsonValue,
    },
  });

  const sharedPayload = {
    ...input.payload,
    notificationType: input.type,
    emailTemplate: input.emailTemplate,
  } satisfies NotificationPayload;

  await tx.supportNotificationOutbox.createMany({
    data: ["push", "email"].map((channel) => ({
      eventKey: `${input.eventKey}:${channel}`,
      ticketId: input.ticketId,
      companyId: input.recipient.companyId,
      recipientUserId: input.recipient.userId,
      notificationId: notification.id,
      template: `${input.type}.${channel}`,
      payload: sharedPayload as Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
  });

  return notification;
}

async function deliverOutboxRow(row: {
  id: string;
  companyId: string;
  recipientUserId: string | null;
  notificationId: string | null;
  template: string;
  payload: Prisma.JsonValue;
}) {
  if (!row.recipientUserId || !row.notificationId) throw new Error("SUPPORT_NOTIFICATION_RECIPIENT_MISSING");

  const [recipient, notification] = await Promise.all([
    prisma.user.findUnique({
      where: { id: row.recipientUserId },
      select: { email: true, locale: true },
    }),
    prisma.notification.findUnique({ where: { id: row.notificationId } }),
  ]);
  if (!recipient || !notification) throw new Error("SUPPORT_NOTIFICATION_TARGET_MISSING");

  const payload = asObject(row.payload);
  const localized = await localizeNotificationRecord(notification, recipient.locale);
  if (row.template.endsWith(".push")) {
    await sendPushToUserStrict({
      companyId: row.companyId,
      userId: row.recipientUserId,
      title: localized.title,
      message: localized.message,
      type: notification.type,
      notificationId: notification.id,
      payload: payload as NotificationPayload,
    });
    return;
  }

  if (row.template.endsWith(".email")) {
    const provider = getEmailProviderStatus();
    if (!provider.configured) return;
    const requestedTemplate = payload.emailTemplate;
    const emailTemplate = typeof requestedTemplate === "string" && EMAIL_TEMPLATES.has(requestedTemplate as EmailTemplate)
      ? requestedTemplate as EmailTemplate
      : "support_replied";
    const result = await sendTemplateEmailSafely({
      to: recipient.email,
      template: emailTemplate,
      companyId: row.companyId,
      userId: row.recipientUserId,
      variables: { title: localized.title, message: localized.message, locale: recipient.locale },
    });
    if (!result.sent) throw new Error(result.errorCode);
    return;
  }

  throw new Error("SUPPORT_NOTIFICATION_CHANNEL_INVALID");
}

async function runSupportNotificationOutbox(limit: number): Promise<OutboxResult> {
  const now = new Date();
  await prisma.supportNotificationOutbox.updateMany({
    where: {
      status: "PROCESSING",
      updatedAt: { lt: new Date(now.getTime() - PROCESSING_LEASE_MS) },
    },
    data: { status: "PENDING", availableAt: now, lastError: "PROCESSING_LEASE_EXPIRED" },
  });

  const candidates = await prisma.supportNotificationOutbox.findMany({
    where: { status: "PENDING", availableAt: { lte: now }, attempts: { lt: MAX_DELIVERY_ATTEMPTS } },
    orderBy: [{ availableAt: "asc" }, { id: "asc" }],
    take: Math.min(100, Math.max(1, limit)),
    select: {
      id: true,
      companyId: true,
      recipientUserId: true,
      notificationId: true,
      template: true,
      payload: true,
      attempts: true,
    },
  });

  let delivered = 0;
  let failed = 0;
  for (const row of candidates) {
    const claim = await prisma.supportNotificationOutbox.updateMany({
      where: { id: row.id, status: "PENDING", availableAt: { lte: now } },
      data: { status: "PROCESSING", attempts: { increment: 1 }, lastError: null },
    });
    if (!claim.count) continue;

    try {
      await deliverOutboxRow(row);
      await prisma.supportNotificationOutbox.update({
        where: { id: row.id },
        data: { status: "DELIVERED", deliveredAt: new Date(), lastError: null },
      });
      delivered += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      await prisma.supportNotificationOutbox.update({
        where: { id: row.id },
        data: {
          status: attempts >= MAX_DELIVERY_ATTEMPTS ? "FAILED" : "PENDING",
          availableAt: nextAttemptAt(attempts),
          lastError: deliveryError(error),
        },
      });
      failed += 1;
    }
  }

  return { claimed: candidates.length, delivered, failed };
}

export function processSupportNotificationOutbox(limit = 25) {
  if (activeOutboxProcessing) return activeOutboxProcessing;
  activeOutboxProcessing = runSupportNotificationOutbox(limit).finally(() => {
    activeOutboxProcessing = null;
  });
  return activeOutboxProcessing;
}

export function scheduleSupportNotificationDelivery() {
  after(async () => {
    try {
      await processSupportNotificationOutbox(10);
    } catch (error) {
      console.error("support.notification_outbox_failed", { error: deliveryError(error) });
    }
  });
}
