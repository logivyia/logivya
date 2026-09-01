import { randomInt, randomUUID } from "node:crypto";

import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { composeTelegramOutboundMessage } from "@/server/telegram/outbound-composer";
import { loadOutboundMessageAttachments } from "@/server/media/message-attachments";
import { sendTelegramMessage } from "@/server/telegram/tdlib-client";
import { decodeTelegramExternalMessageIds, encodeTelegramExternalMessageIds } from "@/server/telegram/message-ids";

const workerId = `telegram-${randomUUID()}`;
const lastAccountSendAt = new Map<string, number>();

type RecurringRule = {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  endsAt?: string;
};

function nextOccurrence(current: Date, value: unknown) {
  const rule = value as RecurringRule;
  const interval = Math.max(1, Math.min(30, Number(rule?.interval || 1)));
  const next = new Date(current);
  if (rule?.frequency === "WEEKLY") next.setUTCDate(next.getUTCDate() + (7 * interval));
  else if (rule?.frequency === "MONTHLY") next.setUTCMonth(next.getUTCMonth() + interval);
  else next.setUTCDate(next.getUTCDate() + interval);
  if (rule?.endsAt && next > new Date(rule.endsAt)) return null;
  return next;
}

export async function materializeDueTelegramRuns(now = new Date()) {
  const due = await prisma.telegramDispatch.findMany({
    where: { status: "ACTIVE", nextRunAt: { lte: now } },
    select: { id: true },
    orderBy: { nextRunAt: "asc" },
    take: 25,
  });
  let created = 0;
  for (const item of due) {
    const made = await prisma.$transaction(async (tx) => {
      const dispatch = await tx.telegramDispatch.findUnique({
        where: { id: item.id },
        include: { targets: { select: { chatId: true } } },
      });
      if (!dispatch || dispatch.status !== "ACTIVE" || dispatch.nextRunAt > now) return false;
      const occurrenceKey = dispatch.nextRunAt.toISOString();
      const existing = await tx.telegramDispatchRun.findUnique({
        where: { dispatchId_occurrenceKey: { dispatchId: dispatch.id, occurrenceKey } },
        select: { id: true },
      });
      const nextRunAt = dispatch.scheduleType === "RECURRING" ? nextOccurrence(dispatch.nextRunAt, dispatch.recurringRule) : null;
      if (!existing) {
        await tx.telegramDispatchRun.create({
          data: {
            dispatchId: dispatch.id,
            occurrenceKey,
            scheduledFor: dispatch.nextRunAt,
            totalRecipients: dispatch.targets.length,
            deliveries: {
              create: dispatch.targets.map((target) => ({ chatId: target.chatId, nextAttemptAt: now })),
            },
          },
        });
      }
      await tx.telegramDispatch.update({
        where: { id: dispatch.id },
        data: nextRunAt ? { nextRunAt } : { status: "COMPLETED" },
      });
      return !existing;
    });
    if (made) created += 1;
  }
  return created;
}

function parseFloodWait(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/(?:retry after|FLOOD_WAIT_)(\d+)/i);
  return match ? Math.max(1, Number(match[1])) : null;
}

async function accountRateLimitDelay(accountId: string, hourlyLimit: number, dailyLimit: number) {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [hourly, daily] = await Promise.all([
    prisma.telegramDelivery.count({
      where: { status: "SENT", sentAt: { gte: hourAgo }, run: { dispatch: { accountId } } },
    }),
    prisma.telegramDelivery.count({
      where: { status: "SENT", sentAt: { gte: dayAgo }, run: { dispatch: { accountId } } },
    }),
  ]);
  if (hourly >= hourlyLimit) return 15 * 60;
  if (daily >= dailyLimit) return 60 * 60;
  return 0;
}

export function telegramRunStatus(sentCount: number, failedCount: number, pendingCount: number) {
  if (pendingCount > 0) return "PROCESSING" as const;
  if (failedCount === 0) return "SENT" as const;
  if (sentCount === 0) return "FAILED" as const;
  return "PARTIAL" as const;
}

async function refreshRun(runId: string) {
  const [sentCount, failedCount, floodWaitCount, pendingCount] = await Promise.all([
    prisma.telegramDelivery.count({ where: { runId, status: "SENT" } }),
    prisma.telegramDelivery.count({ where: { runId, status: "FAILED" } }),
    prisma.telegramDelivery.count({ where: { runId, status: "FLOOD_WAIT" } }),
    prisma.telegramDelivery.count({ where: { runId, status: { in: ["QUEUED", "PROCESSING", "FLOOD_WAIT"] } } }),
  ]);
  const completed = pendingCount === 0;
  const status = telegramRunStatus(sentCount, failedCount, pendingCount);
  await prisma.telegramDispatchRun.update({
    where: { id: runId },
    data: { sentCount, failedCount, floodWaitCount, status, completedAt: completed ? new Date() : null },
  });
}

export async function processNextTelegramDelivery(now = new Date()) {
  const candidate = await prisma.telegramDelivery.findFirst({
    where: {
      status: { in: ["QUEUED", "FLOOD_WAIT"] },
      nextAttemptAt: { lte: now },
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) } }],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (!candidate) return false;
  const claimed = await prisma.telegramDelivery.updateMany({
    where: { id: candidate.id, status: { in: ["QUEUED", "FLOOD_WAIT"] } },
    data: { status: "PROCESSING", lockedAt: now, lockedBy: workerId },
  });
  if (claimed.count !== 1) return false;

  const delivery = await prisma.telegramDelivery.findUnique({
    where: { id: candidate.id },
    include: {
      chat: true,
      run: {
        include: {
          dispatch: {
            include: {
              account: { include: { channelAccount: { include: { safetyProfile: true } } } },
              company: { select: { defaultLanguage: true } },
              createdBy: { select: { locale: true } },
            },
          },
        },
      },
    },
  });
  if (!delivery) return false;
  const dispatch = delivery.run.dispatch;
  const profile = dispatch.account.channelAccount.safetyProfile;
  const minDelay = Math.max(1_000, profile?.minDelayMs ?? 3_000);
  const maxDelay = Math.max(minDelay, profile?.maxDelayMs ?? 9_000);
  const lastSend = lastAccountSendAt.get(dispatch.accountId) ?? 0;
  const spacingMs = randomInt(minDelay, maxDelay + 1);
  if (Date.now() - lastSend < spacingMs) {
    await prisma.telegramDelivery.update({
      where: { id: delivery.id },
      data: { status: "QUEUED", nextAttemptAt: new Date(lastSend + spacingMs), lockedAt: null, lockedBy: null },
    });
    return true;
  }
  const rateDelaySeconds = await accountRateLimitDelay(dispatch.accountId, profile?.hourlyLimit ?? 20, profile?.dailyLimit ?? 100);
  if (rateDelaySeconds > 0) {
    await prisma.telegramDelivery.update({
      where: { id: delivery.id },
      data: { status: "FLOOD_WAIT", nextAttemptAt: new Date(Date.now() + rateDelaySeconds * 1000), errorCode: "ACCOUNT_RATE_LIMIT", lockedAt: null, lockedBy: null },
    });
    await refreshRun(delivery.runId);
    return true;
  }

  try {
    const composition = await composeTelegramOutboundMessage({
      companyId: dispatch.companyId,
      userId: dispatch.createdById,
      telegramAccountId: dispatch.accountId,
      deliveryId: delivery.id,
      originalText: dispatch.content,
      companyDefaultLanguage: dispatch.company.defaultLanguage,
      senderLocale: dispatch.createdBy.locale,
      existingRendering: delivery.renderedContent
        ? {
            renderedContent: delivery.renderedContent,
            attributionApplied: delivery.attributionApplied,
            attributionLocale: delivery.attributionLocale,
            attributionVersion: delivery.attributionVersion,
            effectivePlanCode: delivery.effectivePlanCode,
            renderedAt: delivery.renderedAt,
          }
        : null,
      now,
    });
    await prisma.telegramDelivery.update({
      where: { id: delivery.id },
      data: {
        renderedContent: composition.content,
        attributionApplied: composition.attributionApplied,
        attributionLocale: composition.attributionLocale,
        attributionVersion: composition.attributionVersion,
        effectivePlanCode: composition.effectivePlanCode,
        renderedAt: composition.renderedAt,
      },
    });
    const attachments = await loadOutboundMessageAttachments({
      contentJson: dispatch.contentJson,
      companyId: dispatch.companyId,
      userId: dispatch.createdById,
    });
    const externalMessageIds = decodeTelegramExternalMessageIds(delivery.externalMessageId);
    const totalMessageParts = attachments.length || 1;
    if (externalMessageIds.length > totalMessageParts) throw new Error("TELEGRAM_MESSAGE_ID_COUNT_INVALID");
    let sentAt = delivery.sentAt ?? now;
    for (let partIndex = externalMessageIds.length; partIndex < totalMessageParts; partIndex += 1) {
      const sent = await sendTelegramMessage({
        accountId: dispatch.accountId,
        externalChatId: delivery.chat.externalChatId,
        content: partIndex === 0 ? composition.content : "",
        attachment: attachments.length ? attachments[partIndex] : null,
      });
      externalMessageIds.push(sent.messageId);
      sentAt = sent.sentAt;
      lastAccountSendAt.set(dispatch.accountId, Date.now());
      await prisma.telegramDelivery.update({
        where: { id: delivery.id },
        data: { externalMessageId: encodeTelegramExternalMessageIds(externalMessageIds), sentAt },
      });
    }
    await prisma.telegramDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "SENT",
        attemptCount: { increment: 1 },
        externalMessageId: encodeTelegramExternalMessageIds(externalMessageIds),
        sentAt,
        errorCode: null,
        errorMessage: null,
        lockedAt: null,
        lockedBy: null,
      },
    });
  } catch (error) {
    const retryAfterSeconds = parseFloodWait(error);
    const attemptCount = delivery.attemptCount + 1;
    const errorMessage = error instanceof Error ? error.message : "TELEGRAM_SEND_FAILED";
    const nonRetryable = errorMessage === "MESSAGE_ATTRIBUTION_LENGTH_EXCEEDED";
    const retryable = !nonRetryable && (retryAfterSeconds !== null || attemptCount < 3);
    const delaySeconds = retryAfterSeconds ?? Math.min(300, 15 * (2 ** attemptCount));
    const code = retryAfterSeconds !== null ? "TELEGRAM_FLOOD_WAIT" : errorMessage.slice(0, 120);
    await prisma.telegramDelivery.update({
      where: { id: delivery.id },
      data: {
        status: retryAfterSeconds !== null ? "FLOOD_WAIT" : retryable ? "QUEUED" : "FAILED",
        attemptCount,
        nextAttemptAt: new Date(Date.now() + delaySeconds * 1000),
        errorCode: code,
        errorMessage: code,
        lockedAt: null,
        lockedBy: null,
      },
    });
    logger.warn("telegram.delivery_attempt_failed", { deliveryId: delivery.id, accountId: dispatch.accountId, code, retryable, retryAfterSeconds });
  }
  await refreshRun(delivery.runId);
  return true;
}

export async function recoverTelegramDeliveryLocks() {
  return prisma.telegramDelivery.updateMany({
    where: { status: "PROCESSING", lockedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } },
    data: { status: "QUEUED", lockedAt: null, lockedBy: null, nextAttemptAt: new Date() },
  });
}
