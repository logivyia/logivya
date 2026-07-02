import "server-only";
import type { Prisma } from "@prisma/client";
import { requireApiSession } from "@/server/auth/session";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import { requireMobileAuth } from "@/server/mobile/auth";

type TicketSession = {
  company: { id: string };
  user: { id: string; email?: string | null };
};

export function isSupportSuperAdmin(user: { email?: string | null }) {
  return isAuthorizedLogivyaPlatformAdmin({ email: user.email });
}

export function supportTicketOwnerWhere(context: TicketSession): Prisma.SupportTicketWhereInput {
  return {
    companyId: context.company.id,
    OR: [{ userId: context.user.id }, { createdById: context.user.id }],
  };
}

export function supportTicketWebVisibilityWhere(context: TicketSession): Prisma.SupportTicketWhereInput {
  return isSupportSuperAdmin(context.user) ? {} : supportTicketOwnerWhere(context);
}

export function supportTicketIdentityData(context: TicketSession, input: { title: string; description: string; category: string }) {
  return {
    tenantId: context.company.id,
    userId: context.user.id,
    title: input.title,
    description: input.description,
    category: input.category,
  };
}

export async function requireSupportSuperAdmin(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const context = /^Bearer\s+/i.test(authorization) ? await requireMobileAuth(request) : await requireApiSession();

  if (!isSupportSuperAdmin(context.user)) {
    throw new Error("FORBIDDEN");
  }

  return context;
}
