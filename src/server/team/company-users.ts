import { randomBytes } from "node:crypto";
import { z } from "zod";

import { prisma } from "@/server/db";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { hashPassword } from "@/server/security/passwords";
import { writeAuditLog } from "@/server/security/audit";

export const inviteCompanyUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]),
});

export const updateCompanyUserSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "OPERATOR", "VIEWER"]).optional(),
  status: z.enum(["ACTIVE", "INVITED", "SUSPENDED"]).optional(),
  name: z.string().trim().min(2).max(100).optional(),
  password: z.string().min(12).max(128).optional(),
});

export type InviteCompanyUserInput = z.infer<typeof inviteCompanyUserSchema>;
export type UpdateCompanyUserInput = z.infer<typeof updateCompanyUserSchema>;
export type CompanyUserActorRole = "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";

type CompanyUserContext = {
  companyId: string;
  actorUserId: string;
  actorRole: string;
};

function assertCanManageUsers(actorRole: string) {
  if (!["OWNER", "ADMIN"].includes(actorRole)) throw new Error("FORBIDDEN");
}

export function serializeCompanyMember(member: Awaited<ReturnType<typeof listCompanyUsers>>[number]) {
  return {
    id: member.id,
    role: member.role,
    status: member.status,
    createdAt: member.createdAt.toISOString(),
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
    where: { companyId },
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

export async function inviteCompanyUser(request: Request, context: CompanyUserContext, input: InviteCompanyUserInput) {
  assertCanManageUsers(context.actorRole);

  const access = await subscriptionAccess.canInviteUser(context.companyId);
  if (!access.allowed) {
    const error = new Error("users.planLimit");
    (error as Error & { limit?: number }).limit = access.limit;
    throw error;
  }

  const email = input.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    const temporary = `Inv!${randomBytes(24).toString("base64url")}Aa1`;
    user = await prisma.user.create({
      data: {
        name: input.name,
        email,
        username: `invite-${randomBytes(8).toString("hex")}`,
        phone: null,
        passwordHash: await hashPassword(temporary, process.env.PASSWORD_PEPPER ?? ""),
        status: "INVITED",
        locale: "tr",
      },
    });
  }

  const member = await prisma.companyUser.upsert({
    where: { companyId_userId: { companyId: context.companyId, userId: user.id } },
    update: { role: input.role, status: "INVITED" },
    create: { companyId: context.companyId, userId: user.id, role: input.role, status: "INVITED" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          sessions: { select: { lastActiveAt: true }, orderBy: { lastActiveAt: "desc" }, take: 1 },
        },
      },
    },
  });

  await writeAuditLog(request, {
    companyId: context.companyId,
    userId: context.actorUserId,
    action: "company.user.invited",
    entityType: "CompanyUser",
    entityId: member.id,
    after: { email, role: member.role },
  });

  return member;
}

async function authorizeCompanyUser(context: CompanyUserContext, targetId: string) {
  assertCanManageUsers(context.actorRole);

  const target = await prisma.companyUser.findFirst({
    where: { id: targetId, companyId: context.companyId },
    include: { user: true },
  });

  if (!target) throw new Error("NOT_FOUND");
  if (target.role === "OWNER" && context.actorRole !== "OWNER") throw new Error("FORBIDDEN");

  if (target.userId === context.actorUserId && target.role === "OWNER") {
    const owners = await prisma.companyUser.count({
      where: { companyId: context.companyId, role: "OWNER", status: "ACTIVE" },
    });
    if (owners <= 1) throw new Error("users.lastOwner");
  }

  return target;
}

export async function updateCompanyUser(request: Request, context: CompanyUserContext, targetId: string, input: UpdateCompanyUserInput) {
  const target = await authorizeCompanyUser(context, targetId);
  if (input.role === "OWNER" && context.actorRole !== "OWNER") throw new Error("FORBIDDEN");

  const { password, name, ...membershipData } = input;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(membershipData).length) {
      await tx.companyUser.update({ where: { id: targetId }, data: membershipData });
    }

    if (name || password) {
      await tx.user.update({
        where: { id: target.userId },
        data: {
          ...(name ? { name } : {}),
          ...(password ? { passwordHash: await hashPassword(password, process.env.PASSWORD_PEPPER ?? "") } : {}),
        },
      });
    }

    if (password) {
      await tx.userSession.updateMany({
        where: { userId: target.userId, companyId: context.companyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.mobileDeviceSession.updateMany({
        where: { userId: target.userId, companyId: context.companyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  });

  await writeAuditLog(request, {
    companyId: context.companyId,
    userId: context.actorUserId,
    action: password ? "company.user.password_changed" : "company.user.updated",
    entityType: "CompanyUser",
    entityId: targetId,
    before: { name: target.user.name, role: target.role, status: target.status },
    after: { name, role: membershipData.role, status: membershipData.status, passwordChanged: Boolean(password) },
  });
}

export async function deleteCompanyUser(request: Request, context: CompanyUserContext, targetId: string) {
  const target = await authorizeCompanyUser(context, targetId);

  await prisma.companyUser.delete({ where: { id: targetId } });
  await prisma.userSession.updateMany({
    where: { userId: target.userId, companyId: context.companyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await prisma.mobileDeviceSession.updateMany({
    where: { userId: target.userId, companyId: context.companyId, revokedAt: null },
    data: { revokedAt: new Date() },
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
