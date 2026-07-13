import type { SupportTicketPriority, SupportTicketStatus } from "@prisma/client";

export const supportCategories = [
  "TECHNICAL",
  "WHATSAPP_CONNECTION",
  "MESSAGE_DELIVERY",
  "DELETE_FOR_EVERYONE",
  "ACCOUNT",
  "SUBSCRIPTION",
  "BILLING",
  "TEAM",
  "SECURITY",
  "FEATURE_REQUEST",
  "OTHER",
] as const;

export type SupportCategory = (typeof supportCategories)[number];

export const canonicalSupportStatuses = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_USER",
  "WAITING_FOR_ADMIN",
  "RESOLVED",
  "CLOSED",
] as const satisfies readonly SupportTicketStatus[];

export const supportPriorities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const satisfies readonly SupportTicketPriority[];

const categoryAliases: Record<string, SupportCategory> = {
  WHATSAPP: "WHATSAPP_CONNECTION",
  WHATSAPPCONNECTION: "WHATSAPP_CONNECTION",
  QR_CODE: "WHATSAPP_CONNECTION",
  QRCODE: "WHATSAPP_CONNECTION",
  MESSAGEDELIVERY: "MESSAGE_DELIVERY",
  SUBSCRIPTIONPAYMENT: "SUBSCRIPTION",
  INVOICE: "BILLING",
};

export function normalizeSupportCategory(value: string): SupportCategory | null {
  const normalized = value.trim().replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toUpperCase();
  const canonical = categoryAliases[normalized] ?? normalized;
  return supportCategories.includes(canonical as SupportCategory) ? canonical as SupportCategory : null;
}

export function canonicalSupportStatus(value: SupportTicketStatus | string): SupportTicketStatus {
  if (value === "PENDING") return "WAITING_FOR_ADMIN";
  if (value === "ANSWERED") return "WAITING_FOR_USER";
  return value as SupportTicketStatus;
}

export function canonicalSupportPriority(value: SupportTicketPriority | string): SupportTicketPriority {
  return value === "MEDIUM" ? "NORMAL" : value as SupportTicketPriority;
}

const adminTransitions: Record<string, ReadonlySet<string>> = {
  OPEN: new Set(["IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED"]),
  IN_PROGRESS: new Set(["WAITING_FOR_USER", "WAITING_FOR_ADMIN", "RESOLVED", "CLOSED"]),
  WAITING_FOR_USER: new Set(["IN_PROGRESS", "WAITING_FOR_ADMIN", "RESOLVED", "CLOSED"]),
  WAITING_FOR_ADMIN: new Set(["IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED"]),
  RESOLVED: new Set(["IN_PROGRESS", "CLOSED"]),
  CLOSED: new Set(["OPEN"]),
};

export function canAdminTransitionSupportStatus(from: SupportTicketStatus | string, to: SupportTicketStatus | string) {
  const current = canonicalSupportStatus(from);
  const next = canonicalSupportStatus(to);
  return current === next || Boolean(adminTransitions[current]?.has(next));
}

export function statusAfterUserReply(status: SupportTicketStatus | string): SupportTicketStatus {
  if (canonicalSupportStatus(status) === "CLOSED") return "CLOSED";
  return "WAITING_FOR_ADMIN";
}

export function statusAfterAdminReply(status: SupportTicketStatus | string, internal = false): SupportTicketStatus {
  if (internal) return canonicalSupportStatus(status);
  return "WAITING_FOR_USER";
}

export function canUserReplyToSupportStatus(status: SupportTicketStatus | string) {
  return canonicalSupportStatus(status) !== "CLOSED";
}
