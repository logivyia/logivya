import { randomBytes } from "node:crypto";
import type { CompanyRole, Prisma } from "@prisma/client";
import { z } from "zod";

import { resolveCompanyEntitlements } from "@/server/billing/company-entitlements";
import { prisma } from "@/server/db";
import { getRequestLocale } from "@/i18n/server";
import { hashOpaqueToken } from "@/server/security/authentication";
import { writeAuditLog } from "@/server/security/audit";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { calculateCompanySeatUsage, canActivateMembershipSeat, canReserveInvitationSeat } from "@/server/team/seat-policy";
import { processInvitationDelivery, queueInvitationDelivery } from "@/server/team/invitation-delivery";

const INVITATION_LIFETIME_MS = 72 * 60 * 60 * 1000;
const INVITATION_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITATION_CODE_LENGTH = 16;

export const createCompanyInvitationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]).optional(),
}).strict();

export type CreateCompanyInvitationInput = z.infer<typeof createCompanyInvitationSchema>;
export type CompanyInvitationContext = {
  companyId: string;
  actorUserId: string;
  actorRole: string;
};

type InvitationTransaction = Prisma.TransactionClient;
type InvitationCredential = { token?: string; code?: string };
type InvitationError = Error & { companyId?: string; invitationId?: string; limit?: number; used?: number };

function assertOwner(role: string) {
  if (role !== "OWNER") throw new Error("FORBIDDEN");
}

function normalizedEmail(email: string) {
  return email.trim().toLowerCase();
}

function invitationHash(value: string) {
  return hashOpaqueToken(value);
}

export function normalizeInvitationCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function generateInvitationCode() {
  const bytes = randomBytes(INVITATION_CODE_LENGTH);
  const raw = Array.from(bytes, (byte) => INVITATION_CODE_ALPHABET[byte & 31]).join("");
  return raw.match(/.{1,4}/g)!.join("-");
}

function invitationCodeHash(code: string) {
  return invitationHash(normalizeInvitationCode(code));
}

function invitationCredentialWhere(input: InvitationCredential): Prisma.CompanyInvitationWhereInput | null {
  const token = input.token?.trim();
  if (token && token.length >= 32) return { tokenHash: invitationHash(token) };

  const normalizedCode = normalizeInvitationCode(input.code ?? "");
  if (normalizedCode.length === INVITATION_CODE_LENGTH) return { shortCodeHash: invitationCodeHash(normalizedCode) };
  return null;
}

function invitationError(code: string, invitation?: { id: string; companyId: string }) {
  const error = new Error(code) as InvitationError;
  error.companyId = invitation?.companyId;
  error.invitationId = invitation?.id;
  return error;
}

function configuredPositiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

async function assertSeatRotationAllowed(tx: InvitationTransaction, companyId: string, now: Date) {
  const override = await tx.auditLog.findFirst({
    where: { companyId, action: "company.seat_rotation_override", createdAt: { gte: new Date(now.getTime() - 31 * 24 * 60 * 60_000) } },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  const overrideMetadata = override?.metadata && typeof override.metadata === "object" && !Array.isArray(override.metadata)
    ? override.metadata as Record<string, unknown>
    : null;
  const overrideExpiresAt = typeof overrideMetadata?.expiresAt === "string" ? new Date(overrideMetadata.expiresAt) : null;
  if (overrideExpiresAt && overrideExpiresAt > now && typeof overrideMetadata?.reason === "string" && overrideMetadata.reason.trim().length >= 8) return;

  const dailyLimit = configuredPositiveInteger("SEAT_ROTATION_MAX_PER_DAY", 5);
  const monthlyLimit = configuredPositiveInteger("SEAT_ROTATION_MAX_PER_MONTH", 20);
  const [daily, monthly] = await Promise.all([
    tx.auditLog.count({ where: { companyId, action: { in: ["company.user.removed", "COMPANY_USER_REMOVED"] }, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) } } }),
    tx.auditLog.count({ where: { companyId, action: { in: ["company.user.removed", "COMPANY_USER_REMOVED"] }, createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60_000) } } }),
  ]);
  if (daily >= dailyLimit || monthly >= monthlyLimit) {
    const error = new Error("SEAT_ROTATION_LIMIT_REACHED") as InvitationError;
    error.limit = daily >= dailyLimit ? dailyLimit : monthlyLimit;
    error.used = daily >= dailyLimit ? daily : monthly;
    throw error;
  }
}

function invitationStateError(status: string, expiresAt: Date, now: Date) {
  if (status === "ACCEPTED") return "INVITATION_ALREADY_USED";
  if (status === "REVOKED") return "INVITATION_REVOKED";
  if (status === "DECLINED") return "INVITATION_DECLINED";
  if (status === "EXPIRED" || expiresAt <= now) return "INVITATION_EXPIRED";
  if (status !== "PENDING") return "INVITATION_INVALID";
  return null;
}

export function companyInvitationErrorStatus(code: string) {
  if (code === "UNAUTHORIZED") return 401;
  if (code === "FORBIDDEN" || code === "INVITATION_EMAIL_MISMATCH") return 403;
  if (code === "INVITATION_INVALID") return 404;
  if (code === "INVITATION_EXPIRED") return 410;
  if (code === "SEAT_ROTATION_LIMIT_REACHED") return 429;
  if (["INVITATION_ALREADY_USED", "INVITATION_ALREADY_PENDING", "INVITATION_REVOKED", "INVITATION_DECLINED", "SEAT_LIMIT_REACHED", "users.alreadyMember"].includes(code)) return 409;
  if (code === "RATE_LIMITED") return 429;
  return 400;
}

async function lockCompany(tx: InvitationTransaction, companyId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Company" WHERE "id" = ${companyId} FOR UPDATE`;
  if (!rows.length) throw new Error("COMPANY_NOT_FOUND");
}

async function expirePendingInvitations(tx: InvitationTransaction, companyId: string, now = new Date()) {
  await tx.companyInvitation.updateMany({
    where: { companyId, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED", reservedSeat: false },
  });
}

async function seatUsageInTransaction(tx: InvitationTransaction, companyId: string, now = new Date()) {
  await expirePendingInvitations(tx, companyId, now);
  const current = await resolveCompanyEntitlements(companyId, tx, now);
  if (!current?.valid) throw new Error("subscription.inactive");
  const [activeMembers, legacyInvitedMembers, pendingInvitations, whatsappConnectionsUsed] = await Promise.all([
    tx.companyUser.count({ where: { companyId, status: "ACTIVE" } }),
    tx.companyUser.count({ where: { companyId, status: "INVITED" } }),
    tx.companyInvitation.count({ where: { companyId, status: "PENDING", reservedSeat: true, expiresAt: { gt: now } } }),
    tx.whatsAppAccount.count({ where: { companyId, archivedAt: null } }),
  ]);
  return {
    ...calculateCompanySeatUsage({
      limit: current.entitlements.teamSeats,
      activeMembers,
      legacyInvitedMembers,
      pendingInvitations,
    }),
    planSlug: current.plan.slug,
    planName: current.plan.name,
    whatsappConnectionLimit: current.entitlements.whatsappConnections,
    whatsappConnectionsUsed,
    whatsappConnectionsAvailable: Math.max(0, current.entitlements.whatsappConnections - whatsappConnectionsUsed),
  };
}

export async function getCompanySeatUsage(companyId: string) {
  return prisma.$transaction(async (tx) => {
    await lockCompany(tx, companyId);
    return seatUsageInTransaction(tx, companyId);
  });
}

export async function listCompanyInvitations(companyId: string) {
  await prisma.companyInvitation.updateMany({
    where: { companyId, status: "PENDING", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED", reservedSeat: false },
  });
  return prisma.companyInvitation.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export function serializeCompanyInvitation(invitation: Awaited<ReturnType<typeof listCompanyInvitations>>[number]) {
  return {
    id: invitation.id,
    email: invitation.email,
    name: invitation.name,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    declinedAt: invitation.declinedAt?.toISOString() ?? null,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    sentAt: invitation.sentAt?.toISOString() ?? null,
    resendCount: invitation.resendCount,
    createdAt: invitation.createdAt.toISOString(),
  };
}

function invitationBaseUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}

export async function createCompanyInvitation(
  request: Request,
  context: CompanyInvitationContext,
  input: CreateCompanyInvitationInput,
) {
  assertOwner(context.actorRole);
  const email = normalizedEmail(input.email);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = invitationHash(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);
  const appBaseUrl = invitationBaseUrl(request);
  const locale = await getRequestLocale(request.headers.get("x-logivya-locale"));

  await enforceOperationRateLimit({
    scope: "company-invitation-create",
    subject: `${context.companyId}:${context.actorUserId}`,
    maxAttempts: 20,
    windowMs: 60 * 60 * 1000,
    request,
  });

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      await lockCompany(tx, context.companyId);
      await expirePendingInvitations(tx, context.companyId, now);

      const existingMember = await tx.companyUser.findFirst({
        where: { companyId: context.companyId, user: { email }, status: "ACTIVE" },
        select: { id: true },
      });
      if (existingMember) throw new Error("users.alreadyMember");
      await assertSeatRotationAllowed(tx, context.companyId, now);

      const existingPending = await tx.companyInvitation.findFirst({
        where: { companyId: context.companyId, email, status: "PENDING", expiresAt: { gt: now } },
      });
      if (existingPending) throw invitationError("INVITATION_ALREADY_PENDING", existingPending);
      const usage = await seatUsageInTransaction(tx, context.companyId, now);
      if (!canReserveInvitationSeat(usage, false)) {
        const error = new Error("SEAT_LIMIT_REACHED") as InvitationError;
        error.companyId = context.companyId;
        error.limit = usage.limit;
        error.used = usage.used;
        throw error;
      }

      const invitation = await tx.companyInvitation.create({
        data: {
          companyId: context.companyId,
          invitedByUserId: context.actorUserId,
          email,
          name: input.name,
          role: "OPERATOR",
          tokenHash,
          shortCodeHash: null,
          expiresAt,
          reservedSeat: true,
        },
      });
      const outbox = await queueInvitationDelivery(tx, {
        invitationId: invitation.id,
        recipient: invitation.email,
        appBaseUrl,
        token,
        locale,
        eventKey: `company-invitation:${invitation.id}:initial:${tokenHash.slice(0, 16)}`,
      });
      return { invitation, outbox };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SEAT_LIMIT_REACHED") {
      await writeAuditLog(request, {
        companyId: context.companyId,
        userId: context.actorUserId,
        action: "company.invitation.seat_limit_rejected",
        entityType: "CompanyInvitation",
        after: { email, limit: (error as InvitationError).limit, used: (error as InvitationError).used },
      });
    }
    throw error;
  }

  const delivery = await processInvitationDelivery(result.outbox.id);

  await writeAuditLog(request, {
    companyId: context.companyId,
    userId: context.actorUserId,
    action: "company.invitation.created",
    entityType: "CompanyInvitation",
    entityId: result.invitation.id,
    after: { email, userType: "STANDARD_USER", expiresAt: result.invitation.expiresAt, emailSent: delivery.sent },
  });

  return { invitation: result.invitation, emailSent: delivery.sent };
}

export async function resendCompanyInvitation(
  request: Request,
  context: CompanyInvitationContext,
  invitationId: string,
) {
  assertOwner(context.actorRole);
  await enforceOperationRateLimit({
    scope: "company-invitation-resend",
    subject: `${context.companyId}:${context.actorUserId}`,
    maxAttempts: 10,
    windowMs: 60 * 60 * 1000,
    request,
  });
  const token = randomBytes(32).toString("base64url");
  const tokenHash = invitationHash(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);
  const appBaseUrl = invitationBaseUrl(request);
  const locale = await getRequestLocale(request.headers.get("x-logivya-locale"));

  const result = await prisma.$transaction(async (tx) => {
    await lockCompany(tx, context.companyId);
    await expirePendingInvitations(tx, context.companyId, now);
    const invitation = await tx.companyInvitation.findFirst({
      where: { id: invitationId, companyId: context.companyId, status: "PENDING", expiresAt: { gt: now } },
    });
    if (!invitation) throw new Error("NOT_FOUND");
    if (invitation.lastResentAt && now.getTime() - invitation.lastResentAt.getTime() < 60_000) throw new Error("RATE_LIMITED");
    const deliveriesLastDay = await tx.invitationDeliveryOutbox.count({
      where: { invitationId, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) } },
    });
    if (deliveriesLastDay >= 5) throw new Error("RATE_LIMITED");

    const updated = await tx.companyInvitation.update({
      where: { id: invitation.id },
      data: {
        tokenHash,
        shortCodeHash: null,
        expiresAt,
        reservedSeat: true,
        sentAt: null,
        resendCount: { increment: 1 },
        lastResentAt: now,
      },
    });
    const outbox = await queueInvitationDelivery(tx, {
      invitationId: updated.id,
      recipient: updated.email,
      appBaseUrl,
      token,
      locale,
      eventKey: `company-invitation:${updated.id}:resend:${tokenHash.slice(0, 16)}`,
    });
    return { invitation: updated, outbox };
  });

  const delivery = await processInvitationDelivery(result.outbox.id);
  await writeAuditLog(request, {
    companyId: context.companyId,
    userId: context.actorUserId,
    action: "company.invitation.resent",
    entityType: "CompanyInvitation",
    entityId: result.invitation.id,
    after: { expiresAt, emailSent: delivery.sent, resendCount: result.invitation.resendCount },
  });
  return { invitation: result.invitation, emailSent: delivery.sent };
}

export async function revokeCompanyInvitation(request: Request, context: CompanyInvitationContext, invitationId: string) {
  assertOwner(context.actorRole);
  const result = await prisma.$transaction(async (tx) => {
    await lockCompany(tx, context.companyId);
    return tx.companyInvitation.updateMany({
      where: { id: invitationId, companyId: context.companyId, status: "PENDING" },
      data: { status: "REVOKED", revokedAt: new Date(), reservedSeat: false },
    });
  });
  if (!result.count) throw new Error("NOT_FOUND");
  await writeAuditLog(request, {
    companyId: context.companyId,
    userId: context.actorUserId,
    action: "company.invitation.revoked",
    entityType: "CompanyInvitation",
    entityId: invitationId,
  });
}

export async function findPendingInvitation(token: string, email?: string) {
  const trimmedToken = token.trim();
  if (trimmedToken.length < 32) return null;
  return prisma.companyInvitation.findFirst({
    where: {
      tokenHash: invitationHash(trimmedToken),
      status: "PENDING",
      expiresAt: { gt: new Date() },
      ...(email ? { email: normalizedEmail(email) } : {}),
    },
    include: { company: { select: { id: true, name: true } } },
  });
}

export async function findPendingInvitationByCode(code: string, email?: string) {
  const normalizedCode = normalizeInvitationCode(code);
  if (normalizedCode.length !== INVITATION_CODE_LENGTH) return null;
  return prisma.companyInvitation.findFirst({
    where: {
      shortCodeHash: invitationCodeHash(normalizedCode),
      status: "PENDING",
      expiresAt: { gt: new Date() },
      ...(email ? { email: normalizedEmail(email) } : {}),
    },
    include: { company: { select: { id: true, name: true } } },
  });
}

export async function acceptCompanyInvitationInTransaction(
  tx: InvitationTransaction,
  input: InvitationCredential & { userId: string; email: string },
) {
  const now = new Date();
  const credentialWhere = invitationCredentialWhere(input);
  if (!credentialWhere) throw new Error("INVITATION_INVALID");
  const initialInvitation = await tx.companyInvitation.findFirst({ where: credentialWhere });
  if (!initialInvitation) throw new Error("INVITATION_INVALID");
  await lockCompany(tx, initialInvitation.companyId);
  const invitation = await tx.companyInvitation.findUnique({ where: { id: initialInvitation.id } });
  if (!invitation) throw new Error("INVITATION_INVALID");
  if (invitation.email !== normalizedEmail(input.email)) throw invitationError("INVITATION_EMAIL_MISMATCH", invitation);
  const stateError = invitationStateError(invitation.status, invitation.expiresAt, now);
  if (stateError) throw invitationError(stateError, invitation);

  const existing = await tx.companyUser.findUnique({
    where: { companyId_userId: { companyId: invitation.companyId, userId: input.userId } },
  });
  const usage = await seatUsageInTransaction(tx, invitation.companyId, now);
  const occupiedMembershipSeats = usage.activeMembers + usage.legacyInvitedMembers;
  if (!canActivateMembershipSeat(usage, existing?.status)) {
    const error = invitationError("SEAT_LIMIT_REACHED", invitation);
    error.limit = usage.limit;
    error.used = occupiedMembershipSeats;
    throw error;
  }

  const membership = await tx.companyUser.upsert({
    where: { companyId_userId: { companyId: invitation.companyId, userId: input.userId } },
    create: { companyId: invitation.companyId, userId: input.userId, role: "OPERATOR", status: "ACTIVE", joinedAt: now, seatActivatedAt: now },
    update: { role: "OPERATOR", status: "ACTIVE", seatActivatedAt: now, suspendedAt: null, removedAt: null },
  });
  const acceptedInvitation = await tx.companyInvitation.update({
    where: { id: invitation.id },
    data: { status: "ACCEPTED", acceptedByUserId: input.userId, acceptedAt: now, reservedSeat: false },
  });
  await tx.user.updateMany({ where: { id: input.userId, status: "INVITED" }, data: { status: "ACTIVE" } });
  return { invitation: acceptedInvitation, membership, companyId: invitation.companyId };
}

export async function acceptCompanyInvitation(
  input: InvitationCredential & { userId: string; email: string },
  request?: Request,
) {
  try {
    return await prisma.$transaction((tx) => acceptCompanyInvitationInTransaction(tx, input));
  } catch (error) {
    const invitationFailure = error as InvitationError;
    if (request && invitationFailure.companyId) {
      await writeAuditLog(request, {
        companyId: invitationFailure.companyId,
        userId: input.userId,
        action: "company.invitation.accept_failed",
        entityType: "CompanyInvitation",
        entityId: invitationFailure.invitationId,
        after: { reason: invitationFailure.message, limit: invitationFailure.limit, used: invitationFailure.used },
      });
    }
    throw error;
  }
}

export async function declineCompanyInvitation(input: InvitationCredential & { userId: string; email: string }) {
  return prisma.$transaction(async (tx) => {
    const credentialWhere = invitationCredentialWhere(input);
    if (!credentialWhere) throw new Error("INVITATION_INVALID");
    const initialInvitation = await tx.companyInvitation.findFirst({ where: credentialWhere });
    if (!initialInvitation) throw new Error("INVITATION_INVALID");
    await lockCompany(tx, initialInvitation.companyId);
    const invitation = await tx.companyInvitation.findUnique({ where: { id: initialInvitation.id } });
    if (!invitation) throw new Error("INVITATION_INVALID");
    if (invitation.email !== normalizedEmail(input.email)) throw invitationError("INVITATION_EMAIL_MISMATCH", invitation);
    const stateError = invitationStateError(invitation.status, invitation.expiresAt, new Date());
    if (stateError) throw invitationError(stateError, invitation);
    return tx.companyInvitation.update({
      where: { id: invitation.id },
      data: { status: "DECLINED", acceptedByUserId: input.userId, declinedAt: new Date(), reservedSeat: false },
    });
  });
}

export function isInvitableRole(value: string): value is Exclude<CompanyRole, "OWNER"> {
  return value === "ADMIN" || value === "OPERATOR" || value === "VIEWER";
}
