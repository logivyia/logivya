import "server-only";

import type { Prisma } from "@prisma/client";
import { after } from "next/server";
import { getEmailProviderStatus } from "@/lib/email/email-provider";
import { LOGIVYA_PLATFORM_OWNER_EMAIL } from "@/server/auth/platform-owner";
import { prisma } from "@/server/db";
import { sendTemplateEmailSafely } from "@/server/email/service";
import type { EmailTemplate } from "@/server/email/provider";
import { logger } from "@/server/observability/logger";
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

type SupportEmailEventKind = "ticket_created" | "user_reply" | "admin_reply" | "status_changed";
const SUPPORT_EMAIL_EVENT_KINDS = new Set<SupportEmailEventKind>(["ticket_created", "user_reply", "admin_reply", "status_changed"]);

function inferEventKind(notificationType: string, emailTemplate: EmailTemplate): SupportEmailEventKind {
  if (emailTemplate === "support_created" || notificationType === "support.admin_new_ticket") return "ticket_created";
  if (notificationType === "support.user_replied") return "user_reply";
  if (notificationType === "support.status_changed" || notificationType === "support.ticket_closed" || notificationType === "support.ticket_reopened") return "status_changed";
  return "admin_reply";
}

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

  logger.info("support_notification_created", {
    ticketId: input.ticketId,
    companyId: input.recipient.companyId,
    userId: input.recipient.userId,
    notificationType: input.type,
  });
  logger.info("support_email_queued", {
    ticketId: input.ticketId,
    companyId: input.recipient.companyId,
    userId: input.recipient.userId,
    notificationType: input.type,
  });

  return notification;
}

async function deliverOutboxRow(row: {
  id: string;
  ticketId: string;
  companyId: string;
  recipientUserId: string | null;
  notificationId: string | null;
  template: string;
  payload: Prisma.JsonValue;
}) {
  if (!row.recipientUserId || !row.notificationId) throw new Error("SUPPORT_NOTIFICATION_RECIPIENT_MISSING");

  const [recipient, notification, ticket] = await Promise.all([
    prisma.user.findUnique({
      where: { id: row.recipientUserId },
      select: { email: true, locale: true },
    }),
    prisma.notification.findUnique({ where: { id: row.notificationId } }),
    prisma.supportTicket.findUnique({
      where: { id: row.ticketId },
      select: {
        publicId: true,
        subject: true,
        category: true,
        priority: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        company: { select: { name: true } },
        createdBy: { select: { name: true, email: true } },
      },
    }),
  ]);
  if (!recipient || !notification || !ticket) throw new Error("SUPPORT_NOTIFICATION_TARGET_MISSING");

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
    if (!provider.configured) throw new Error("EMAIL_CONFIGURATION_MISSING");
    const requestedTemplate = payload.emailTemplate;
    const emailTemplate = typeof requestedTemplate === "string" && EMAIL_TEMPLATES.has(requestedTemplate as EmailTemplate)
      ? requestedTemplate as EmailTemplate
      : "support_replied";
    const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
    const eventKind = typeof payload.eventKind === "string" && SUPPORT_EMAIL_EVENT_KINDS.has(payload.eventKind as SupportEmailEventKind)
      ? payload.eventKind as SupportEmailEventKind
      : inferEventKind(notification.type, emailTemplate);
    const message = messageId
      ? await prisma.supportTicketMessage.findFirst({
        where: { id: messageId, ticketId: row.ticketId, isInternal: false, deletedAt: null },
        select: { message: true, createdAt: true },
      })
      : null;
    const fallbackMessage = eventKind === "status_changed"
      ? { message: localized.message, createdAt: ticket.updatedAt }
      : await prisma.supportTicketMessage.findFirst({
        where: { ticketId: row.ticketId, isInternal: false, deletedAt: null },
        orderBy: eventKind === "ticket_created" ? { createdAt: "asc" } : { createdAt: "desc" },
        select: { message: true, createdAt: true },
      });
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://www.logivya.com").replace(/\/$/, "");
    const adminDestination = `${baseUrl}/admin/support/${encodeURIComponent(ticket.publicId)}`;
    const userDestination = `${baseUrl}/support/${encodeURIComponent(ticket.publicId)}`;
    const result = await sendTemplateEmailSafely({
      to: recipient.email,
      template: emailTemplate,
      companyId: row.companyId,
      userId: row.recipientUserId,
      variables: {
        title: localized.title,
        locale: recipient.locale || "tr",
        eventKind,
        ticketNumber: ticket.publicId,
        ticketSubject: ticket.subject,
        ticketCategory: ticket.category,
        ticketPriority: ticket.priority,
        ticketStatus: ticket.status,
        userName: ticket.createdBy.name || ticket.createdBy.email,
        userEmail: ticket.createdBy.email,
        companyName: ticket.company.name,
        createdAt: (message?.createdAt || fallbackMessage?.createdAt || ticket.updatedAt || ticket.createdAt).toISOString(),
        message: message?.message || fallbackMessage?.message || localized.message,
        openUrl: eventKind === "ticket_created" || eventKind === "user_reply" ? adminDestination : userDestination,
      },
    });
    if (!result.sent) throw new Error(result.errorCode);
    logger.info("support_email_sent", {
      ticketId: row.ticketId,
      companyId: row.companyId,
      userId: row.recipientUserId,
      eventKind,
      outboxId: row.id,
    });
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
      ticketId: true,
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
      logger.error("support_notification_failed", error, {
        ticketId: row.ticketId,
        companyId: row.companyId,
        userId: row.recipientUserId ?? undefined,
        outboxId: row.id,
        channel: row.template.endsWith(".email") ? "email" : "push",
        terminal: attempts >= MAX_DELIVERY_ATTEMPTS,
      });
      if (row.template.endsWith(".email")) {
        logger.error("support_email_failed", error, {
          ticketId: row.ticketId,
          companyId: row.companyId,
          userId: row.recipientUserId ?? undefined,
          outboxId: row.id,
          terminal: attempts >= MAX_DELIVERY_ATTEMPTS,
        });
      }
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

export async function retryFailedSupportNotifications(limit = 100) {
  const failed = await prisma.supportNotificationOutbox.findMany({
    where: { status: "FAILED" },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: Math.min(500, Math.max(1, Math.trunc(limit))),
    select: { id: true },
  });
  if (!failed.length) return { queued: 0 };
  const result = await prisma.supportNotificationOutbox.updateMany({
    where: { id: { in: failed.map((row) => row.id) }, status: "FAILED" },
    data: {
      status: "PENDING",
      attempts: 0,
      availableAt: new Date(),
      deliveredAt: null,
      lastError: "MANUAL_RETRY_REQUESTED",
    },
  });
  return { queued: result.count };
}

export function scheduleSupportNotificationDelivery() {
  after(async () => {
    try {
      await processSupportNotificationOutbox(10);
    } catch (error) {
      logger.error("support.notification_outbox_failed", error, { errorCode: deliveryError(error) });
    }
  });
}
