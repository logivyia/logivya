import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  ChannelMessageDirection,
  ChannelMessageStatus,
  CompanyRole,
  FacebookPublicationJobStatus,
  MembershipStatus,
  MobilePlatform,
  type Prisma,
} from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { facebookAccountSettings, requireFacebookPageAccount } from "@/server/facebook/accounts";
import { resolveFacebookPagesAccess } from "@/server/facebook/access";
import { FACEBOOK_PAGE_PROVIDER } from "@/server/facebook/constants";
import { FacebookGraphError } from "@/server/facebook/graph-api";
import { facebookPagesProvider } from "@/server/facebook/provider";
import {
  loadOutboundMessageAttachments,
  deleteMediaBytes,
  mediaFileReference,
  resolveOwnedMediaFiles,
  type OutboundMessageAttachment,
} from "@/server/media/message-attachments";

const MIN_SCHEDULE_MS = 10 * 60_000;
const MAX_SCHEDULE_MS = 30 * 24 * 60 * 60_000;

export const createFacebookPostSchema = z.object({
  pageAccountId: z.string().trim().min(1).max(100),
  message: z.string().trim().max(20_000).default(""),
  link: z.string().trim().url().max(2_000).optional(),
  mediaFileIds: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
}).superRefine((value, context) => {
  if (!value.message && !value.link && value.mediaFileIds.length === 0) {
    context.addIssue({ code: "custom", path: ["message"], message: "FACEBOOK_VALIDATION_CONTENT_REQUIRED" });
  }
  if (value.scheduledAt) {
    const delay = new Date(value.scheduledAt).getTime() - Date.now();
    if (delay < MIN_SCHEDULE_MS || delay > MAX_SCHEDULE_MS) {
      context.addIssue({ code: "custom", path: ["scheduledAt"], message: "FACEBOOK_VALIDATION_SCHEDULE_RANGE" });
    }
  }
});

export const createFacebookPostRequestSchema = z.object({
  pageAccountId: z.string().trim().min(1).max(100).optional(),
  pageAccountIds: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  message: z.string().trim().max(20_000).default(""),
  link: z.string().trim().url().max(2_000).optional(),
  mediaFileIds: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
}).superRefine((value, context) => {
  const pageIds = [...new Set([...(value.pageAccountId ? [value.pageAccountId] : []), ...value.pageAccountIds])];
  if (pageIds.length === 0) {
    context.addIssue({ code: "custom", path: ["pageAccountIds"], message: "FACEBOOK_VALIDATION_PAGE_REQUIRED" });
  }
  const singlePage = createFacebookPostSchema.safeParse({
    pageAccountId: pageIds[0] || "missing",
    message: value.message,
    link: value.link,
    mediaFileIds: value.mediaFileIds,
    scheduledAt: value.scheduledAt,
  });
  if (!singlePage.success) {
    for (const issue of singlePage.error.issues) {
      context.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  }
});

type CreateFacebookPost = z.infer<typeof createFacebookPostSchema>;
type CreateFacebookPostRequest = z.infer<typeof createFacebookPostRequestSchema>;

type FacebookPublicationPayload = CreateFacebookPost;

const FACEBOOK_PUBLICATION_LOCK_MS = 10 * 60_000;

function publicationIdempotencyKey(input: { companyId: string; pageAccountId: string; key?: string | null }) {
  const callerKey = input.key?.trim() || randomUUID();
  return createHash("sha256")
    .update(`${input.companyId}:${input.pageAccountId}:${callerKey}`)
    .digest("hex");
}

function publicationPayload(value: Prisma.JsonValue): FacebookPublicationPayload {
  const parsed = createFacebookPostSchema.safeParse(value);
  if (!parsed.success) throw new Error("FACEBOOK_PUBLICATION_PAYLOAD_INVALID");
  return parsed.data;
}

function publicationErrorCode(error: unknown) {
  if (error instanceof FacebookGraphError) return `FACEBOOK_GRAPH_${error.graphCode || error.status}`;
  return error instanceof Error ? error.message.slice(0, 120) : "FACEBOOK_POST_FAILED";
}

export function isRetryableFacebookPublicationError(error: unknown) {
  if (error instanceof FacebookGraphError) {
    if ([102, 190, 200, 10].includes(error.graphCode || 0)) return false;
    return error.status === 408 || error.status === 429 || error.status >= 500
      || [1, 2, 4, 17, 32, 341, 613].includes(error.graphCode || 0);
  }
  const code = error instanceof Error ? error.message : "";
  return code === "FACEBOOK_GRAPH_TIMEOUT" || code === "FACEBOOK_GRAPH_UNAVAILABLE";
}

export function isAmbiguousFacebookPublicationError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return code === "FACEBOOK_GRAPH_TIMEOUT" || code === "FACEBOOK_GRAPH_UNAVAILABLE";
}

function retryAt(attemptCount: number) {
  const delay = Math.min(30 * 60_000, 15_000 * 2 ** Math.max(0, attemptCount - 1));
  return new Date(Date.now() + delay + Math.floor(Math.random() * 2_000));
}

function messageMetadata(input: CreateFacebookPost, attachments: OutboundMessageAttachment[], pageId: string): Prisma.InputJsonValue {
  return {
    platform: "FACEBOOK_PAGE",
    pageId,
    link: input.link || null,
    scheduledAt: input.scheduledAt || null,
    attachments: attachments.map((attachment) => ({
      mediaFileId: attachment.mediaFileId,
      kind: attachment.kind,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size,
    })),
  } as unknown as Prisma.InputJsonValue;
}

async function loadAttachments(input: { mediaFileIds: string[]; companyId: string; userId: string }) {
  const files = await resolveOwnedMediaFiles(input.mediaFileIds, input.companyId, input.userId);
  const attachments = await loadOutboundMessageAttachments({
    companyId: input.companyId,
    userId: input.userId,
    contentJson: { attachments: files.map(mediaFileReference) },
  });
  const videos = attachments.filter((attachment) => attachment.kind === "VIDEO");
  if (attachments.some((attachment) => attachment.kind === "DOCUMENT")) throw new Error("FACEBOOK_VALIDATION_DOCUMENT_UNSUPPORTED");
  if (videos.length > 1 || (videos.length === 1 && attachments.length > 1)) throw new Error("FACEBOOK_VALIDATION_VIDEO_COMBINATION");
  return attachments;
}

async function uploadPhoto(input: { pageId: string; token: string; attachment: OutboundMessageAttachment }) {
  const bytes = await readFile(input.attachment.filePath);
  const body = new FormData();
  body.set("published", "false");
  body.set("source", new Blob([new Uint8Array(bytes)], { type: input.attachment.mimeType }), input.attachment.fileName);
  return facebookPagesProvider.publishPhoto(input.pageId, input.token, body);
}

async function createFeedPost(input: {
  pageId: string;
  token: string;
  message: string;
  link?: string;
  scheduledAt?: string;
  photoIds?: string[];
}) {
  const body = new URLSearchParams();
  if (input.message) body.set("message", input.message);
  if (input.link) body.set("link", input.link);
  for (const [index, mediaId] of (input.photoIds || []).entries()) {
    body.set(`attached_media[${index}]`, JSON.stringify({ media_fbid: mediaId }));
  }
  if (input.scheduledAt) {
    body.set("published", "false");
    body.set("scheduled_publish_time", String(Math.floor(new Date(input.scheduledAt).getTime() / 1000)));
  }
  return facebookPagesProvider.publishFeed(input.pageId, input.token, body);
}

async function createVideoPost(input: {
  pageId: string;
  token: string;
  message: string;
  scheduledAt?: string;
  attachment: OutboundMessageAttachment;
}) {
  const bytes = await readFile(input.attachment.filePath);
  const body = new FormData();
  body.set("source", new Blob([new Uint8Array(bytes)], { type: input.attachment.mimeType }), input.attachment.fileName);
  if (input.message) body.set("description", input.message);
  if (input.scheduledAt) {
    body.set("published", "false");
    body.set("scheduled_publish_time", String(Math.floor(new Date(input.scheduledAt).getTime() / 1000)));
  }
  return facebookPagesProvider.publishVideo(input.pageId, input.token, body);
}

export async function createFacebookPagePost(input: {
  companyId: string;
  userId: string;
  data: CreateFacebookPost;
  idempotencyKey?: string | null;
}) {
  const { account, pageId, pageAccessToken } = await requireFacebookPageAccount(input.companyId, input.data.pageAccountId, input.userId);
  void pageAccessToken;
  const tasks = facebookAccountSettings(account).tasks || [];
  if (tasks.length > 0 && !tasks.includes("CREATE_CONTENT") && !tasks.includes("MANAGE")) {
    throw new Error("FACEBOOK_RECONNECT_REQUIRED");
  }
  const attachments = await loadAttachments({
    mediaFileIds: input.data.mediaFileIds,
    companyId: input.companyId,
    userId: input.userId,
  });
  const idempotencyKey = publicationIdempotencyKey({
    companyId: input.companyId,
    pageAccountId: account.id,
    key: input.idempotencyKey,
  });
  const existing = await prisma.facebookPublicationJob.findUnique({
    where: { idempotencyKey },
    select: { companyId: true, channelMessageId: true },
  });
  if (existing) {
    if (existing.companyId !== input.companyId) throw new Error("FACEBOOK_IDEMPOTENCY_CONFLICT");
    return prisma.channelMessage.findUniqueOrThrow({ where: { id: existing.channelMessageId } });
  }
  return prisma.$transaction(async (tx) => {
    const record = await tx.channelMessage.create({
      data: {
        companyId: input.companyId,
        channelAccountId: account.id,
        recipientExternalId: pageId,
        direction: ChannelMessageDirection.OUTBOUND,
        status: ChannelMessageStatus.PENDING,
        content: input.data.message || null,
        contentJson: messageMetadata(input.data, attachments, pageId),
        queuedAt: new Date(),
      },
    });
    await tx.facebookPublicationJob.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        channelAccountId: account.id,
        channelMessageId: record.id,
        idempotencyKey,
        payload: input.data as unknown as Prisma.InputJsonValue,
      },
    });
    return record;
  });
}

export async function createFacebookPagePosts(input: {
  companyId: string;
  userId: string;
  data: CreateFacebookPostRequest;
  idempotencyKey?: string | null;
}) {
  const pageAccountIds = [...new Set([
    ...(input.data.pageAccountId ? [input.data.pageAccountId] : []),
    ...input.data.pageAccountIds,
  ])];
  // Validate every target before writing any queue item so an invalid Page cannot
  // leave a misleading partially-created multi-Page request.
  await Promise.all(pageAccountIds.map((pageAccountId) =>
    requireFacebookPageAccount(input.companyId, pageAccountId, input.userId),
  ));
  const posts = [];
  for (const pageAccountId of pageAccountIds) {
    posts.push(await createFacebookPagePost({
      companyId: input.companyId,
      userId: input.userId,
      data: {
        pageAccountId,
        message: input.data.message,
        link: input.data.link,
        mediaFileIds: input.data.mediaFileIds,
        scheduledAt: input.data.scheduledAt,
      },
      idempotencyKey: input.idempotencyKey,
    }));
  }
  return posts;
}

async function deliverFacebookPagePost(input: {
  companyId: string;
  userId: string;
  channelMessageId: string;
  data: CreateFacebookPost;
}) {
  const { account, pageId, pageAccessToken } = await requireFacebookPageAccount(input.companyId, input.data.pageAccountId, input.userId);
  const tasks = facebookAccountSettings(account).tasks || [];
  if (tasks.length > 0 && !tasks.includes("CREATE_CONTENT") && !tasks.includes("MANAGE")) {
    throw new Error("FACEBOOK_RECONNECT_REQUIRED");
  }
  const attachments = await loadAttachments({
    mediaFileIds: input.data.mediaFileIds,
    companyId: input.companyId,
    userId: input.userId,
  });
  const uploadedPhotoIds: string[] = [];
  try {
    let result: { id: string };
    const video = attachments.find((attachment) => attachment.kind === "VIDEO");
    if (video) {
      result = await createVideoPost({
        pageId,
        token: pageAccessToken,
        message: input.data.message,
        scheduledAt: input.data.scheduledAt,
        attachment: video,
      });
    } else {
      for (const attachment of attachments) {
        const photo = await uploadPhoto({ pageId, token: pageAccessToken, attachment });
        uploadedPhotoIds.push(photo.id);
      }
      result = await createFeedPost({
        pageId,
        token: pageAccessToken,
        message: input.data.message,
        link: input.data.link,
        scheduledAt: input.data.scheduledAt,
        photoIds: uploadedPhotoIds,
      });
    }
    return prisma.channelMessage.update({
      where: { id: input.channelMessageId },
      data: {
        externalMessageId: result.id,
        status: input.data.scheduledAt ? ChannelMessageStatus.QUEUED : ChannelMessageStatus.SENT,
        sentAt: input.data.scheduledAt ? null : new Date(),
        errorCode: null,
        errorMessage: null,
      },
    });
  } catch (error) {
    await Promise.all(uploadedPhotoIds.map((photoId) => facebookPagesProvider.deleteRemoteObject(photoId, pageAccessToken).catch(() => undefined)));
    throw error;
  }
}

export async function claimFacebookPublicationJob(workerId: string) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - FACEBOOK_PUBLICATION_LOCK_MS);
  const available: Prisma.FacebookPublicationJobWhereInput = {
    OR: [
      { status: FacebookPublicationJobStatus.QUEUED, nextAttemptAt: { lte: now } },
      { status: FacebookPublicationJobStatus.PROCESSING, lockedAt: { lt: staleBefore } },
    ],
  };
  const candidate = await prisma.facebookPublicationJob.findFirst({
    where: available,
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (!candidate) return null;
  const claimed = await prisma.facebookPublicationJob.updateMany({
    where: { id: candidate.id, ...available },
    data: {
      status: FacebookPublicationJobStatus.PROCESSING,
      lockedAt: now,
      lockedBy: workerId,
      lastAttemptAt: now,
      attemptCount: { increment: 1 },
    },
  });
  if (claimed.count !== 1) return null;
  return prisma.facebookPublicationJob.findUnique({ where: { id: candidate.id } });
}

export async function processNextFacebookPublication(workerId: string) {
  const job = await claimFacebookPublicationJob(workerId);
  if (!job) return { processed: false as const };
  try {
    const [featureAccess, membership] = await Promise.all([
      resolveFacebookPagesAccess(job.userId, MobilePlatform.UNKNOWN),
      prisma.companyUser.findUnique({
        where: { companyId_userId: { companyId: job.companyId, userId: job.userId } },
        select: { status: true, role: true },
      }),
    ]);
    if (!featureAccess || membership?.status !== MembershipStatus.ACTIVE || membership.role === CompanyRole.VIEWER) {
      throw new Error("FACEBOOK_AUTHORIZATION_REQUIRED");
    }
    const message = await deliverFacebookPagePost({
      companyId: job.companyId,
      userId: job.userId,
      channelMessageId: job.channelMessageId,
      data: publicationPayload(job.payload),
    });
    await prisma.facebookPublicationJob.update({
      where: { id: job.id },
      data: {
        status: FacebookPublicationJobStatus.SENT,
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    return { processed: true as const, delivered: true as const, jobId: job.id, message };
  } catch (error) {
    const ambiguous = isAmbiguousFacebookPublicationError(error);
    const retryable = !ambiguous && isRetryableFacebookPublicationError(error) && job.attemptCount < job.maxAttempts;
    const errorCode = ambiguous ? "FACEBOOK_DELIVERY_UNCERTAIN_REVIEW_REQUIRED" : publicationErrorCode(error);
    await prisma.$transaction([
      prisma.facebookPublicationJob.update({
        where: { id: job.id },
        data: {
          status: retryable ? FacebookPublicationJobStatus.QUEUED : FacebookPublicationJobStatus.FAILED,
          nextAttemptAt: retryable ? retryAt(job.attemptCount) : job.nextAttemptAt,
          completedAt: retryable ? null : new Date(),
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: errorCode,
          lastErrorMessage: "Facebook gönderisi tamamlanamadı.",
        },
      }),
      prisma.channelMessage.update({
        where: { id: job.channelMessageId },
        data: {
          status: retryable ? ChannelMessageStatus.PENDING : ChannelMessageStatus.FAILED,
          failedAt: retryable ? null : new Date(),
          errorCode,
          errorMessage: retryable ? "Facebook gönderisi yeniden denenecek." : "Facebook gönderisi tamamlanamadı.",
        },
      }),
    ]);
    return { processed: true as const, delivered: false as const, retryable, jobId: job.id, errorCode };
  }
}

export async function recoverStaleFacebookPublications() {
  return prisma.facebookPublicationJob.updateMany({
    where: {
      status: FacebookPublicationJobStatus.PROCESSING,
      lockedAt: { lt: new Date(Date.now() - FACEBOOK_PUBLICATION_LOCK_MS) },
    },
    data: {
      status: FacebookPublicationJobStatus.QUEUED,
      lockedAt: null,
      lockedBy: null,
      nextAttemptAt: new Date(),
      lastErrorCode: "FACEBOOK_STALE_LOCK_RECOVERED",
    },
  });
}

export async function cleanupExpiredFacebookMedia(limit = 100) {
  const files = await prisma.mediaFile.findMany({
    where: { purpose: "FACEBOOK_PAGE_POST", expiresAt: { lte: new Date() } },
    select: { id: true, storageKey: true },
    orderBy: { expiresAt: "asc" },
    take: Math.max(1, Math.min(500, limit)),
  });
  let deleted = 0;
  for (const file of files) {
    try {
      await deleteMediaBytes(file.storageKey);
      await prisma.mediaFile.deleteMany({ where: { id: file.id, purpose: "FACEBOOK_PAGE_POST", expiresAt: { lte: new Date() } } });
      deleted += 1;
    } catch {
      // Keep the database row so the next retention cycle can retry safely.
    }
  }
  return { scanned: files.length, deleted };
}

export async function cleanupExpiredFacebookOAuthTransactions() {
  return prisma.facebookOAuthTransaction.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60_000) } },
  });
}

export async function facebookPublicationQueueHealth() {
  const now = new Date();
  const [counts, oldestQueued, reconnectRequiredPages] = await Promise.all([
    prisma.facebookPublicationJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.facebookPublicationJob.findFirst({
      where: { status: FacebookPublicationJobStatus.QUEUED },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.channelAccount.count({
      where: { provider: FACEBOOK_PAGE_PROVIDER, archivedAt: null, status: "RECONNECT_REQUIRED" },
    }),
  ]);
  return {
    queueDepth: counts.find((entry) => entry.status === FacebookPublicationJobStatus.QUEUED)?._count._all ?? 0,
    processing: counts.find((entry) => entry.status === FacebookPublicationJobStatus.PROCESSING)?._count._all ?? 0,
    sent: counts.find((entry) => entry.status === FacebookPublicationJobStatus.SENT)?._count._all ?? 0,
    failed: counts.find((entry) => entry.status === FacebookPublicationJobStatus.FAILED)?._count._all ?? 0,
    canceled: counts.find((entry) => entry.status === FacebookPublicationJobStatus.CANCELED)?._count._all ?? 0,
    oldestQueueAgeMs: oldestQueued ? now.getTime() - oldestQueued.createdAt.getTime() : 0,
    reconnectRequiredPages,
  };
}

function historyMetadata(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function listFacebookPagePosts(companyId: string, userId: string, take = 50) {
  const ownedAccounts = await prisma.channelAccount.findMany({
    where: { companyId, provider: FACEBOOK_PAGE_PROVIDER },
    select: { id: true, settings: true },
  });
  const ownedAccountIds = ownedAccounts
    .filter((account) => facebookAccountSettings(account).connectedByUserId === userId)
    .map((account) => account.id);
  const messages = await prisma.channelMessage.findMany({
    where: { companyId, channelAccountId: { in: ownedAccountIds }, channelAccount: { provider: FACEBOOK_PAGE_PROVIDER } },
    include: { channelAccount: { select: { displayName: true, label: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(100, take)),
  });
  const jobs = await prisma.facebookPublicationJob.findMany({
    where: { companyId, channelMessageId: { in: messages.map((message) => message.id) } },
    select: { channelMessageId: true, attemptCount: true, maxAttempts: true, lastErrorCode: true, nextAttemptAt: true },
  });
  const jobByMessageId = new Map(jobs.map((job) => [job.channelMessageId, job]));
  return messages.map((message) => {
    const metadata = historyMetadata(message.contentJson);
    const job = jobByMessageId.get(message.id);
    return {
      id: message.id,
      pageName: message.channelAccount.displayName || message.channelAccount.label,
      content: message.content,
      status: message.status,
      externalMessageId: message.externalMessageId,
      scheduledAt: typeof metadata.scheduledAt === "string" ? metadata.scheduledAt : null,
      attachmentCount: Array.isArray(metadata.attachments) ? metadata.attachments.length : 0,
      createdAt: message.createdAt.toISOString(),
      sentAt: message.sentAt?.toISOString() || null,
      errorMessage: message.errorMessage,
      attemptCount: job?.attemptCount || 0,
      maxAttempts: job?.maxAttempts || 0,
      lastErrorCode: job?.lastErrorCode || null,
      nextAttemptAt: job?.nextAttemptAt.toISOString() || null,
      canDelete: Boolean(message.externalMessageId)
        ? message.status === ChannelMessageStatus.SENT || message.status === ChannelMessageStatus.QUEUED
        : Boolean(job) && message.status !== ChannelMessageStatus.CANCELED,
    };
  });
}

export async function deleteFacebookPagePost(companyId: string, userId: string, messageId: string) {
  const message = await prisma.channelMessage.findFirst({
    where: { id: messageId, companyId, channelAccount: { provider: FACEBOOK_PAGE_PROVIDER } },
    include: { channelAccount: true },
  });
  if (!message) throw new Error("FACEBOOK_PAGE_POST_NOT_FOUND");
  if (facebookAccountSettings(message.channelAccount).connectedByUserId !== userId) {
    throw new Error("FACEBOOK_PAGE_POST_NOT_FOUND");
  }
  if (!message.externalMessageId) {
    const job = await prisma.facebookPublicationJob.findUnique({ where: { channelMessageId: message.id } });
    if (!job) throw new Error("FACEBOOK_PAGE_POST_NOT_FOUND");
    if (job.status === FacebookPublicationJobStatus.PROCESSING) throw new Error("FACEBOOK_POST_PROCESSING");
    const metadata = historyMetadata(message.contentJson);
    await prisma.$transaction([
      prisma.facebookPublicationJob.update({
        where: { id: job.id },
        data: { status: FacebookPublicationJobStatus.CANCELED, completedAt: new Date(), lockedAt: null, lockedBy: null },
      }),
      prisma.channelMessage.update({
        where: { id: message.id },
        data: {
          status: ChannelMessageStatus.CANCELED,
          contentJson: { ...metadata, canceledAt: new Date().toISOString() } as Prisma.InputJsonValue,
        },
      }),
    ]);
    return { deleted: true, providerDeleteRequired: false };
  }
  const { pageAccessToken } = await requireFacebookPageAccount(companyId, message.channelAccountId, userId);
  await facebookPagesProvider.deleteRemoteObject(message.externalMessageId, pageAccessToken);
  const metadata = historyMetadata(message.contentJson);
  await prisma.channelMessage.update({
    where: { id: message.id },
    data: {
      status: ChannelMessageStatus.CANCELED,
      contentJson: { ...metadata, remoteDeletedAt: new Date().toISOString() } as Prisma.InputJsonValue,
    },
  });
  return { deleted: true };
}
