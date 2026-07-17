import { createHash, randomUUID } from "node:crypto";
import { Prisma, type NotificationAudience, type NotificationCategory, type NotificationChannel, type NotificationPriority, type NotificationStatus } from "@prisma/client";
import { getEmailProviderStatus } from "@/lib/email/email-provider";
import { prisma } from "@/server/db";
import { sendTemplateEmailSafely } from "@/server/email/service";
import { logger } from "@/server/observability/logger";
import { notificationEventDefinition } from "@/server/notifications/registry";
import {
  isRetryableNotificationError,
  notificationBackoffMs,
  notificationDeliveryAvailableAt,
  notificationFrequencyDecision,
  resolveNotificationChannels,
} from "@/server/notifications/policy";
import { sendPushToUserStrict } from "@/server/notifications/service";
import { renderNotificationTemplate, type NotificationContent } from "@/server/notifications/templates";
import { sendWebPushToUser } from "@/server/notifications/web-push";

const MAX_BATCH = 100;
const LEASE_MS = 10 * 60_000;
const TERMINAL_OUTBOX_STATUSES: NotificationStatus[] = ["SENT", "ACCEPTED", "DELIVERED", "CANCELED", "EXPIRED", "DEAD_LETTERED"];
let activeProcessing: Promise<NotificationOutboxResult> | null = null;
let activeAudienceProcessing: Promise<NotificationAudienceResult> | null = null;

type NotificationOutboxRow = Prisma.NotificationOutboxGetPayload<{
  include: {
    user: { select: { email: true; locale: true } };
    notification: { select: { expiresAt: true } };
  };
}>;

export type NotificationRecipient = { companyId: string; userId: string };

export type EmitNotificationEventInput = {
  type: string;
  idempotencyKey: string;
  recipients: NotificationRecipient[];
  content: NotificationContent;
  payload?: Record<string, unknown>;
  companyId?: string;
  actorUserId?: string;
  audience?: NotificationAudience;
  priority?: NotificationPriority;
  channels?: NotificationChannel[];
  correlationId?: string;
  collapseKey?: string;
  deepLink?: string;
  expiresAt?: Date;
  scheduledAt?: Date;
};

export type NotificationOutboxResult = {
  claimed: number;
  delivered: number;
  retried: number;
  deadLettered: number;
  canceled: number;
};

export type NotificationAudienceResult = {
  batches: number;
  recipients: number;
  completed: number;
  retried: number;
  deadLettered: number;
};

type OutboxPayload = {
  eventPayload: Record<string, unknown>;
  content: NotificationContent;
  deepLink?: string;
};

type AudiencePayload = OutboxPayload & {
  channels?: NotificationChannel[];
  collapseKey?: string;
  expiresAt?: string;
  scheduledAt?: string;
};

export type QueueNotificationAudienceInput = Omit<EmitNotificationEventInput, "recipients" | "audience"> & {
  audience: "COMPANY_USERS" | "PLATFORM_ALL_USERS";
};

export async function emitNotificationEvent(input: EmitNotificationEventInput) {
  const definition = notificationEventDefinition(input.type);
  const recipients = dedupeRecipients(input.recipients);
  if (!recipients.length) throw new Error("NOTIFICATION_RECIPIENT_REQUIRED");
  if (!input.idempotencyKey.trim()) throw new Error("NOTIFICATION_IDEMPOTENCY_KEY_REQUIRED");

  const existing = await prisma.notificationEvent.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { notifications: { select: { id: true } } },
  });
  if (existing) return { event: existing, duplicate: true };

  const users = await prisma.user.findMany({
    where: { id: { in: recipients.map((recipient) => recipient.userId) } },
    select: { id: true, locale: true, timezone: true },
  });
  const userById = new Map(users.map((user) => [user.id, user]));
  if (userById.size !== new Set(recipients.map((recipient) => recipient.userId)).size) {
    throw new Error("NOTIFICATION_RECIPIENT_NOT_FOUND");
  }

  const memberships = await prisma.companyUser.findMany({
    where: {
      status: "ACTIVE",
      OR: recipients.map((recipient) => ({ companyId: recipient.companyId, userId: recipient.userId })),
    },
    select: { companyId: true, userId: true },
  });
  const membershipKeys = new Set(memberships.map((membership) => `${membership.companyId}:${membership.userId}`));
  if (recipients.some((recipient) => !membershipKeys.has(`${recipient.companyId}:${recipient.userId}`))) {
    throw new Error("NOTIFICATION_RECIPIENT_TENANT_MISMATCH");
  }

  const preferences = await prisma.notificationPreference.findMany({
    where: {
      OR: recipients.map((recipient) => ({ companyId: recipient.companyId, userId: recipient.userId })),
      category: definition.category,
    },
  });
  const preferencesByRecipient = new Map<string, typeof preferences>();
  for (const preference of preferences) {
    const key = `${preference.companyId}:${preference.userId}`;
    preferencesByRecipient.set(key, [...(preferencesByRecipient.get(key) ?? []), preference]);
  }
  const recentNotifications = await prisma.notification.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
      archivedAt: null,
      OR: recipients.map((recipient) => ({ companyId: recipient.companyId, userId: recipient.userId })),
    },
    select: { id: true, companyId: true, userId: true, type: true, category: true, collapseKey: true, createdAt: true, updatedAt: true, lastCollapsedAt: true },
  });
  const recentByRecipient = new Map<string, typeof recentNotifications>();
  for (const notification of recentNotifications) {
    const key = `${notification.companyId}:${notification.userId}`;
    recentByRecipient.set(key, [...(recentByRecipient.get(key) ?? []), notification]);
  }

  try {
    const queued = await prisma.$transaction(async (tx) => {
      const createdEvent = await tx.notificationEvent.create({
        data: {
          eventKey: `notification:${input.type}:${input.idempotencyKey}`,
          idempotencyKey: input.idempotencyKey,
          companyId: input.companyId,
          actorUserId: input.actorUserId,
          type: input.type,
          category: definition.category,
          audience: input.audience ?? definition.audience,
          priority: input.priority ?? definition.priority,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue,
          correlationId: input.correlationId,
          collapseKey: input.collapseKey?.trim() || input.type,
        },
      });

      let collapsed = 0;
      let rateLimited = 0;
      for (const recipient of recipients) {
        const user = userById.get(recipient.userId)!;
        const frequency = notificationFrequencyDecision({
          type: input.type,
          category: definition.category,
          priority: input.priority ?? definition.priority,
          collapseKey: input.collapseKey,
          mandatory: definition.mandatoryChannels.length > 0,
          recent: recentByRecipient.get(`${recipient.companyId}:${recipient.userId}`) ?? [],
        });
        if (frequency.action === "COLLAPSE") {
          await tx.notification.update({
            where: { id: frequency.notificationId },
            data: {
              title: input.content.title,
              message: input.content.message,
              payload: (input.payload ?? {}) as Prisma.InputJsonValue,
              deepLink: input.deepLink,
              priority: input.priority ?? definition.priority,
              isRead: false,
              readAt: null,
              archivedAt: null,
              lastCollapsedAt: new Date(),
              collapsedCount: { increment: 1 },
            },
          });
          collapsed += 1;
          continue;
        }
        if (frequency.action === "RATE_LIMIT") {
          rateLimited += 1;
          continue;
        }
        const channels = resolveNotificationChannels(
          input.channels ?? definition.defaultChannels,
          definition.mandatoryChannels,
          preferencesByRecipient.get(`${recipient.companyId}:${recipient.userId}`) ?? [],
        );
        const notification = await tx.notification.create({
          data: {
            eventId: createdEvent.id,
            companyId: recipient.companyId,
            userId: recipient.userId,
            type: input.type,
            category: definition.category,
            priority: input.priority ?? definition.priority,
            audience: input.audience ?? definition.audience,
            title: input.content.title,
            message: input.content.message,
            payload: (input.payload ?? {}) as Prisma.InputJsonValue,
            deepLink: input.deepLink,
            collapseKey: input.collapseKey?.trim() || input.type,
            expiresAt: input.expiresAt,
          },
        });
        const payload = {
          eventPayload: input.payload ?? {},
          content: input.content,
          ...(input.deepLink ? { deepLink: input.deepLink } : {}),
        } satisfies OutboxPayload;
        await tx.notificationOutbox.createMany({
          data: channels.map((channel) => ({
            eventId: createdEvent.id,
            notificationId: notification.id,
            companyId: recipient.companyId,
            userId: recipient.userId,
            channel,
            priority: input.priority ?? definition.priority,
            status: "QUEUED" as const,
            dedupeKey: `${input.idempotencyKey}:${recipient.companyId}:${recipient.userId}:${channel}`,
            templateKey: input.type,
            locale: user.locale || "tr",
            payload: payload as unknown as Prisma.InputJsonValue,
            availableAt: notificationDeliveryAvailableAt(
              channel,
              preferencesByRecipient.get(`${recipient.companyId}:${recipient.userId}`) ?? [],
              input.scheduledAt,
            ),
          })),
          skipDuplicates: true,
        });
      }
      return { event: createdEvent, collapsed, rateLimited };
    });

    logger.info("notification.event.queued", {
      eventId: queued.event.id,
      eventType: input.type,
      recipientCount: recipients.length,
      collapsed: queued.collapsed,
      rateLimited: queued.rateLimited,
      correlationId: input.correlationId,
    });
    return { ...queued, duplicate: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const event = await prisma.notificationEvent.findUniqueOrThrow({
        where: { idempotencyKey: input.idempotencyKey },
        include: { notifications: { select: { id: true } } },
      });
      return { event, duplicate: true };
    }
    throw error;
  }
}

export async function queueNotificationAudienceEvent(input: QueueNotificationAudienceInput) {
  const definition = notificationEventDefinition(input.type);
  if (input.audience === "COMPANY_USERS" && !input.companyId) throw new Error("NOTIFICATION_COMPANY_REQUIRED");
  if (!input.idempotencyKey.trim()) throw new Error("NOTIFICATION_IDEMPOTENCY_KEY_REQUIRED");
  const existing = await prisma.notificationEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { event: existing, duplicate: true };

  const audiencePayload = {
    eventPayload: input.payload ?? {},
    content: input.content,
    ...(input.deepLink ? { deepLink: input.deepLink } : {}),
    ...(input.channels ? { channels: input.channels } : {}),
    ...(input.collapseKey ? { collapseKey: input.collapseKey } : {}),
    ...(input.expiresAt ? { expiresAt: input.expiresAt.toISOString() } : {}),
    ...(input.scheduledAt ? { scheduledAt: input.scheduledAt.toISOString() } : {}),
  } satisfies AudiencePayload;

  try {
    const event = await prisma.$transaction(async (tx) => {
      const createdEvent = await tx.notificationEvent.create({
        data: {
          eventKey: `notification:${input.type}:${input.idempotencyKey}`,
          idempotencyKey: input.idempotencyKey,
          companyId: input.companyId,
          actorUserId: input.actorUserId,
          type: input.type,
          category: definition.category,
          audience: input.audience,
          priority: input.priority ?? definition.priority,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue,
          correlationId: input.correlationId,
          collapseKey: input.collapseKey?.trim() || input.type,
        },
      });
      await tx.notificationAudienceExpansion.create({
        data: {
          eventId: createdEvent.id,
          audience: input.audience,
          companyId: input.companyId,
          payload: audiencePayload as unknown as Prisma.InputJsonValue,
          status: "QUEUED",
        },
      });
      return createdEvent;
    });
    logger.info("notification.audience.queued", { eventId: event.id, audience: input.audience, companyId: input.companyId });
    return { event, duplicate: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { event: await prisma.notificationEvent.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } }), duplicate: true };
    }
    throw error;
  }
}

export function processNotificationAudienceExpansions(maxBatches = 20, batchSize = 250) {
  if (activeAudienceProcessing) return activeAudienceProcessing;
  activeAudienceProcessing = runNotificationAudienceExpansions(
    Math.min(100, Math.max(1, maxBatches)),
    Math.min(500, Math.max(10, batchSize)),
  ).finally(() => {
    activeAudienceProcessing = null;
  });
  return activeAudienceProcessing;
}

async function runNotificationAudienceExpansions(maxBatches: number, batchSize: number): Promise<NotificationAudienceResult> {
  const result: NotificationAudienceResult = { batches: 0, recipients: 0, completed: 0, retried: 0, deadLettered: 0 };
  const now = new Date();
  await prisma.notificationAudienceExpansion.updateMany({
    where: { status: "PROCESSING", leaseExpiresAt: { lt: now } },
    data: { status: "QUEUED", availableAt: now, leaseExpiresAt: null, lockedBy: null, lastErrorCode: "AUDIENCE_LEASE_EXPIRED" },
  });

  for (let index = 0; index < maxBatches; index += 1) {
    const expansion = await prisma.notificationAudienceExpansion.findFirst({
      where: { status: "QUEUED", availableAt: { lte: new Date() } },
      orderBy: [{ availableAt: "asc" }, { id: "asc" }],
      include: { event: true },
    });
    if (!expansion) break;

    const workerId = `notification-audience:${process.pid}:${randomUUID()}`;
    const claim = await prisma.notificationAudienceExpansion.updateMany({
      where: { id: expansion.id, status: "QUEUED", availableAt: { lte: new Date() } },
      data: { status: "PROCESSING", attempts: { increment: 1 }, leaseExpiresAt: new Date(Date.now() + LEASE_MS), lockedBy: workerId },
    });
    if (!claim.count) continue;
    result.batches += 1;

    try {
      const memberships = await prisma.companyUser.findMany({
        where: { status: "ACTIVE", ...(expansion.companyId ? { companyId: expansion.companyId } : {}) },
        orderBy: { id: "asc" },
        take: batchSize,
        ...(expansion.cursorId ? { cursor: { id: expansion.cursorId }, skip: 1 } : {}),
        select: { id: true, companyId: true, userId: true },
      });
      if (!memberships.length) {
        await prisma.notificationAudienceExpansion.update({
          where: { id: expansion.id },
          data: { status: "DELIVERED", completedAt: new Date(), leaseExpiresAt: null, lockedBy: null, lastErrorCode: null },
        });
        result.completed += 1;
        continue;
      }

      const payload = asAudiencePayload(expansion.payload);
      await appendNotificationRecipients(expansion.event, memberships, payload);
      result.recipients += memberships.length;
      const complete = memberships.length < batchSize;
      await prisma.notificationAudienceExpansion.update({
        where: { id: expansion.id },
        data: {
          status: complete ? "DELIVERED" : "QUEUED",
          cursorId: memberships[memberships.length - 1]!.id,
          processedCount: { increment: memberships.length },
          availableAt: new Date(),
          completedAt: complete ? new Date() : null,
          leaseExpiresAt: null,
          lockedBy: null,
          lastErrorCode: null,
        },
      });
      if (complete) result.completed += 1;
    } catch (error) {
      const errorCode = safeErrorCode(error);
      const attempt = expansion.attempts + 1;
      const deadLettered = attempt >= expansion.maxAttempts;
      await prisma.notificationAudienceExpansion.update({
        where: { id: expansion.id },
        data: {
          status: deadLettered ? "DEAD_LETTERED" : "QUEUED",
          availableAt: deadLettered ? expansion.availableAt : nextAttemptAt(attempt),
          leaseExpiresAt: null,
          lockedBy: null,
          lastErrorCode: errorCode,
        },
      });
      if (deadLettered) result.deadLettered += 1;
      else result.retried += 1;
      logger.error("notification.audience.failed", error, { expansionId: expansion.id, eventId: expansion.eventId, attempt, errorCode });
    }
  }
  return result;
}

async function appendNotificationRecipients(
  event: { id: string; idempotencyKey: string; type: string; category: NotificationCategory; priority: NotificationPriority; audience: NotificationAudience; collapseKey: string | null },
  memberships: Array<{ companyId: string; userId: string }>,
  payload: AudiencePayload,
) {
  const definition = notificationEventDefinition(event.type);
  const users = await prisma.user.findMany({
    where: { id: { in: memberships.map((membership) => membership.userId) } },
    select: { id: true, locale: true },
  });
  const userById = new Map(users.map((user) => [user.id, user]));
  const preferences = await prisma.notificationPreference.findMany({
    where: {
      OR: memberships.map((membership) => ({ companyId: membership.companyId, userId: membership.userId })),
      category: event.category,
    },
  });
  const preferencesByRecipient = new Map<string, typeof preferences>();
  for (const preference of preferences) {
    const key = `${preference.companyId}:${preference.userId}`;
    preferencesByRecipient.set(key, [...(preferencesByRecipient.get(key) ?? []), preference]);
  }
  const existingNotifications = await prisma.notification.findMany({
    where: {
      eventId: event.id,
      OR: memberships.map((membership) => ({ companyId: membership.companyId, userId: membership.userId })),
    },
    select: { companyId: true, userId: true },
  });
  const existingKeys = new Set(existingNotifications.map((notification) => `${notification.companyId}:${notification.userId}`));
  const recentNotifications = await prisma.notification.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
      archivedAt: null,
      NOT: { eventId: event.id },
      OR: memberships.map((membership) => ({ companyId: membership.companyId, userId: membership.userId })),
    },
    select: { id: true, companyId: true, userId: true, type: true, category: true, collapseKey: true, createdAt: true, updatedAt: true, lastCollapsedAt: true },
  });
  const recentByRecipient = new Map<string, typeof recentNotifications>();
  for (const notification of recentNotifications) {
    const key = `${notification.companyId}:${notification.userId}`;
    recentByRecipient.set(key, [...(recentByRecipient.get(key) ?? []), notification]);
  }

  await prisma.$transaction(async (tx) => {
    for (const recipient of memberships) {
      const user = userById.get(recipient.userId);
      if (!user) throw new Error("NOTIFICATION_RECIPIENT_NOT_FOUND");
      if (existingKeys.has(`${recipient.companyId}:${recipient.userId}`)) continue;
      const frequency = notificationFrequencyDecision({
        type: event.type,
        category: event.category,
        priority: event.priority,
        collapseKey: payload.collapseKey || event.collapseKey || undefined,
        mandatory: definition.mandatoryChannels.length > 0,
        recent: recentByRecipient.get(`${recipient.companyId}:${recipient.userId}`) ?? [],
      });
      if (frequency.action === "COLLAPSE") {
        await tx.notification.update({
          where: { id: frequency.notificationId },
          data: {
            title: payload.content.title,
            message: payload.content.message,
            payload: payload.eventPayload as Prisma.InputJsonValue,
            deepLink: payload.deepLink,
            priority: event.priority,
            isRead: false,
            readAt: null,
            archivedAt: null,
            lastCollapsedAt: new Date(),
            collapsedCount: { increment: 1 },
          },
        });
        continue;
      }
      if (frequency.action === "RATE_LIMIT") continue;
      const channels = resolveNotificationChannels(
        payload.channels ?? definition.defaultChannels,
        definition.mandatoryChannels,
        preferencesByRecipient.get(`${recipient.companyId}:${recipient.userId}`) ?? [],
      );
      const notification = await tx.notification.create({
        data: {
          eventId: event.id,
          companyId: recipient.companyId,
          userId: recipient.userId,
          type: event.type,
          category: event.category,
          priority: event.priority,
          audience: event.audience,
          title: payload.content.title,
          message: payload.content.message,
          payload: payload.eventPayload as Prisma.InputJsonValue,
          deepLink: payload.deepLink,
          collapseKey: payload.collapseKey || event.collapseKey || event.type,
          expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : undefined,
        },
      });
      await tx.notificationOutbox.createMany({
        data: channels.map((channel) => ({
          eventId: event.id,
          notificationId: notification.id,
          companyId: recipient.companyId,
          userId: recipient.userId,
          channel,
          priority: event.priority,
          status: "QUEUED" as const,
          dedupeKey: `${event.idempotencyKey}:${recipient.companyId}:${recipient.userId}:${channel}`,
          templateKey: event.type,
          locale: user.locale || "tr",
          payload: payload as unknown as Prisma.InputJsonValue,
          availableAt: notificationDeliveryAvailableAt(
            channel,
            preferencesByRecipient.get(`${recipient.companyId}:${recipient.userId}`) ?? [],
            payload.scheduledAt ? new Date(payload.scheduledAt) : undefined,
          ),
        })),
        skipDuplicates: true,
      });
    }
  });
}

export function processNotificationOutbox(limit = 50) {
  if (activeProcessing) return activeProcessing;
  activeProcessing = runNotificationOutbox(Math.min(MAX_BATCH, Math.max(1, limit))).finally(() => {
    activeProcessing = null;
  });
  return activeProcessing;
}

export async function drainNotificationOutbox(maxBatches = 20, limit = 100) {
  const total: NotificationOutboxResult = { claimed: 0, delivered: 0, retried: 0, deadLettered: 0, canceled: 0 };
  for (let index = 0; index < Math.min(100, Math.max(1, maxBatches)); index += 1) {
    const batch = await processNotificationOutbox(limit);
    for (const key of Object.keys(total) as Array<keyof NotificationOutboxResult>) total[key] += batch[key];
    if (batch.claimed < Math.min(MAX_BATCH, Math.max(1, limit))) break;
  }
  return total;
}

async function runNotificationOutbox(limit: number): Promise<NotificationOutboxResult> {
  const now = new Date();
  await prisma.notificationOutbox.updateMany({
    where: { status: "PROCESSING", leaseExpiresAt: { lt: now } },
    data: { status: "QUEUED", leaseExpiresAt: null, lockedBy: null, availableAt: now, lastErrorCode: "PROCESSING_LEASE_EXPIRED" },
  });
  const rows = await prisma.notificationOutbox.findMany({
    where: {
      status: { in: ["PENDING", "QUEUED"] },
      availableAt: { lte: now },
      attempts: { lt: 20 },
      notification: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    },
    orderBy: [{ priority: "desc" }, { availableAt: "asc" }, { id: "asc" }],
    take: limit,
    include: { user: { select: { email: true, locale: true } }, notification: { select: { expiresAt: true } } },
  });
  const result: NotificationOutboxResult = { claimed: 0, delivered: 0, retried: 0, deadLettered: 0, canceled: 0 };

  for (const row of rows) {
    const workerId = `notification-outbox:${process.pid}:${randomUUID()}`;
    const claim = await prisma.notificationOutbox.updateMany({
      where: { id: row.id, status: { in: ["PENDING", "QUEUED"] }, availableAt: { lte: now } },
      data: { status: "PROCESSING", attempts: { increment: 1 }, leaseExpiresAt: new Date(Date.now() + LEASE_MS), lockedBy: workerId, lastErrorCode: null },
    });
    if (!claim.count) continue;
    result.claimed += 1;
    const attempt = row.attempts + 1;

    try {
      const delivery = await deliverOutboxRow(row, attempt);
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: { status: delivery.status, processedAt: new Date(), leaseExpiresAt: null, lockedBy: null, lastErrorCode: null },
      });
      if (delivery.status === "CANCELED") result.canceled += 1;
      else result.delivered += 1;
    } catch (error) {
      const errorCode = safeErrorCode(error);
      if (attempt >= row.maxAttempts || !isRetryableNotificationError(errorCode)) {
        await prisma.$transaction(async (tx) => {
          await tx.notificationOutbox.update({
            where: { id: row.id },
            data: { status: "DEAD_LETTERED", leaseExpiresAt: null, lockedBy: null, processedAt: new Date(), lastErrorCode: errorCode },
          });
          await tx.notificationDelivery.upsert({
            where: { outboxId: row.id },
            create: deliveryData(row, attempt, "DEAD_LETTERED", errorCode),
            update: { status: "DEAD_LETTERED", attempts: attempt, failedAt: new Date(), lastErrorCode: errorCode },
          });
          await tx.notificationDeadLetter.upsert({
            where: { outboxId: row.id },
            create: {
              outboxId: row.id,
              eventId: row.eventId,
              companyId: row.companyId,
              userId: row.userId,
              channel: row.channel,
              reason: isRetryableNotificationError(errorCode) ? "DELIVERY_ATTEMPTS_EXHAUSTED" : "PERMANENT_DELIVERY_FAILURE",
              errorCode,
              payload: row.payload as Prisma.InputJsonValue,
              attemptCount: attempt,
            },
            update: { reason: isRetryableNotificationError(errorCode) ? "DELIVERY_ATTEMPTS_EXHAUSTED" : "PERMANENT_DELIVERY_FAILURE", errorCode, attemptCount: attempt },
          });
        });
        result.deadLettered += 1;
      } else {
        await prisma.notificationOutbox.update({
          where: { id: row.id },
          data: { status: "QUEUED", availableAt: nextAttemptAt(attempt), leaseExpiresAt: null, lockedBy: null, lastErrorCode: errorCode },
        });
        await prisma.notificationDelivery.upsert({
          where: { outboxId: row.id },
          create: deliveryData(row, attempt, "FAILED", errorCode),
          update: { status: "FAILED", attempts: attempt, failedAt: new Date(), lastErrorCode: errorCode },
        });
        result.retried += 1;
      }
      logger.error("notification.delivery.failed", error, { outboxId: row.id, eventId: row.eventId, channel: row.channel, attempt, errorCode });
    }
  }
  return result;
}

async function deliverOutboxRow(row: NotificationOutboxRow, attempt: number) {
  const payload = asOutboxPayload(row.payload);
  const content = await renderNotificationTemplate({
    eventType: row.templateKey,
    channel: row.channel,
    locale: row.locale || row.user.locale || "tr",
    variables: payload.eventPayload,
    fallback: payload.content,
  });
  let status: NotificationStatus;
  let provider: string;
  let providerMessageId: string | undefined;
  let providerMetadata: Prisma.InputJsonValue | undefined;

  if (row.channel === "IN_APP") {
    provider = "logivya-in-app";
    status = "DELIVERED";
  } else if (row.channel === "EMAIL") {
    const providerStatus = getEmailProviderStatus();
    provider = providerStatus.provider;
    const sent = await sendTemplateEmailSafely({
      to: row.user.email,
      template: "notification_generic",
      companyId: row.companyId,
      userId: row.userId,
      variables: {
        title: content.subject || content.title,
        message: content.message,
        openUrl: payload.deepLink || "",
        locale: row.locale,
      },
    });
    if (!sent.sent) throw new Error(sent.errorCode);
    providerMessageId = sent.providerId;
    status = "ACCEPTED";
  } else if (row.channel === "ANDROID_PUSH" || row.channel === "IOS_PUSH") {
    provider = "expo";
    const push = await sendPushToUserStrict({
      companyId: row.companyId,
      userId: row.userId,
      title: content.title,
      message: content.message,
      type: row.templateKey,
      notificationId: row.notificationId,
      payload: { ...payload.eventPayload, ...(payload.deepLink ? { deepLink: payload.deepLink } : {}) },
      platform: row.channel === "ANDROID_PUSH" ? "ANDROID" : "IOS",
    });
    status = push.skipped ? "CANCELED" : "SENT";
    providerMessageId = push.providerMessageId;
    providerMetadata = {
      deliveredToProvider: push.delivered,
      skipped: push.skipped,
      ticketIds: push.ticketIds,
      ticketDeviceMap: push.ticketDeviceMap,
      invalidatedTokens: push.invalidatedTokens,
    } as Prisma.InputJsonValue;
  } else if (row.channel === "WEB_PUSH") {
    provider = "web-push";
    const push = await sendWebPushToUser({
      companyId: row.companyId,
      userId: row.userId,
      payload: {
        title: content.title,
        message: content.message,
        type: row.templateKey,
        notificationId: row.notificationId,
        ...(payload.deepLink ? { deepLink: payload.deepLink } : {}),
      },
    });
    status = push.skipped ? "CANCELED" : "SENT";
    providerMessageId = push.providerMessageId;
    providerMetadata = { deliveredToProvider: push.delivered, skipped: push.skipped, invalidatedTokens: push.invalidatedTokens } as Prisma.InputJsonValue;
  } else {
    provider = "sms-future-unconfigured";
    status = "CANCELED";
  }

  await prisma.notificationDelivery.upsert({
    where: { outboxId: row.id },
    create: {
      ...deliveryData(row, attempt, status),
      provider,
      recipientHash: row.channel === "EMAIL" ? sha256(row.user.email.toLowerCase()) : sha256(`${row.companyId}:${row.userId}`),
      providerMessageId,
      providerMetadata,
      acceptedAt: ["SENT", "ACCEPTED", "DELIVERED"].includes(status) ? new Date() : undefined,
      deliveredAt: status === "DELIVERED" ? new Date() : undefined,
    },
    update: {
      status,
      provider,
      attempts: attempt,
      recipientHash: row.channel === "EMAIL" ? sha256(row.user.email.toLowerCase()) : sha256(`${row.companyId}:${row.userId}`),
      providerMessageId,
      providerMetadata,
      acceptedAt: ["SENT", "ACCEPTED", "DELIVERED"].includes(status) ? new Date() : undefined,
      deliveredAt: status === "DELIVERED" ? new Date() : undefined,
      failedAt: null,
      lastErrorCode: null,
    },
  });
  logger.info("notification.delivery.completed", { outboxId: row.id, eventId: row.eventId, channel: row.channel, status, provider, attempt });
  return { status };
}

export async function retryNotificationDeadLetter(input: { deadLetterId: string; resolvedById: string; resolution: string }) {
  const deadLetter = await prisma.notificationDeadLetter.findUniqueOrThrow({ where: { id: input.deadLetterId }, include: { outbox: true } });
  await prisma.$transaction([
    prisma.notificationDeadLetter.update({
      where: { id: deadLetter.id },
      data: { resolvedAt: new Date(), resolvedById: input.resolvedById, resolution: input.resolution.slice(0, 500) },
    }),
    prisma.notificationOutbox.update({
      where: { id: deadLetter.outboxId },
      data: { status: "QUEUED", attempts: 0, availableAt: new Date(), processedAt: null, lastErrorCode: null, leaseExpiresAt: null, lockedBy: null },
    }),
  ]);
  return { queued: true, outboxId: deadLetter.outboxId };
}

export async function recordNotificationProviderWebhook(input: {
  provider: string;
  providerEventId: string;
  eventType: string;
  signatureValid: boolean;
  rawBody: string;
  providerMessageId?: string;
  status?: NotificationStatus;
}) {
  if (!input.signatureValid) throw new Error("NOTIFICATION_WEBHOOK_SIGNATURE_INVALID");
  const webhook = await prisma.notificationProviderWebhook.upsert({
    where: { provider_providerEventId: { provider: input.provider, providerEventId: input.providerEventId } },
    create: {
      provider: input.provider,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      signatureValid: true,
      payloadHash: sha256(input.rawBody),
      status: input.status,
      processedAt: new Date(),
    },
    update: {},
  });
  if (input.providerMessageId && input.status) {
    await prisma.notificationDelivery.updateMany({
      where: { provider: input.provider, providerMessageId: input.providerMessageId },
      data: {
        status: input.status,
        deliveredAt: input.status === "DELIVERED" ? new Date() : undefined,
        failedAt: ["FAILED", "BOUNCED", "REJECTED"].includes(input.status) ? new Date() : undefined,
      },
    });
  }
  return webhook;
}

export async function enforceNotificationRetention() {
  const retentionDays = Math.min(2_555, Math.max(30, Number(process.env.NOTIFICATION_RETENTION_DAYS || 365)));
  const deviceRetentionDays = Math.min(365, Math.max(30, Number(process.env.NOTIFICATION_DEVICE_RETENTION_DAYS || 90)));
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const deviceCutoff = new Date(Date.now() - deviceRetentionDays * 86_400_000);
  const [notifications, webhooks, devices] = await prisma.$transaction([
    prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff }, OR: [{ archivedAt: { not: null } }, { expiresAt: { lt: new Date() } }] } }),
    prisma.notificationProviderWebhook.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.mobilePushToken.deleteMany({ where: { revokedAt: { lt: deviceCutoff } } }),
  ]);
  return { retentionDays, deviceRetentionDays, notificationsDeleted: notifications.count, providerWebhooksDeleted: webhooks.count, revokedDevicesDeleted: devices.count };
}

function dedupeRecipients(recipients: NotificationRecipient[]) {
  return [...new Map(recipients.map((recipient) => [`${recipient.companyId}:${recipient.userId}`, recipient])).values()];
}

function asOutboxPayload(value: Prisma.JsonValue): OutboxPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("NOTIFICATION_OUTBOX_PAYLOAD_INVALID");
  const payload = value as Record<string, unknown>;
  const content = payload.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) throw new Error("NOTIFICATION_CONTENT_MISSING");
  const title = (content as Record<string, unknown>).title;
  const message = (content as Record<string, unknown>).message;
  if (typeof title !== "string" || typeof message !== "string") throw new Error("NOTIFICATION_CONTENT_INVALID");
  return {
    eventPayload: payload.eventPayload && typeof payload.eventPayload === "object" && !Array.isArray(payload.eventPayload)
      ? payload.eventPayload as Record<string, unknown>
      : {},
    content: {
      title,
      message,
      ...((content as Record<string, unknown>).subject && typeof (content as Record<string, unknown>).subject === "string"
        ? { subject: (content as Record<string, string>).subject }
        : {}),
    },
    ...(typeof payload.deepLink === "string" ? { deepLink: payload.deepLink } : {}),
  };
}

function asAudiencePayload(value: Prisma.JsonValue): AudiencePayload {
  const payload = asOutboxPayload(value);
  const source = value as Record<string, unknown>;
  const channels = Array.isArray(source.channels)
    ? source.channels.filter((channel): channel is NotificationChannel => typeof channel === "string" && ["IN_APP", "EMAIL", "ANDROID_PUSH", "IOS_PUSH", "WEB_PUSH", "SMS_FUTURE"].includes(channel))
    : undefined;
  const collapseKey = typeof source.collapseKey === "string" && source.collapseKey.trim() ? source.collapseKey.trim().slice(0, 160) : undefined;
  const expiresAt = typeof source.expiresAt === "string" && !Number.isNaN(Date.parse(source.expiresAt)) ? source.expiresAt : undefined;
  const scheduledAt = typeof source.scheduledAt === "string" && !Number.isNaN(Date.parse(source.scheduledAt)) ? source.scheduledAt : undefined;
  return { ...payload, ...(channels?.length ? { channels } : {}), ...(collapseKey ? { collapseKey } : {}), ...(expiresAt ? { expiresAt } : {}), ...(scheduledAt ? { scheduledAt } : {}) };
}

function deliveryData(
  row: { id: string; eventId: string; notificationId: string; companyId: string; userId: string; channel: NotificationChannel },
  attempt: number,
  status: NotificationStatus,
  errorCode?: string,
) {
  return {
    eventId: row.eventId,
    notificationId: row.notificationId,
    outboxId: row.id,
    companyId: row.companyId,
    userId: row.userId,
    channel: row.channel,
    status,
    provider: providerForChannel(row.channel),
    idempotencyKey: `delivery:${row.id}`,
    attempts: attempt,
    failedAt: ["FAILED", "DEAD_LETTERED"].includes(status) ? new Date() : undefined,
    lastErrorCode: errorCode,
  };
}

function providerForChannel(channel: NotificationChannel) {
  if (channel === "IN_APP") return "logivya-in-app";
  if (channel === "EMAIL") return getEmailProviderStatus().provider;
  if (channel === "ANDROID_PUSH" || channel === "IOS_PUSH") return "expo";
  if (channel === "WEB_PUSH") return "web-push";
  return "unconfigured";
}

function nextAttemptAt(attempt: number) {
  const delay = notificationBackoffMs(attempt);
  const jitter = Math.floor(delay * 0.1 * Math.random());
  return new Date(Date.now() + delay + jitter);
}

function safeErrorCode(error: unknown) {
  const raw = error instanceof Error ? error.message : "NOTIFICATION_DELIVERY_FAILED";
  return raw.replace(/[^A-Z0-9_.:-]/gi, "_").slice(0, 160) || "NOTIFICATION_DELIVERY_FAILED";
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function isTerminalNotificationStatus(status: NotificationStatus) {
  return TERMINAL_OUTBOX_STATUSES.includes(status);
}
