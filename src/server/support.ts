import "server-only";
import type { Prisma, SupportTicketStatus } from "@prisma/client";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import {
  canUserReplyToSupportStatus,
  canonicalSupportStatuses,
  statusAfterAdminReply,
  statusAfterUserReply,
} from "@/server/support/constants";

type TicketSession = {
  company: { id: string };
  user: { id: string; email?: string | null };
};

export const supportTicketStatuses = canonicalSupportStatuses;
export const adminWritableSupportTicketStatuses = supportTicketStatuses;

export function isSupportSuperAdmin(user: { email?: string | null }) {
  return isAuthorizedLogivyaPlatformAdmin({ email: user.email });
}

export function supportTicketOwnerWhere(context: TicketSession): Prisma.SupportTicketWhereInput {
  return {
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
  return canUserReplyToSupportStatus(ticket.status);
}

export function nextStatusAfterUserReply(current: SupportTicketStatus | string): SupportTicketStatus {
  return statusAfterUserReply(current);
}

export function nextStatusAfterAdminReply(current: SupportTicketStatus | string, isInternalNote = false): SupportTicketStatus {
  return statusAfterAdminReply(current, isInternalNote);
}

export async function requireSupportSuperAdmin(request: Request, permission: "read" | "update" = "read") {
  return requirePlatformAdmin(permission === "update" ? "admin.support.update" : "admin.support.read", request);
}

export * from "@/server/support/constants";
export * from "@/server/support/errors";
