import "server-only";

import { z } from "zod";

import { prisma } from "@/server/db";
import { TELEGRAM_MAX_MESSAGE_LENGTH, TELEGRAM_MAX_TARGETS_PER_DISPATCH } from "@/server/telegram/constants";
import { requireOwnedTelegramAccount } from "@/server/telegram/accounts";
import { assertTelegramSendAccess } from "@/server/telegram/send-access";
import { mediaFileReference, resolveOwnedMediaFiles } from "@/server/media/message-attachments";
import { MAX_MESSAGE_ATTACHMENTS, TELEGRAM_MAX_UPLOAD_BYTES } from "@/server/security/uploads";

const recurringRuleSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  interval: z.number().int().min(1).max(30).default(1),
  endsAt: z.string().datetime().optional(),
});

function chatAllowsAttachment(rawPermissions: unknown, kind: "PHOTO" | "VIDEO" | "DOCUMENT") {
  if (!rawPermissions || typeof rawPermissions !== "object" || Array.isArray(rawPermissions)) return true;
  const permissions = rawPermissions as Record<string, unknown>;
  const key = kind === "PHOTO" ? "canSendPhotos" : kind === "VIDEO" ? "canSendVideos" : "canSendDocuments";
  return permissions[key] !== false;
}

export const createTelegramDispatchSchema = z.object({
  accountId: z.string().cuid(),
  clientRequestId: z.string().min(8).max(100),
  title: z.string().trim().max(120).optional(),
  content: z.string().trim().max(TELEGRAM_MAX_MESSAGE_LENGTH).default(""),
  mediaFileId: z.string().cuid().optional(),
  mediaFileIds: z.array(z.string().cuid()).max(MAX_MESSAGE_ATTACHMENTS).default([]),
  chatIds: z.array(z.string().cuid()).min(1).max(TELEGRAM_MAX_TARGETS_PER_DISPATCH),
  scheduleType: z.enum(["SEND_NOW", "SCHEDULED", "RECURRING"]).default("SEND_NOW"),
  scheduledAt: z.string().datetime().optional(),
  recurringRule: recurringRuleSchema.optional(),
}).superRefine((value, context) => {
  if (!value.content.trim() && !value.mediaFileId && !value.mediaFileIds.length) {
    context.addIssue({ code: "custom", path: ["content"], message: "content or mediaFileId is required" });
  }
  if (value.scheduleType !== "SEND_NOW" && !value.scheduledAt) {
    context.addIssue({ code: "custom", path: ["scheduledAt"], message: "scheduledAt is required" });
  }
  if (value.scheduleType === "RECURRING" && !value.recurringRule) {
    context.addIssue({ code: "custom", path: ["recurringRule"], message: "recurringRule is required" });
  }
});

export async function createTelegramDispatch(input: {
  companyId: string;
  userId: string;
  timezone: string;
  data: z.infer<typeof createTelegramDispatchSchema>;
}) {
  const account = await requireOwnedTelegramAccount(input.data.accountId, input.userId, input.companyId);
  if (account.status !== "CONNECTED" || account.authState !== "READY") throw new Error("TELEGRAM_ACCOUNT_NOT_READY");
  const mediaFileIds = [...new Set([...input.data.mediaFileIds, ...(input.data.mediaFileId ? [input.data.mediaFileId] : [])])];
  const mediaFiles = await resolveOwnedMediaFiles(mediaFileIds, input.companyId, input.userId);
  if (mediaFiles.some((file) => file.size > TELEGRAM_MAX_UPLOAD_BYTES)) throw new Error("TELEGRAM_MEDIA_TOO_LARGE");
  const attachments = mediaFiles.map(mediaFileReference);
  const uniqueChatIds = [...new Set(input.data.chatIds)];
  const chats = await prisma.telegramChat.findMany({
    where: { id: { in: uniqueChatIds }, accountId: account.id, companyId: input.companyId, canSend: true, isActive: true, isArchived: false },
    select: { id: true, type: true, rawPermissions: true },
  });
  if (chats.length !== uniqueChatIds.length) throw new Error("TELEGRAM_VALIDATION_TARGETS");
  await assertTelegramSendAccess({ userId: input.userId, companyId: input.companyId, scheduleType: input.data.scheduleType, chatTypes: chats.map((chat) => chat.type) });
  if (attachments.some((attachment) => chats.some((chat) => !chatAllowsAttachment(chat.rawPermissions, attachment.kind)))) throw new Error("TELEGRAM_MEDIA_PERMISSION_DENIED");
  const existing = await prisma.telegramDispatch.findUnique({
    where: { createdById_clientRequestId: { createdById: input.userId, clientRequestId: input.data.clientRequestId } },
    include: { targets: true },
  });
  if (existing) return { dispatch: existing, duplicate: true };
  const scheduledAt = input.data.scheduleType === "SEND_NOW" ? new Date() : new Date(input.data.scheduledAt!);
  if (scheduledAt.getTime() < Date.now() - 60_000) throw new Error("TELEGRAM_VALIDATION_SCHEDULE");
  const dispatch = await prisma.telegramDispatch.create({
    data: {
      companyId: input.companyId,
      accountId: account.id,
      createdById: input.userId,
      clientRequestId: input.data.clientRequestId,
      title: input.data.title,
      content: input.data.content,
      contentJson: { type: attachments.length === 1 ? attachments[0].kind : attachments.length ? "MIXED_MEDIA" : "TEXT", version: 3, ...(attachments.length ? { attachment: attachments[0], attachments } : {}) },
      scheduleType: input.data.scheduleType,
      scheduledAt: input.data.scheduleType === "SEND_NOW" ? null : scheduledAt,
      timezone: input.timezone,
      recurringRule: input.data.recurringRule,
      nextRunAt: scheduledAt,
      targets: { create: chats.map((chat) => ({ chatId: chat.id })) },
    },
    include: { targets: true },
  });
  return { dispatch, duplicate: false };
}

export async function listTelegramHistory(input: { companyId: string; userId: string; cursor?: string; take?: number }) {
  const take = Math.max(1, Math.min(50, input.take ?? 20));
  const rows = await prisma.telegramDispatch.findMany({
    where: { companyId: input.companyId, createdById: input.userId },
    include: {
      account: { select: { id: true, label: true, username: true } },
      targets: { include: { chat: { select: { id: true, title: true, type: true } } } },
      runs: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          deliveries: {
            select: { id: true, chatId: true, status: true, attemptCount: true, errorCode: true, sentAt: true },
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
}

export async function cancelOwnedTelegramDispatch(id: string, userId: string, companyId: string) {
  const dispatch = await prisma.telegramDispatch.findFirst({ where: { id, createdById: userId, companyId } });
  if (!dispatch) throw new Error("TELEGRAM_NOT_FOUND");
  await prisma.$transaction([
    prisma.telegramDispatch.update({ where: { id }, data: { status: "CANCELED" } }),
    prisma.telegramDelivery.updateMany({
      where: { run: { dispatchId: id }, status: { in: ["QUEUED", "FLOOD_WAIT"] } },
      data: { status: "CANCELED", lockedAt: null, lockedBy: null },
    }),
    prisma.telegramDispatchRun.updateMany({ where: { dispatchId: id, status: "QUEUED" }, data: { status: "CANCELED", completedAt: new Date() } }),
  ]);
  return { canceled: true };
}
