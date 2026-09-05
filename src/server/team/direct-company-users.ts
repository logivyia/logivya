import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { resolveCompanyEntitlements } from "@/server/billing/company-entitlements";
import { prisma } from "@/server/db";
import { keyedIdentifierHash } from "@/server/observability/privacy";
import { logger } from "@/server/observability/logger";
import { requestLogContext } from "@/server/observability/request-id";
import { writeAuditLog } from "@/server/security/audit";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { hashPassword, PasswordPolicyValidationError, verifyPassword } from "@/server/security/passwords";
import { calculateCompanySeatUsage } from "@/server/team/seat-policy";

export const createDirectCompanyUserSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().max(254).email(),
  temporaryPassword: z.string().min(1).max(512),
}).strict();

export const resetCompanyUserTemporaryPasswordSchema = z.object({
  temporaryPassword: z.string().min(1).max(512),
}).strict();

export type CreateDirectCompanyUserInput = z.infer<typeof createDirectCompanyUserSchema>;
export type DirectCompanyUserContext = {
  companyId: string;
  actorUserId: string;
  actorRole: string;
};

type TeamTransaction = Prisma.TransactionClient;
type DirectUserError = Error & { limit?: number; used?: number };

async function rejectNonOwnerContext(
  request: Request,
  context: DirectCompanyUserContext,
  operation: "create" | "reset",
) {
  if (context.actorRole === "OWNER") return;
  logger.warn(`company.user.${operation}_unauthorized`, {
    ...requestLogContext(request),
    companyId: context.companyId,
    userId: context.actorUserId,
    errorCode: "FORBIDDEN",
  });
  await writeAuditLog(request, {
    companyId: context.companyId,
    userId: context.actorUserId,
    action: operation === "create"
      ? "UNAUTHORIZED_USER_CREATION_ATTEMPT"
      : "UNAUTHORIZED_TEMPORARY_PASSWORD_RESET_ATTEMPT",
    result: "DENIED",
    reason: "FORBIDDEN",
    entityType: "CompanyUser",
  }).catch(() => undefined);
  throw new Error("FORBIDDEN");
}

function normalizedEmail(email: string) {
  return email.trim().toLowerCase();
}

function configuredPositiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

async function assertOwnerInTransaction(tx: TeamTransaction, context: DirectCompanyUserContext) {
  const rows = await tx.$queryRaw<Array<{ id: string; ownerId: string }>>`
    SELECT "id", "ownerId" FROM "Company" WHERE "id" = ${context.companyId} FOR UPDATE
  `;
  const company = rows[0];
  if (!company) throw new Error("COMPANY_NOT_FOUND");

  const membership = await tx.companyUser.findUnique({
    where: {
      companyId_userId: {
        companyId: context.companyId,
        userId: context.actorUserId,
      },
    },
    include: { user: true },
  });
  if (
    context.actorRole !== "OWNER"
    || company.ownerId !== context.actorUserId
    || membership?.role !== "OWNER"
    || membership.status !== "ACTIVE"
  ) {
    throw new Error("FORBIDDEN");
  }
  return membership;
}

async function cancelLegacyPendingInvitations(tx: TeamTransaction, companyId: string, now: Date) {
  await tx.invitationDeliveryOutbox.updateMany({
    where: {
      status: { in: ["PENDING", "PROCESSING"] },
      invitation: { companyId, status: "PENDING" },
    },
    data: { status: "FAILED", lastError: "INVITATION_FLOW_DISABLED" },
  });
  await tx.companyInvitation.updateMany({
    where: { companyId, status: "PENDING" },
    data: { status: "REVOKED", reservedSeat: false, revokedAt: now },
  });
}

async function assertSeatRotationAllowed(tx: TeamTransaction, companyId: string, now: Date) {
  const override = await tx.auditLog.findFirst({
    where: {
      companyId,
      action: "company.seat_rotation_override",
      createdAt: { gte: new Date(now.getTime() - 31 * 24 * 60 * 60_000) },
    },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  const metadata = override?.metadata && typeof override.metadata === "object" && !Array.isArray(override.metadata)
    ? override.metadata as Record<string, unknown>
    : null;
  const overrideExpiresAt = typeof metadata?.expiresAt === "string" ? new Date(metadata.expiresAt) : null;
  if (overrideExpiresAt && overrideExpiresAt > now && typeof metadata?.reason === "string" && metadata.reason.trim().length >= 8) return;

  const dailyLimit = configuredPositiveInteger("SEAT_ROTATION_MAX_PER_DAY", 5);
  const monthlyLimit = configuredPositiveInteger("SEAT_ROTATION_MAX_PER_MONTH", 20);
  const [daily, monthly] = await Promise.all([
    tx.auditLog.count({
      where: {
        companyId,
        action: { in: ["company.user.removed", "COMPANY_USER_REMOVED"] },
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
      },
    }),
    tx.auditLog.count({
      where: {
        companyId,
        action: { in: ["company.user.removed", "COMPANY_USER_REMOVED"] },
        createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60_000) },
      },
    }),
  ]);
  if (daily >= dailyLimit || monthly >= monthlyLimit) {
    const error = new Error("SEAT_ROTATION_LIMIT_REACHED") as DirectUserError;
    error.limit = daily >= dailyLimit ? dailyLimit : monthlyLimit;
    error.used = daily >= dailyLimit ? daily : monthly;
    throw error;
  }
}

async function companySeatUsageInTransaction(tx: TeamTransaction, companyId: string, now: Date) {
  const current = await resolveCompanyEntitlements(companyId, tx, now);
  if (!current?.valid) throw new Error("subscription.inactive");
  const [activeMembers, suspendedMembers, legacyInvitedMembers] = await Promise.all([
    tx.companyUser.count({ where: { companyId, status: "ACTIVE" } }),
    tx.companyUser.count({ where: { companyId, status: "SUSPENDED" } }),
    tx.companyUser.count({ where: { companyId, status: "INVITED" } }),
  ]);
  return {
    ...calculateCompanySeatUsage({
      limit: current.entitlements.teamSeats,
      activeMembers,
      suspendedMembers,
      legacyInvitedMembers,
      pendingInvitations: 0,
    }),
    planSlug: current.plan.slug,
    planName: current.plan.name,
  };
}

export function directCompanyUserValidationCode(error: z.ZodError<CreateDirectCompanyUserInput>) {
  const field = error.issues[0]?.path[0];
  if (field === "firstName") return "FIRST_NAME_REQUIRED";
  if (field === "lastName") return "LAST_NAME_REQUIRED";
  if (field === "email") return "INVALID_EMAIL";
  if (field === "temporaryPassword") return "PASSWORD_REQUIRED";
  return "VALIDATION_ERROR";
}

const publicErrors = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "COMPANY_NOT_FOUND",
  "subscription.inactive",
  "SEAT_LIMIT_REACHED",
  "SEAT_ROTATION_LIMIT_REACHED",
  "USER_ALREADY_IN_TENANT",
  "EMAIL_NOT_AVAILABLE",
  "RATE_LIMITED",
  "NOT_FOUND",
  "users.ownerProtected",
  "MEMBER_SELF_MANAGED_AFTER_ACTIVATION",
  "PENDING_MEMBER_MANAGEMENT_ONLY",
  "USER_MANAGEMENT_FORBIDDEN",
  "PASSWORD_REQUIRED",
  "PASSWORD_TOO_SHORT",
  "PASSWORD_INVALID_TYPE",
  "PASSWORD_REUSE_NOT_ALLOWED",
]);

export function directCompanyUserPublicErrorCode(error: unknown) {
  if (error instanceof PasswordPolicyValidationError) return error.code;
  const message = error instanceof Error ? error.message : "";
  if (publicErrors.has(message)) return message;
  if ((error as { code?: string } | null)?.code === "P2002") return "EMAIL_NOT_AVAILABLE";
  return "USER_OPERATION_FAILED";
}

export function directCompanyUserErrorStatus(code: string) {
  if (code === "UNAUTHORIZED") return 401;
  if ([
    "FORBIDDEN",
    "subscription.inactive",
    "MEMBER_SELF_MANAGED_AFTER_ACTIVATION",
    "PENDING_MEMBER_MANAGEMENT_ONLY",
    "USER_MANAGEMENT_FORBIDDEN",
  ].includes(code)) return 403;
  if (["COMPANY_NOT_FOUND", "NOT_FOUND"].includes(code)) return 404;
  if (["SEAT_LIMIT_REACHED", "USER_ALREADY_IN_TENANT", "EMAIL_NOT_AVAILABLE", "users.ownerProtected"].includes(code)) return 409;
  if (["RATE_LIMITED", "SEAT_ROTATION_LIMIT_REACHED"].includes(code)) return 429;
  if (code === "USER_OPERATION_FAILED") return 500;
  return 400;
}

export async function createDirectCompanyUser(
  request: Request,
  context: DirectCompanyUserContext,
  input: CreateDirectCompanyUserInput,
) {
  await enforceOperationRateLimit({
    scope: "company-user-create",
    subject: `${context.companyId}:${context.actorUserId}`,
    maxAttempts: 20,
    windowMs: 60 * 60_000,
    request,
  });
  await rejectNonOwnerContext(request, context, "create");

  const email = normalizedEmail(input.email);
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const now = new Date();

  try {
    const passwordHash = await hashPassword(input.temporaryPassword, process.env.PASSWORD_PEPPER ?? "");
    const result = await prisma.$transaction(async (tx) => {
      const actorMembership = await assertOwnerInTransaction(tx, context);
      await cancelLegacyPendingInvitations(tx, context.companyId, now);
      await assertSeatRotationAllowed(tx, context.companyId, now);

      const existingUser = await tx.user.findUnique({
        where: { email },
        include: {
          memberships: {
            where: { companyId: context.companyId, status: { not: "REMOVED" } },
            select: { id: true },
          },
        },
      });
      if (existingUser?.memberships.length) throw new Error("USER_ALREADY_IN_TENANT");
      if (existingUser) throw new Error("EMAIL_NOT_AVAILABLE");

      const usage = await companySeatUsageInTransaction(tx, context.companyId, now);
      if (usage.used >= usage.limit) {
        const error = new Error("SEAT_LIMIT_REACHED") as DirectUserError;
        error.limit = usage.limit;
        error.used = usage.used;
        throw error;
      }

      const user = await tx.user.create({
        data: {
          name: fullName,
          firstName,
          lastName,
          username: `user-${randomBytes(12).toString("hex")}`,
          email,
          passwordHash,
          status: "ACTIVE",
          mustChangePassword: true,
          temporaryPasswordSetAt: now,
          locale: actorMembership.user.locale,
          timezone: actorMembership.user.timezone,
          country: actorMembership.user.country,
        },
      });
      const membership = await tx.companyUser.create({
        data: {
          companyId: context.companyId,
          userId: user.id,
          createdByUserId: context.actorUserId,
          role: "OPERATOR",
          status: "ACTIVE",
          lifecycleState: "PENDING_ACTIVATION",
          joinedAt: now,
          seatActivatedAt: now,
        },
      });
      return {
        user,
        membership,
        capacity: {
          used: usage.used + 1,
          limit: usage.limit,
          remaining: Math.max(0, usage.limit - usage.used - 1),
        },
      };
    });

    await writeAuditLog(request, {
      companyId: context.companyId,
      userId: context.actorUserId,
      action: "USER_CREATED_BY_OWNER",
      entityType: "CompanyUser",
      entityId: result.membership.id,
      after: {
        createdUserId: result.user.id,
        role: result.membership.role,
        status: result.membership.status,
        lifecycleState: result.membership.lifecycleState,
        mustChangePassword: true,
        emailHash: keyedIdentifierHash(email),
        capacity: result.capacity,
      },
    });
    return result;
  } catch (error) {
    const code = directCompanyUserPublicErrorCode(error);
    const action = code === "SEAT_LIMIT_REACHED"
      ? "USER_CREATION_REJECTED_SEAT_LIMIT"
      : ["USER_ALREADY_IN_TENANT", "EMAIL_NOT_AVAILABLE"].includes(code)
        ? "USER_CREATION_REJECTED_DUPLICATE"
        : code === "FORBIDDEN"
          ? "UNAUTHORIZED_USER_CREATION_ATTEMPT"
          : "USER_CREATION_REJECTED";
    logger.warn("company.user.direct_creation_rejected", {
      ...requestLogContext(request),
      companyId: context.companyId,
      userId: context.actorUserId,
      errorCode: code,
      emailHash: keyedIdentifierHash(email),
    });
    await writeAuditLog(request, {
      companyId: context.companyId,
      userId: context.actorUserId,
      action,
      result: "DENIED",
      reason: code,
      entityType: "CompanyUser",
      after: {
        emailHash: keyedIdentifierHash(email),
        limit: (error as DirectUserError | null)?.limit,
        used: (error as DirectUserError | null)?.used,
      },
    }).catch(() => undefined);
    if (code === "SEAT_LIMIT_REACHED") {
      await writeAuditLog(request, {
        companyId: context.companyId,
        userId: context.actorUserId,
        action: "CONCURRENT_SEAT_LIMIT_REJECTION",
        result: "DENIED",
        reason: code,
        entityType: "CompanyUser",
        after: {
          limit: (error as DirectUserError | null)?.limit,
          used: (error as DirectUserError | null)?.used,
        },
      }).catch(() => undefined);
    }
    throw error;
  }
}

export async function resetCompanyUserTemporaryPassword(
  request: Request,
  context: DirectCompanyUserContext,
  targetId: string,
  temporaryPassword: string,
) {
  await enforceOperationRateLimit({
    scope: "company-user-temporary-password-reset",
    subject: `${context.companyId}:${context.actorUserId}`,
    maxAttempts: 20,
    windowMs: 60 * 60_000,
    request,
  });
  await rejectNonOwnerContext(request, context, "reset");
  const passwordHash = await hashPassword(temporaryPassword, process.env.PASSWORD_PEPPER ?? "");
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    await assertOwnerInTransaction(tx, context);
    const target = await tx.companyUser.findFirst({
      where: { id: targetId, companyId: context.companyId, status: { not: "REMOVED" } },
      include: { user: true },
    });
    if (!target) throw new Error("NOT_FOUND");
    if (target.role === "OWNER" || target.userId === context.actorUserId) throw new Error("users.ownerProtected");
    if (
      target.lifecycleState !== "PENDING_ACTIVATION"
      || !target.user.mustChangePassword
      || target.activationCompletedAt
    ) {
      await writeAuditLog(request, {
        companyId: context.companyId,
        userId: context.actorUserId,
        action: "OWNER_ACTIVATED_MEMBER_MANAGEMENT_REJECTED",
        result: "DENIED",
        reason: "MEMBER_SELF_MANAGED_AFTER_ACTIVATION",
        entityType: "CompanyUser",
        entityId: targetId,
        after: { targetUserId: target.userId, lifecycleState: target.lifecycleState },
      }).catch(() => undefined);
      throw new Error("MEMBER_SELF_MANAGED_AFTER_ACTIVATION");
    }
    if (await verifyPassword(target.user.passwordHash, temporaryPassword, process.env.PASSWORD_PEPPER ?? "")) {
      throw new Error("PASSWORD_REUSE_NOT_ALLOWED");
    }

    await tx.user.update({
      where: { id: target.userId },
      data: {
        passwordHash,
        mustChangePassword: true,
        temporaryPasswordSetAt: now,
      },
    });
    await Promise.all([
      tx.userSession.updateMany({ where: { userId: target.userId, revokedAt: null }, data: { revokedAt: now } }),
      tx.mobileDeviceSession.updateMany({ where: { userId: target.userId, revokedAt: null }, data: { revokedAt: now } }),
      tx.trustedDevice.updateMany({ where: { userId: target.userId, revokedAt: null }, data: { revokedAt: now } }),
      tx.forcedPasswordChangeChallenge.updateMany({ where: { userId: target.userId, usedAt: null }, data: { usedAt: now } }),
    ]);
    return target;
  });

  await writeAuditLog(request, {
    companyId: context.companyId,
    userId: context.actorUserId,
    action: "USER_TEMPORARY_PASSWORD_RESET",
    entityType: "CompanyUser",
    entityId: targetId,
    after: { targetUserId: result.userId, sessionsRevoked: true, mustChangePassword: true },
  });
}
