import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { resolveCompanyEntitlements } from "@/server/billing/company-entitlements";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

export const updateCompanyUserSchema = z.object({
  role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
}).strict().refine((input) => Boolean(input.role || input.status), { message: "validation.invalid" });

export type UpdateCompanyUserInput = z.infer<typeof updateCompanyUserSchema>;
export type CompanyUserActorRole = "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";

type CompanyUserContext = {
  companyId: string;
  actorUserId: string;
  actorRole: string;
};

type TeamTransaction = Prisma.TransactionClient;
type SeatLimitError = Error & { limit?: number; used?: number };

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

async function assertActivationSeatAvailable(tx: TeamTransaction, companyId: string, currentStatus: string) {
  if (currentStatus === "ACTIVE" || currentStatus === "INVITED") return;
  const now = new Date();
  await tx.companyInvitation.updateMany({
    where: { companyId, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED", reservedSeat: false },
  });
  const current = await resolveCompanyEntitlements(companyId, tx, now);
  if (!current?.valid) throw new Error("subscription.inactive");
  const [activeMembers, legacyInvitedMembers, pendingInvitations] = await Promise.all([
    tx.companyUser.count({ where: { companyId, status: "ACTIVE" } }),
    tx.companyUser.count({ where: { companyId, status: "INVITED" } }),
    tx.companyInvitation.count({ where: { companyId, status: "PENDING", expiresAt: { gt: now } } }),
  ]);
  const used = activeMembers + legacyInvitedMembers + pendingInvitations;
  const limit = current.entitlements.teamSeats;
  if (used >= limit) {
    const error = new Error("SEAT_LIMIT_REACHED") as SeatLimitError;
    error.limit = limit;
    error.used = used;
    throw error;
  }
}

export function serializeCompanyMember(member: Awaited<ReturnType<typeof listCompanyUsers>>[number]) {
  return {
    id: member.id,
    role: member.role,
    status: member.status,
    createdAt: member.createdAt.toISOString(),
    joinedAt: member.joinedAt.toISOString(),
    seatActivatedAt: member.seatActivatedAt?.toISOString() ?? null,
    suspendedAt: member.suspendedAt?.toISOString() ?? null,
    user: {
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      status: member.user.status,
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
          email: true,
          status: true,
          sessions: {
            select: { lastActiveAt: true },
            orderBy: { lastActiveAt: "desc" },
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
  const target = await prisma.$transaction(async (tx) => {
    await lockCompany(tx, context.companyId);
    const currentTarget = await findManageableTarget(tx, context, targetId);
    if (input.status === "ACTIVE") await assertActivationSeatAvailable(tx, context.companyId, currentTarget.status);

    const updated = await tx.companyUser.update({
      where: { id: targetId },
      data: {
        role: "OPERATOR",
        ...(input.status ? { status: input.status } : {}),
        ...(input.status === "ACTIVE" ? { seatActivatedAt: new Date(), suspendedAt: null, removedAt: null } : {}),
        ...(input.status === "SUSPENDED" ? { suspendedAt: new Date() } : {}),
      },
    });
    if (input.status === "SUSPENDED") {
      const revokedAt = new Date();
      await tx.userSession.updateMany({
        where: { userId: currentTarget.userId, companyId: context.companyId, revokedAt: null },
        data: { revokedAt },
      });
      await tx.mobileDeviceSession.updateMany({
        where: { userId: currentTarget.userId, companyId: context.companyId, revokedAt: null },
        data: { revokedAt },
      });
    }
    return { before: currentTarget, after: updated };
  });

  await writeAuditLog(request, {
    companyId: context.companyId,
    userId: context.actorUserId,
    action: input.status === "SUSPENDED" ? "company.user.suspended" : input.status === "ACTIVE" ? "company.user.reactivated" : "company.user.standard_role_confirmed",
    entityType: "CompanyUser",
    entityId: targetId,
    before: { role: target.before.role, status: target.before.status },
    after: { role: target.after.role, status: target.after.status },
  });
}

export async function deleteCompanyUser(request: Request, context: CompanyUserContext, targetId: string) {
  assertCanManageUsers(context.actorRole);
  const target = await prisma.$transaction(async (tx) => {
    await lockCompany(tx, context.companyId);
    const currentTarget = await findManageableTarget(tx, context, targetId);
    const revokedAt = new Date();
    await tx.companyUser.update({
      where: { id: targetId },
      data: { status: "REMOVED", role: "OPERATOR", removedAt: revokedAt, suspendedAt: null },
    });
    await tx.userSession.updateMany({
      where: { userId: currentTarget.userId, companyId: context.companyId, revokedAt: null },
      data: { revokedAt },
    });
    await tx.mobileDeviceSession.updateMany({
      where: { userId: currentTarget.userId, companyId: context.companyId, revokedAt: null },
      data: { revokedAt },
    });
    return currentTarget;
  });

  await writeAuditLog(request, {
    companyId: context.companyId,
    userId: context.actorUserId,
    action: "company.user.removed",
    entityType: "CompanyUser",
    entityId: targetId,
    before: { email: target.user.email, role: target.role },
  });
}
