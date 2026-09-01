import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

export const updateCompanyUserSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
}).strict().refine((input) => Boolean(input.status), { message: "validation.invalid" });

export type UpdateCompanyUserInput = z.infer<typeof updateCompanyUserSchema>;
export type CompanyUserActorRole = "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";

type CompanyUserContext = {
  companyId: string;
  actorUserId: string;
  actorRole: string;
};

type TeamTransaction = Prisma.TransactionClient;

export async function rejectCompanyUserRoleMutation(
  request: Request,
  context: CompanyUserContext,
  targetId: string,
  input: unknown,
) {
  if (!input || typeof input !== "object" || !Object.prototype.hasOwnProperty.call(input, "role")) return;
  await writeAuditLog(request, {
    companyId: context.companyId,
    userId: context.actorUserId,
    action: "USER_ROLE_CHANGE_ATTEMPT_REJECTED",
    result: "DENIED",
    reason: "FORBIDDEN",
    entityType: "CompanyUser",
    entityId: targetId,
    after: { clientSuppliedRoleRejected: true },
  });
  throw new Error("FORBIDDEN");
}

function assertCanManageUsers(actorRole: string) {
  if (actorRole !== "OWNER") throw new Error("FORBIDDEN");
}

async function lockCompany(tx: TeamTransaction, companyId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Company" WHERE "id" = ${companyId} FOR UPDATE`;
  if (!rows.length) throw new Error("COMPANY_NOT_FOUND");
}

async function findManageableTarget(tx: TeamTransaction, context: CompanyUserContext, targetId: string) {
  const target = await tx.companyUser.findFirst({
    where: { id: targetId, companyId: context.companyId, status: { not: "REMOVED" } },
    include: { user: true },
  });
  if (!target) throw new Error("NOT_FOUND");
  if (target.role === "OWNER") throw new Error("users.ownerProtected");
  return target;
}

export function serializeCompanyMember(
  member: Awaited<ReturnType<typeof listCompanyUsers>>[number],
  currentUserId?: string,
) {
  const lastLoginAt = [
    member.user.sessions[0]?.lastActiveAt,
    member.user.mobileDeviceSessions[0]?.lastUsedAt,
  ].filter((value): value is Date => Boolean(value)).sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
  return {
    id: member.id,
    role: member.role,
    status: member.status,
    lifecycleState: member.lifecycleState,
    activationCompletedAt: member.activationCompletedAt?.toISOString() ?? null,
    sharedAccessExpiredAt: member.sharedAccessExpiredAt?.toISOString() ?? null,
    canManagePendingCredentials: member.lifecycleState === "PENDING_ACTIVATION"
      && member.user.mustChangePassword,
    createdAt: member.createdAt.toISOString(),
    joinedAt: member.joinedAt.toISOString(),
    seatActivatedAt: member.seatActivatedAt?.toISOString() ?? null,
    suspendedAt: member.suspendedAt?.toISOString() ?? null,
    isCurrent: member.userId === currentUserId,
    user: {
      id: member.user.id,
      name: member.user.name,
      firstName: member.user.firstName,
      lastName: member.user.lastName,
      email: member.user.email,
      status: member.user.status,
      mustChangePassword: member.user.mustChangePassword,
      lastLoginAt: lastLoginAt?.toISOString() ?? null,
      sessions: member.user.sessions.map((session) => ({ lastActiveAt: session.lastActiveAt.toISOString() })),
    },
  };
}

export async function listCompanyUsers(companyId: string) {
  return prisma.companyUser.findMany({
    where: { companyId, status: { not: "REMOVED" } },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          email: true,
          status: true,
          mustChangePassword: true,
          sessions: {
            select: { lastActiveAt: true },
            orderBy: { lastActiveAt: "desc" },
            take: 1,
          },
          mobileDeviceSessions: {
            select: { lastUsedAt: true },
            orderBy: { lastUsedAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
}

export async function updateCompanyUser(request: Request, context: CompanyUserContext, targetId: string, input: UpdateCompanyUserInput) {
  assertCanManageUsers(context.actorRole);
  const currentTarget = await prisma.companyUser.findFirst({
    where: { id: targetId, companyId: context.companyId, status: { not: "REMOVED" } },
    include: { user: true },
  });
  if (!currentTarget) throw new Error("NOT_FOUND");
  if (currentTarget.role === "OWNER") throw new Error("users.ownerProtected");
  const activated = currentTarget.lifecycleState !== "PENDING_ACTIVATION"
    || Boolean(currentTarget.activationCompletedAt)
    || !currentTarget.user.mustChangePassword;
  const code = activated
    ? "MEMBER_SELF_MANAGED_AFTER_ACTIVATION"
    : "PENDING_MEMBER_MANAGEMENT_ONLY";
  await writeAuditLog(request, {
    companyId: context.companyId,
    userId: context.actorUserId,
    action: "OWNER_MEMBER_STATUS_CHANGE_REJECTED",
    result: "DENIED",
    reason: code,
    entityType: "CompanyUser",
    entityId: targetId,
    before: {
      status: currentTarget.status,
      lifecycleState: currentTarget.lifecycleState,
    },
    after: { requestedStatus: input.status },
  });
  throw new Error(code);
}

export async function deleteCompanyUser(request: Request, context: CompanyUserContext, targetId: string) {
  assertCanManageUsers(context.actorRole);
  const outcome = await prisma.$transaction(async (tx) => {
    await lockCompany(tx, context.companyId);
    const currentTarget = await findManageableTarget(tx, context, targetId);
    if (
      currentTarget.lifecycleState !== "PENDING_ACTIVATION"
      || currentTarget.activationCompletedAt
      || !currentTarget.user.mustChangePassword
    ) {
      return { removed: false as const, target: currentTarget };
    }
    const revokedAt = new Date();
    await tx.companyUser.update({
      where: { id: targetId },
      data: {
        status: "REMOVED",
        lifecycleState: "REMOVED_BEFORE_ACTIVATION",
        role: "OPERATOR",
        removedAt: revokedAt,
        detachedAt: revokedAt,
        suspendedAt: null,
      },
    });
    await tx.userSession.updateMany({
      where: { userId: currentTarget.userId, companyId: context.companyId, revokedAt: null },
      data: { revokedAt },
    });
    await tx.mobileDeviceSession.updateMany({
      where: { userId: currentTarget.userId, companyId: context.companyId, revokedAt: null },
      data: { revokedAt },
    });
    await tx.forcedPasswordChangeChallenge.updateMany({
      where: { userId: currentTarget.userId, usedAt: null },
      data: { usedAt: revokedAt },
    });
    return { removed: true as const, target: currentTarget };
  });
  const target = outcome.target;

  if (!outcome.removed) {
    await writeAuditLog(request, {
      companyId: context.companyId,
      userId: context.actorUserId,
      action: "OWNER_MEMBER_REMOVAL_REJECTED",
      result: "DENIED",
      reason: "MEMBER_SELF_MANAGED_AFTER_ACTIVATION",
      entityType: "CompanyUser",
      entityId: targetId,
      before: {
        status: target.status,
        lifecycleState: target.lifecycleState,
      },
    });
    throw new Error("MEMBER_SELF_MANAGED_AFTER_ACTIVATION");
  }

  await writeAuditLog(request, {
    companyId: context.companyId,
    userId: context.actorUserId,
    action: "company.user.removed",
    entityType: "CompanyUser",
    entityId: targetId,
    before: { email: target.user.email, role: target.role },
  });
  await writeAuditLog(request, {
    companyId: context.companyId,
    userId: context.actorUserId,
    action: "USER_REMOVED",
    entityType: "CompanyUser",
    entityId: targetId,
    before: { role: target.role, status: target.status },
    after: {
      status: "REMOVED",
      lifecycleState: "REMOVED_BEFORE_ACTIVATION",
      sessionsRevoked: true,
    },
  });
}
