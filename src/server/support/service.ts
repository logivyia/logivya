import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import {
  Prisma,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from "@prisma/client";
import { prisma } from "@/server/db";
import { NOTIFICATION_TYPES } from "@/server/notifications/service";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import {
  canAdminTransitionSupportStatus,
  canUserReplyToSupportStatus,
  canonicalSupportPriority,
  canonicalSupportStatus,
  canonicalSupportStatuses,
  normalizeSupportCategory,
  statusAfterAdminReply,
  statusAfterUserReply,
  supportPriorities,
} from "@/server/support/constants";
import { SupportDomainError } from "@/server/support/errors";
import {
  enqueueSupportNotification,
  resolvePlatformSupportRecipient,
  type SupportNotificationRecipient,
} from "@/server/support/notifications";

export type SupportActor = {
  user: { id: string; email: string; name?: string | null };
  company: { id: string; name: string };
};

type TicketListFilters = {
  cursor?: string | null;
  limit?: number;
  status?: string | null;
  category?: string | null;
  search?: string | null;
};

export type AdminTicketListFilters = TicketListFilters & {
  priority?: string | null;
  companyId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  assignedAdminId?: string | null;
  unreadOnly?: boolean;
  unansweredOnly?: boolean;
  createdFrom?: string | null;
  createdTo?: string | null;
  updatedFrom?: string | null;
  updatedTo?: string | null;
};

type ReplyInput = {
  body: string;
  clientMessageId?: string | null;
  attachmentUrl?: string | null;
};

const messageSelect = {
  id: true,
  senderUserId: true,
  senderType: true,
  message: true,
  clientMessageId: true,
  attachmentUrl: true,
  isInternal: true,
  editedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  senderUser: { select: { id: true, name: true, email: true } },
} satisfies Prisma.SupportTicketMessageSelect;

const ticketBaseSelect = {
  id: true,
  publicId: true,
  tenantId: true,
  userId: true,
  companyId: true,
  createdById: true,
  assignedToAdminId: true,
  title: true,
  subject: true,
  description: true,
  category: true,
  type: true,
  source: true,
  status: true,
  priority: true,
  lastMessageAt: true,
  lastUserMessageAt: true,
  lastAdminMessageAt: true,
  firstAdminReplyAt: true,
  userLastReadAt: true,
  adminLastReadAt: true,
  userUnreadCount: true,
  adminUnreadCount: true,
  resolvedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  assignedToAdmin: { select: { id: true, name: true, email: true } },
} satisfies Prisma.SupportTicketSelect;

const ticketSummarySelect = {
  ...ticketBaseSelect,
  messages: {
    where: { isInternal: false, deletedAt: null },
    select: messageSelect,
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
  },
} satisfies Prisma.SupportTicketSelect;

type TicketBaseRow = Prisma.SupportTicketGetPayload<{ select: typeof ticketBaseSelect }>;
type TicketSummaryRow = Prisma.SupportTicketGetPayload<{ select: typeof ticketSummarySelect }>;
type MessageRow = Prisma.SupportTicketMessageGetPayload<{ select: typeof messageSelect }>;

function requestCorrelationId(request?: Request) {
  return request?.headers.get("x-correlation-id")?.slice(0, 128)
    || request?.headers.get("x-request-id")?.slice(0, 128)
    || randomUUID();
}

function publicTicketId() {
  return `LOG-${new Date().getUTCFullYear()}-${randomBytes(10).toString("hex").toUpperCase()}`;
}

function normalizeLimit(value: number | undefined, fallback = 20) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(50, Math.max(1, Math.trunc(value ?? fallback)));
}

function normalizeIdentifier(value: string) {
  const identifier = decodeURIComponent(value).trim();
  if (!identifier || identifier.length > 160) throw new SupportDomainError("SUPPORT_TICKET_NOT_FOUND", 404);
  return identifier;
}

function normalizeClientId(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized.length > 128 || !/^[A-Za-z0-9._:~-]+$/.test(normalized)) {
    throw new SupportDomainError("SUPPORT_INVALID_CLIENT_MESSAGE_ID", 400);
  }
  return normalized;
}

function normalizeText(value: string, field: string, min: number, max: number) {
  const normalized = value.replaceAll("\u0000", "").trim();
  if (normalized.length < min || normalized.length > max) {
    throw new SupportDomainError("SUPPORT_VALIDATION_ERROR", 400, { field, min, max });
  }
  return normalized;
}

function normalizeAttachmentUrl(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") throw new Error("protocol");
    return parsed.toString();
  } catch {
    throw new SupportDomainError("SUPPORT_INVALID_ATTACHMENT", 400);
  }
}

function normalizeStatusFilter(value?: string | null): SupportTicketStatus | null {
  if (!value || value === "ALL") return null;
  const status = canonicalSupportStatus(value.trim().toUpperCase());
  return canonicalSupportStatuses.includes(status as (typeof canonicalSupportStatuses)[number]) ? status : null;
}

function normalizePriority(value?: string | null): SupportTicketPriority | null {
  if (!value || value === "ALL") return null;
  const priority = canonicalSupportPriority(value.trim().toUpperCase());
  return supportPriorities.includes(priority as (typeof supportPriorities)[number]) ? priority : null;
}

function normalizeCategoryFilter(value?: string | null) {
  if (!value || value.trim().toUpperCase() === "ALL") return null;
  const category = normalizeSupportCategory(value);
  if (!category) throw new SupportDomainError("SUPPORT_INVALID_CATEGORY", 400);
  return category;
}

function normalizeDate(value?: string | null, endOfDay = false) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new SupportDomainError("SUPPORT_INVALID_DATE_FILTER", 400);
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) parsed.setUTCHours(23, 59, 59, 999);
  return parsed;
}

function ticketIdentifierWhere(identifier: string): Prisma.SupportTicketWhereInput {
  return { OR: [{ id: identifier }, { publicId: identifier }] };
}

function ownedTicketWhere(actor: SupportActor, identifier?: string): Prisma.SupportTicketWhereInput {
  return {
    AND: [
      { OR: [{ createdById: actor.user.id }, { userId: actor.user.id }] },
      ...(identifier ? [ticketIdentifierWhere(identifier)] : []),
    ],
  };
}

function serializeMessage(row: MessageRow) {
  const senderType = row.senderType === "CUSTOMER" ? "USER" : row.senderType;
  return {
    id: row.id,
    senderUserId: row.senderUserId,
    senderType,
    message: row.deletedAt ? "" : row.message,
    body: row.deletedAt ? "" : row.message,
    clientMessageId: row.clientMessageId,
    attachmentUrl: row.attachmentUrl,
    isInternal: row.isInternal,
    editedAt: row.editedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    senderUser: row.senderUser,
  };
}

function serializeTicketBase(row: TicketBaseRow) {
  return {
    id: row.id,
    publicId: row.publicId,
    tenantId: row.tenantId,
    userId: row.userId,
    companyId: row.companyId,
    createdById: row.createdById,
    assignedToAdminId: row.assignedToAdminId,
    title: row.title,
    subject: row.subject,
    description: row.description,
    category: row.category,
    type: row.type,
    source: row.source,
    status: canonicalSupportStatus(row.status),
    priority: canonicalSupportPriority(row.priority),
    lastMessageAt: row.lastMessageAt.toISOString(),
    lastUserMessageAt: row.lastUserMessageAt?.toISOString() ?? null,
    lastAdminMessageAt: row.lastAdminMessageAt?.toISOString() ?? null,
    firstAdminReplyAt: row.firstAdminReplyAt?.toISOString() ?? null,
    userLastReadAt: row.userLastReadAt?.toISOString() ?? null,
    adminLastReadAt: row.adminLastReadAt?.toISOString() ?? null,
    userUnreadCount: row.userUnreadCount,
    adminUnreadCount: row.adminUnreadCount,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    company: row.company,
    createdBy: row.createdBy,
    assignedToAdmin: row.assignedToAdmin,
  };
}

function serializeTicketSummary(row: TicketSummaryRow, admin = false) {
  const messages = row.messages.map(serializeMessage);
  return {
    ...serializeTicketBase(row),
    messages,
    lastMessage: messages[0] ?? null,
    lastMessagePreview: messages[0]?.message.slice(0, 180) ?? "",
    unreadReplyCount: admin ? row.adminUnreadCount : row.userUnreadCount,
  };
}

function isRetryableTransactionError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  const message = error instanceof Error ? error.message : "";
  return /TransactionWriteConflict|could not serialize access|deadlock detected|write conflict/i.test(message);
}

async function withSupportTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt + Math.floor(Math.random() * 25)));
    }
  }
  throw new SupportDomainError("SUPPORT_CONCURRENT_UPDATE_FAILED", 409);
}

async function lockTicket(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "SupportTicket" WHERE "id" = ${id} FOR UPDATE`;
}

async function createAudit(
  tx: Prisma.TransactionClient,
  input: {
    ticketId: string;
    actorUserId?: string | null;
    eventType: string;
    oldValue?: Prisma.InputJsonValue;
    newValue?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
    correlationId: string;
  },
) {
  return tx.supportTicketAudit.create({ data: input });
}

function adminNotificationPayload(publicId: string) {
  return {
    publicId,
    deepLink: `logivya://profile/admin/support/${encodeURIComponent(publicId)}`,
    route: "AdminSupportTicketDetail",
  };
}

function userNotificationPayload(publicId: string, status?: SupportTicketStatus) {
  return {
    publicId,
    deepLink: `logivya://support/${encodeURIComponent(publicId)}`,
    route: "SupportTicketDetail",
    ...(status ? { status } : {}),
  };
}

async function findExistingCreatedTicket(actor: SupportActor, clientRequestId: string | null) {
  if (!clientRequestId) return null;
  return prisma.supportTicket.findFirst({
    where: { createdById: actor.user.id, clientRequestId },
    select: ticketSummarySelect,
  });
}

export async function createSupportTicket(input: {
  actor: SupportActor;
  subject: string;
  category: string;
  message: string;
  source: string;
  clientMessageId?: string | null;
  clientRequestId?: string | null;
  attachmentUrl?: string | null;
  request?: Request;
}) {
  const subject = normalizeText(input.subject, "subject", 3, 160);
  const body = normalizeText(input.message, "message", 5, 10_000);
  const category = normalizeSupportCategory(input.category);
  if (!category) throw new SupportDomainError("SUPPORT_INVALID_CATEGORY", 400);
  const clientMessageId = normalizeClientId(input.clientMessageId);
  const clientRequestId = normalizeClientId(input.clientRequestId) ?? clientMessageId;
  const attachmentUrl = normalizeAttachmentUrl(input.attachmentUrl);
  const source = normalizeText(input.source || "WEB", "source", 2, 32).toUpperCase();
  const duplicate = await findExistingCreatedTicket(input.actor, clientRequestId);
  if (duplicate) return { ticket: serializeTicketSummary(duplicate), duplicate: true };

  await enforceOperationRateLimit({
    scope: "support.ticket.create",
    subject: input.actor.user.id,
    maxAttempts: 10,
    windowMs: 60 * 60_000,
    request: input.request,
  });

  const correlationId = requestCorrelationId(input.request);
  const adminRecipient = await resolvePlatformSupportRecipient();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await withSupportTransaction(async (tx) => {
        const now = new Date();
        const ticket = await tx.supportTicket.create({
          data: {
            publicId: publicTicketId(),
            clientRequestId,
            companyId: input.actor.company.id,
            tenantId: input.actor.company.id,
            createdById: input.actor.user.id,
            userId: input.actor.user.id,
            subject,
            title: subject,
            category,
            type: category,
            description: body,
            source,
            status: "WAITING_FOR_ADMIN",
            priority: "NORMAL",
            lastMessageAt: now,
            lastUserMessageAt: now,
            userLastReadAt: now,
            adminUnreadCount: 1,
          },
          select: ticketBaseSelect,
        });
        const message = await tx.supportTicketMessage.create({
          data: {
            ticketId: ticket.id,
            senderUserId: input.actor.user.id,
            senderType: "USER",
            message: body,
            clientMessageId,
            attachmentUrl,
          },
          select: messageSelect,
        });
        await createAudit(tx, {
          ticketId: ticket.id,
          actorUserId: input.actor.user.id,
          eventType: "SUPPORT_TICKET_CREATED",
          newValue: { status: "WAITING_FOR_ADMIN", priority: "NORMAL", category },
          metadata: { actorType: "USER", companyId: ticket.companyId, source },
          correlationId,
        });
        if (adminRecipient) {
          await enqueueSupportNotification(tx, {
            ticketId: ticket.id,
            recipient: adminRecipient,
            eventKey: `support-ticket-created:${ticket.id}`,
            type: NOTIFICATION_TYPES.SUPPORT_ADMIN_NEW_TICKET,
            title: "New support request",
            message: `Support request ${ticket.publicId} was created.`,
            emailTemplate: "support_created",
            payload: adminNotificationPayload(ticket.publicId),
          });
        }
        return { ticket, message };
      });
      return {
        ticket: { ...serializeTicketBase(result.ticket), messages: [serializeMessage(result.message)] },
        duplicate: false,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await findExistingCreatedTicket(input.actor, clientRequestId);
        if (existing) return { ticket: serializeTicketSummary(existing), duplicate: true };
        if (attempt < 3) continue;
      }
      throw error;
    }
  }
  throw new SupportDomainError("SUPPORT_CREATE_FAILED", 500);
}

export async function listUserSupportTickets(actor: SupportActor, filters: TicketListFilters = {}) {
  const limit = normalizeLimit(filters.limit);
  const status = normalizeStatusFilter(filters.status);
  const category = normalizeCategoryFilter(filters.category);
  const search = filters.search?.trim().slice(0, 160);
  const where: Prisma.SupportTicketWhereInput = {
    ...ownedTicketWhere(actor),
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
    ...(search ? { OR: [
      { publicId: { contains: search, mode: "insensitive" } },
      { subject: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };
  const rows = await prisma.supportTicket.findMany({
    where,
    select: ticketSummarySelect,
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    tickets: page.map((row) => serializeTicketSummary(row)),
    pageInfo: { hasMore, nextCursor: hasMore ? page.at(-1)?.id ?? null : null },
  };
}

async function readTicketMessages(
  tx: Prisma.TransactionClient,
  ticketId: string,
  input: { cursor?: string | null; limit?: number; includeInternal: boolean },
) {
  const limit = normalizeLimit(input.limit, 50);
  const rows = await tx.supportTicketMessage.findMany({
    where: {
      ticketId,
      deletedAt: null,
      ...(input.includeInternal ? {} : { isInternal: false }),
    },
    select: messageSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    messages: page.reverse().map(serializeMessage),
    pageInfo: { hasMore, nextCursor: hasMore ? page[0]?.id ?? null : null },
  };
}

export async function getUserSupportTicketDetail(
  actor: SupportActor,
  identifierValue: string,
  options: { cursor?: string | null; limit?: number; markRead?: boolean } = {},
) {
  const identifier = normalizeIdentifier(identifierValue);
  return withSupportTransaction(async (tx) => {
    const ticket = await tx.supportTicket.findFirst({
      where: ownedTicketWhere(actor, identifier),
      select: ticketBaseSelect,
    });
    if (!ticket) throw new SupportDomainError("SUPPORT_TICKET_NOT_FOUND", 404);
    if (options.markRead !== false && (ticket.userUnreadCount > 0 || !ticket.userLastReadAt)) {
      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: { userUnreadCount: 0, userLastReadAt: new Date() },
      });
      ticket.userUnreadCount = 0;
    }
    const conversation = await readTicketMessages(tx, ticket.id, {
      cursor: options.cursor,
      limit: options.limit,
      includeInternal: false,
    });
    return {
      ticket: { ...serializeTicketBase(ticket), messages: conversation.messages },
      messages: conversation.messages,
      pageInfo: conversation.pageInfo,
    };
  });
}

export async function addUserSupportMessage(input: {
  actor: SupportActor;
  identifier: string;
  reply: ReplyInput;
  request?: Request;
}) {
  const identifier = normalizeIdentifier(input.identifier);
  const body = normalizeText(input.reply.body, "message", 1, 10_000);
  const clientMessageId = normalizeClientId(input.reply.clientMessageId);
  const attachmentUrl = normalizeAttachmentUrl(input.reply.attachmentUrl);
  await enforceOperationRateLimit({
    scope: "support.message.user",
    subject: input.actor.user.id,
    maxAttempts: 60,
    windowMs: 60 * 60_000,
    request: input.request,
  });
  const correlationId = requestCorrelationId(input.request);
  const adminRecipient = await resolvePlatformSupportRecipient();

  return withSupportTransaction(async (tx) => {
    const found = await tx.supportTicket.findFirst({ where: ownedTicketWhere(input.actor, identifier), select: { id: true } });
    if (!found) throw new SupportDomainError("SUPPORT_TICKET_NOT_FOUND", 404);
    await lockTicket(tx, found.id);
    const ticket = await tx.supportTicket.findUnique({ where: { id: found.id }, select: ticketBaseSelect });
    if (!ticket) throw new SupportDomainError("SUPPORT_TICKET_NOT_FOUND", 404);

    if (clientMessageId) {
      const duplicate = await tx.supportTicketMessage.findUnique({
        where: { ticketId_clientMessageId: { ticketId: ticket.id, clientMessageId } },
        select: messageSelect,
      });
      if (duplicate) return { message: serializeMessage(duplicate), ticket: serializeTicketBase(ticket), duplicate: true };
    }
    if (!canUserReplyToSupportStatus(ticket.status)) throw new SupportDomainError("SUPPORT_TICKET_CLOSED", 409);

    const now = new Date();
    const previousStatus = canonicalSupportStatus(ticket.status);
    const nextStatus = statusAfterUserReply(ticket.status);
    const message = await tx.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        senderUserId: input.actor.user.id,
        senderType: "USER",
        message: body,
        clientMessageId,
        attachmentUrl,
      },
      select: messageSelect,
    });
    const updated = await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: nextStatus,
        lastMessageAt: now,
        lastUserMessageAt: now,
        userLastReadAt: now,
        userUnreadCount: 0,
        adminUnreadCount: { increment: 1 },
        resolvedAt: null,
        closedAt: null,
      },
      select: ticketBaseSelect,
    });
    await createAudit(tx, {
      ticketId: ticket.id,
      actorUserId: input.actor.user.id,
      eventType: previousStatus === "RESOLVED" ? "SUPPORT_REOPENED" : "SUPPORT_USER_REPLIED",
      oldValue: { status: previousStatus },
      newValue: { status: nextStatus, messageId: message.id },
      metadata: { actorType: "USER", companyId: ticket.companyId, hasAttachment: Boolean(attachmentUrl) },
      correlationId,
    });
    if (adminRecipient) {
      await enqueueSupportNotification(tx, {
        ticketId: ticket.id,
        recipient: adminRecipient,
        eventKey: `support-user-replied:${message.id}`,
        type: NOTIFICATION_TYPES.SUPPORT_USER_REPLIED,
        title: "New user reply",
        message: `A user replied to support request ${ticket.publicId}.`,
        emailTemplate: "support_replied",
        payload: adminNotificationPayload(ticket.publicId),
      });
    }
    return { message: serializeMessage(message), ticket: serializeTicketBase(updated), duplicate: false };
  });
}

function adminListWhere(filters: AdminTicketListFilters): Prisma.SupportTicketWhereInput {
  const status = normalizeStatusFilter(filters.status);
  const priority = normalizePriority(filters.priority);
  const category = normalizeCategoryFilter(filters.category);
  if (filters.priority && filters.priority !== "ALL" && !priority) throw new SupportDomainError("SUPPORT_INVALID_PRIORITY", 400);
  const search = filters.search?.trim().slice(0, 160);
  const createdFrom = normalizeDate(filters.createdFrom);
  const createdTo = normalizeDate(filters.createdTo, true);
  const updatedFrom = normalizeDate(filters.updatedFrom);
  const updatedTo = normalizeDate(filters.updatedTo, true);
  const and: Prisma.SupportTicketWhereInput[] = [];
  if (filters.userId) and.push({ OR: [{ createdById: filters.userId }, { userId: filters.userId }] });
  if (filters.userEmail) and.push({ createdBy: { email: { equals: filters.userEmail.trim(), mode: "insensitive" } } });
  if (search) {
    and.push({ OR: [
      { publicId: { contains: search, mode: "insensitive" } },
      { subject: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
      { createdBy: { email: { contains: search, mode: "insensitive" } } },
      { createdBy: { name: { contains: search, mode: "insensitive" } } },
      { company: { name: { contains: search, mode: "insensitive" } } },
    ] });
  }
  return {
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(category ? { category } : {}),
    ...(filters.companyId ? { companyId: filters.companyId } : {}),
    ...(filters.assignedAdminId ? { assignedToAdminId: filters.assignedAdminId } : {}),
    ...(filters.unreadOnly ? { adminUnreadCount: { gt: 0 } } : {}),
    ...(filters.unansweredOnly ? { lastAdminMessageAt: null } : {}),
    ...(createdFrom || createdTo ? { createdAt: { ...(createdFrom ? { gte: createdFrom } : {}), ...(createdTo ? { lte: createdTo } : {}) } } : {}),
    ...(updatedFrom || updatedTo ? { updatedAt: { ...(updatedFrom ? { gte: updatedFrom } : {}), ...(updatedTo ? { lte: updatedTo } : {}) } } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

export async function listAdminSupportTickets(filters: AdminTicketListFilters = {}) {
  const limit = normalizeLimit(filters.limit, 30);
  const rows = await prisma.supportTicket.findMany({
    where: adminListWhere(filters),
    select: ticketSummarySelect,
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    tickets: page.map((row) => serializeTicketSummary(row, true)),
    pageInfo: { hasMore, nextCursor: hasMore ? page.at(-1)?.id ?? null : null },
  };
}

export async function getAdminSupportTicketDetail(
  actor: SupportActor,
  identifierValue: string,
  options: { cursor?: string | null; limit?: number; markRead?: boolean } = {},
) {
  const identifier = normalizeIdentifier(identifierValue);
  const correlationId = randomUUID();
  return withSupportTransaction(async (tx) => {
    const ticket = await tx.supportTicket.findFirst({ where: ticketIdentifierWhere(identifier), select: ticketBaseSelect });
    if (!ticket) throw new SupportDomainError("SUPPORT_TICKET_NOT_FOUND", 404);
    if (options.markRead !== false && (ticket.adminUnreadCount > 0 || !ticket.adminLastReadAt)) {
      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: { adminUnreadCount: 0, adminLastReadAt: new Date() },
      });
      await createAudit(tx, {
        ticketId: ticket.id,
        actorUserId: actor.user.id,
        eventType: "SUPPORT_TICKET_OPENED_BY_ADMIN",
        metadata: { actorType: "ADMIN", companyId: ticket.companyId },
        correlationId,
      });
      ticket.adminUnreadCount = 0;
    }
    const [conversation, audits] = await Promise.all([
      readTicketMessages(tx, ticket.id, { cursor: options.cursor, limit: options.limit, includeInternal: true }),
      tx.supportTicketAudit.findMany({
        where: { ticketId: ticket.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
        select: {
          id: true,
          eventType: true,
          actorUserId: true,
          oldValue: true,
          newValue: true,
          metadata: true,
          correlationId: true,
          createdAt: true,
        },
      }),
    ]);
    return {
      ticket: { ...serializeTicketBase(ticket), messages: conversation.messages },
      messages: conversation.messages,
      pageInfo: conversation.pageInfo,
      auditTrail: audits.map((audit) => ({ ...audit, createdAt: audit.createdAt.toISOString() })),
    };
  });
}

export async function addAdminSupportMessage(input: {
  actor: SupportActor;
  identifier: string;
  reply: ReplyInput & { internalNote?: boolean };
  request?: Request;
}) {
  const identifier = normalizeIdentifier(input.identifier);
  const body = normalizeText(input.reply.body, "message", 1, 10_000);
  const clientMessageId = normalizeClientId(input.reply.clientMessageId);
  const attachmentUrl = normalizeAttachmentUrl(input.reply.attachmentUrl);
  const isInternal = Boolean(input.reply.internalNote);
  const correlationId = requestCorrelationId(input.request);

  return withSupportTransaction(async (tx) => {
    const found = await tx.supportTicket.findFirst({ where: ticketIdentifierWhere(identifier), select: { id: true } });
    if (!found) throw new SupportDomainError("SUPPORT_TICKET_NOT_FOUND", 404);
    await lockTicket(tx, found.id);
    const ticket = await tx.supportTicket.findUnique({ where: { id: found.id }, select: ticketBaseSelect });
    if (!ticket) throw new SupportDomainError("SUPPORT_TICKET_NOT_FOUND", 404);
    if (clientMessageId) {
      const duplicate = await tx.supportTicketMessage.findUnique({
        where: { ticketId_clientMessageId: { ticketId: ticket.id, clientMessageId } },
        select: messageSelect,
      });
      if (duplicate) return { message: serializeMessage(duplicate), ticket: serializeTicketBase(ticket), duplicate: true };
    }
    if (canonicalSupportStatus(ticket.status) === "CLOSED" && !isInternal) {
      throw new SupportDomainError("SUPPORT_TICKET_CLOSED", 409);
    }
    const now = new Date();
    const previousStatus = canonicalSupportStatus(ticket.status);
    const nextStatus = statusAfterAdminReply(ticket.status, isInternal);
    const message = await tx.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        senderUserId: input.actor.user.id,
        senderType: "ADMIN",
        message: body,
        clientMessageId,
        attachmentUrl,
        isInternal,
      },
      select: messageSelect,
    });
    const updated = await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        assignedToAdminId: input.actor.user.id,
        status: nextStatus,
        ...(isInternal ? {} : {
          lastMessageAt: now,
          lastAdminMessageAt: now,
          firstAdminReplyAt: ticket.firstAdminReplyAt ?? now,
          adminLastReadAt: now,
          adminUnreadCount: 0,
          userUnreadCount: { increment: 1 },
          resolvedAt: null,
          closedAt: null,
        }),
      },
      select: ticketBaseSelect,
    });
    await createAudit(tx, {
      ticketId: ticket.id,
      actorUserId: input.actor.user.id,
      eventType: isInternal ? "SUPPORT_INTERNAL_NOTE_ADDED" : "SUPPORT_ADMIN_REPLIED",
      oldValue: { status: previousStatus },
      newValue: { status: nextStatus, messageId: message.id },
      metadata: { actorType: "ADMIN", companyId: ticket.companyId, hasAttachment: Boolean(attachmentUrl) },
      correlationId,
    });
    if (!isInternal) {
      const recipient: SupportNotificationRecipient = {
        userId: ticket.createdById,
        companyId: ticket.companyId,
        email: ticket.createdBy.email,
      };
      await enqueueSupportNotification(tx, {
        ticketId: ticket.id,
        recipient,
        eventKey: `support-admin-replied:${message.id}`,
        type: NOTIFICATION_TYPES.SUPPORT_ADMIN_REPLIED,
        title: "New support reply",
        message: `The support team replied to request ${ticket.publicId}.`,
        emailTemplate: "support_replied",
        payload: userNotificationPayload(ticket.publicId),
      });
    }
    return { message: serializeMessage(message), ticket: serializeTicketBase(updated), duplicate: false };
  });
}

export async function changeAdminSupportStatus(input: {
  actor: SupportActor;
  identifier: string;
  status: string;
  reason?: string | null;
  request?: Request;
}) {
  const identifier = normalizeIdentifier(input.identifier);
  const nextStatus = normalizeStatusFilter(input.status);
  if (!nextStatus) throw new SupportDomainError("SUPPORT_INVALID_STATUS", 400);
  const reason = input.reason ? normalizeText(input.reason, "reason", 3, 500) : null;
  const correlationId = requestCorrelationId(input.request);
  return withSupportTransaction(async (tx) => {
    const found = await tx.supportTicket.findFirst({ where: ticketIdentifierWhere(identifier), select: { id: true } });
    if (!found) throw new SupportDomainError("SUPPORT_TICKET_NOT_FOUND", 404);
    await lockTicket(tx, found.id);
    const ticket = await tx.supportTicket.findUnique({ where: { id: found.id }, select: ticketBaseSelect });
    if (!ticket) throw new SupportDomainError("SUPPORT_TICKET_NOT_FOUND", 404);
    const previousStatus = canonicalSupportStatus(ticket.status);
    if (!canAdminTransitionSupportStatus(previousStatus, nextStatus)) {
      throw new SupportDomainError("SUPPORT_INVALID_STATUS_TRANSITION", 409, { from: previousStatus, to: nextStatus });
    }
    if (previousStatus === nextStatus) return { ticket: serializeTicketBase(ticket), unchanged: true };
    const now = new Date();
    const updated = await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: nextStatus,
        assignedToAdminId: input.actor.user.id,
        resolvedAt: nextStatus === "RESOLVED" ? now : null,
        closedAt: nextStatus === "CLOSED" ? now : null,
      },
      select: ticketBaseSelect,
    });
    const eventType = nextStatus === "RESOLVED"
      ? "SUPPORT_RESOLVED"
      : nextStatus === "CLOSED"
        ? "SUPPORT_CLOSED"
        : previousStatus === "CLOSED"
          ? "SUPPORT_REOPENED"
          : "SUPPORT_STATUS_CHANGED";
    await createAudit(tx, {
      ticketId: ticket.id,
      actorUserId: input.actor.user.id,
      eventType,
      oldValue: { status: previousStatus },
      newValue: { status: nextStatus },
      metadata: { actorType: "ADMIN", companyId: ticket.companyId, ...(reason ? { reason } : {}) },
      correlationId,
    });
    if (["RESOLVED", "CLOSED", "OPEN"].includes(nextStatus)) {
      const notificationType = nextStatus === "CLOSED"
        ? NOTIFICATION_TYPES.SUPPORT_TICKET_CLOSED
        : previousStatus === "CLOSED"
          ? NOTIFICATION_TYPES.SUPPORT_TICKET_REOPENED
          : NOTIFICATION_TYPES.SUPPORT_STATUS_CHANGED;
      await enqueueSupportNotification(tx, {
        ticketId: ticket.id,
        recipient: { userId: ticket.createdById, companyId: ticket.companyId, email: ticket.createdBy.email },
        eventKey: `support-status:${ticket.id}:${correlationId}`,
        type: notificationType,
        title: "Support request updated",
        message: `Support request ${ticket.publicId} was updated.`,
        emailTemplate: "support_replied",
        payload: userNotificationPayload(ticket.publicId, nextStatus),
      });
    }
    return { ticket: serializeTicketBase(updated), unchanged: false };
  });
}

export async function changeAdminSupportPriority(input: {
  actor: SupportActor;
  identifier: string;
  priority: string;
  request?: Request;
}) {
  const identifier = normalizeIdentifier(input.identifier);
  const priority = normalizePriority(input.priority);
  if (!priority) throw new SupportDomainError("SUPPORT_INVALID_PRIORITY", 400);
  const correlationId = requestCorrelationId(input.request);
  return withSupportTransaction(async (tx) => {
    const found = await tx.supportTicket.findFirst({ where: ticketIdentifierWhere(identifier), select: { id: true } });
    if (!found) throw new SupportDomainError("SUPPORT_TICKET_NOT_FOUND", 404);
    await lockTicket(tx, found.id);
    const ticket = await tx.supportTicket.findUnique({ where: { id: found.id }, select: ticketBaseSelect });
    if (!ticket) throw new SupportDomainError("SUPPORT_TICKET_NOT_FOUND", 404);
    const previousPriority = canonicalSupportPriority(ticket.priority);
    if (previousPriority === priority) return { ticket: serializeTicketBase(ticket), unchanged: true };
    const updated = await tx.supportTicket.update({
      where: { id: ticket.id },
      data: { priority, assignedToAdminId: input.actor.user.id },
      select: ticketBaseSelect,
    });
    await createAudit(tx, {
      ticketId: ticket.id,
      actorUserId: input.actor.user.id,
      eventType: "SUPPORT_PRIORITY_CHANGED",
      oldValue: { priority: previousPriority },
      newValue: { priority },
      metadata: { actorType: "ADMIN", companyId: ticket.companyId },
      correlationId,
    });
    return { ticket: serializeTicketBase(updated), unchanged: false };
  });
}

export async function assignAdminSupportTicket(input: {
  actor: SupportActor;
  identifier: string;
  assignedAdminUserId?: string | null;
  request?: Request;
}) {
  const identifier = normalizeIdentifier(input.identifier);
  const owner = await resolvePlatformSupportRecipient();
  const assignedAdminUserId = input.assignedAdminUserId?.trim() || null;
  if (assignedAdminUserId && assignedAdminUserId !== owner?.userId) {
    throw new SupportDomainError("SUPPORT_INVALID_ASSIGNEE", 400);
  }
  const correlationId = requestCorrelationId(input.request);
  return withSupportTransaction(async (tx) => {
    const ticket = await tx.supportTicket.findFirst({ where: ticketIdentifierWhere(identifier), select: ticketBaseSelect });
    if (!ticket) throw new SupportDomainError("SUPPORT_TICKET_NOT_FOUND", 404);
    const updated = await tx.supportTicket.update({
      where: { id: ticket.id },
      data: { assignedToAdminId: assignedAdminUserId },
      select: ticketBaseSelect,
    });
    await createAudit(tx, {
      ticketId: ticket.id,
      actorUserId: input.actor.user.id,
      eventType: "SUPPORT_ASSIGNED",
      oldValue: { assignedAdminUserId: ticket.assignedToAdminId },
      newValue: { assignedAdminUserId },
      metadata: { actorType: "ADMIN", companyId: ticket.companyId },
      correlationId,
    });
    return { ticket: serializeTicketBase(updated) };
  });
}

export async function closeOwnedSupportTicket(input: {
  actor: SupportActor;
  identifier: string;
  request?: Request;
}) {
  const identifier = normalizeIdentifier(input.identifier);
  const correlationId = requestCorrelationId(input.request);
  return withSupportTransaction(async (tx) => {
    const ticket = await tx.supportTicket.findFirst({ where: ownedTicketWhere(input.actor, identifier), select: ticketBaseSelect });
    if (!ticket) throw new SupportDomainError("SUPPORT_TICKET_NOT_FOUND", 404);
    await lockTicket(tx, ticket.id);
    if (canonicalSupportStatus(ticket.status) === "CLOSED") return { ticket: serializeTicketBase(ticket), unchanged: true };
    const updated = await tx.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "CLOSED", closedAt: new Date() },
      select: ticketBaseSelect,
    });
    await createAudit(tx, {
      ticketId: ticket.id,
      actorUserId: input.actor.user.id,
      eventType: "SUPPORT_CLOSED",
      oldValue: { status: canonicalSupportStatus(ticket.status) },
      newValue: { status: "CLOSED" },
      metadata: { actorType: "USER", companyId: ticket.companyId },
      correlationId,
    });
    return { ticket: serializeTicketBase(updated), unchanged: false };
  });
}

export async function getAdminSupportMetrics() {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const [byStatus, urgent, unread, resolvedToday, failedNotifications, responseTimes] = await Promise.all([
    prisma.supportTicket.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.supportTicket.count({ where: { priority: "URGENT", status: { notIn: ["RESOLVED", "CLOSED"] } } }),
    prisma.supportTicket.count({ where: { adminUnreadCount: { gt: 0 } } }),
    prisma.supportTicket.count({ where: { resolvedAt: { gte: startOfToday } } }),
    prisma.supportNotificationOutbox.count({ where: { status: "FAILED" } }),
    prisma.$queryRaw<Array<{ average_first_response_seconds: number | null }>>`
      SELECT AVG(EXTRACT(EPOCH FROM ("firstAdminReplyAt" - "createdAt")))::float8 AS "average_first_response_seconds"
      FROM "SupportTicket"
      WHERE "firstAdminReplyAt" IS NOT NULL
    `,
  ]);
  const counts = Object.fromEntries(byStatus.map((entry) => [canonicalSupportStatus(entry.status), entry._count._all]));
  return {
    totalOpen: (counts.OPEN ?? 0) + (counts.IN_PROGRESS ?? 0) + (counts.WAITING_FOR_USER ?? 0) + (counts.WAITING_FOR_ADMIN ?? 0),
    open: counts.OPEN ?? 0,
    inProgress: counts.IN_PROGRESS ?? 0,
    waitingForUser: counts.WAITING_FOR_USER ?? 0,
    waitingForAdmin: counts.WAITING_FOR_ADMIN ?? 0,
    resolvedToday,
    urgent,
    unread,
    failedNotifications,
    averageFirstResponseSeconds: responseTimes[0]?.average_first_response_seconds ?? null,
  };
}
