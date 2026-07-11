import "server-only";
import type { Prisma, SupportTicketStatus } from "@prisma/client";
import { requireApiSession } from "@/server/auth/session";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import { requireMobileAuth } from "@/server/mobile/auth";

type TicketSession = {
  company: { id: string };
  user: { id: string; email?: string | null };
};

export const supportTicketStatuses = ["OPEN", "PENDING", "IN_PROGRESS", "ANSWERED", "RESOLVED", "CLOSED"] as const;
export const adminWritableSupportTicketStatuses = supportTicketStatuses;

export function isSupportSuperAdmin(user: { email?: string | null }) {
  return isAuthorizedLogivyaPlatformAdmin({ email: user.email });
}

export function supportTicketOwnerWhere(context: TicketSession): Prisma.SupportTicketWhereInput {
  return {
    companyId: context.company.id,
    OR: [{ userId: context.user.id }, { createdById: context.user.id }],
  };
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

export function canReplyToSupportTicket(ticket: { status: SupportTicketStatus | string }) {
  return ticket.status !== "CLOSED";
}

export function nextStatusAfterUserReply(current: SupportTicketStatus | string): SupportTicketStatus {
  if (current === "CLOSED") return "CLOSED";
  return "PENDING";
}

export function nextStatusAfterAdminReply(current: SupportTicketStatus | string, isInternalNote = false): SupportTicketStatus | undefined {
  if (isInternalNote) return undefined;
  if (current === "CLOSED") return "ANSWERED";
  return "ANSWERED";
}

export async function requireSupportSuperAdmin(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const context = /^Bearer\s+/i.test(authorization) ? await requireMobileAuth(request) : await requireApiSession();

  if (!isSupportSuperAdmin(context.user)) {
    throw new Error("FORBIDDEN");
  }

  return context;
}
