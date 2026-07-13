import { apiClient } from "@/api/client";

export type MobileSupportMessage = {
  id: string;
  senderType: string;
  message: string;
  body?: string;
  clientMessageId?: string | null;
  attachmentUrl: string | null;
  isInternal?: boolean;
  createdAt: string;
};

export type MobileSupportPerson = {
  id: string;
  name: string | null;
  email: string;
};

export type MobileSupportCompany = {
  id: string;
  name: string;
};

export type MobileSupportTicket = {
  id: string;
  publicId: string;
  tenantId?: string;
  userId?: string;
  title?: string;
  description?: string;
  category?: string;
  subject: string;
  type: string;
  source?: string;
  status: string;
  priority?: string;
  createdAt: string;
  updatedAt?: string;
  lastMessageAt?: string | null;
  userUnreadCount?: number;
  adminUnreadCount?: number;
  unreadReplyCount?: number;
  company?: MobileSupportCompany;
  createdBy?: MobileSupportPerson;
  messages?: MobileSupportMessage[];
};

export type MobileTicketListItem = MobileSupportTicket & {
  messages: Array<Pick<MobileSupportMessage, "message" | "senderType" | "createdAt">>;
};

export function getMobileSupportTickets(params?: { cursor?: string; limit?: number; status?: string; category?: string; search?: string }) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.status) search.set("status", params.status);
  if (params?.category) search.set("category", params.category);
  if (params?.search) search.set("search", params.search);
  const query = search.toString();
  return apiClient.request<{ tickets: MobileTicketListItem[]; pageInfo: { nextCursor: string | null; hasMore: boolean } }>(
    `/api/mobile/support/tickets${query ? `?${query}` : ""}`
  );
}

export function createMobileSupportTicket(input: {
  subject: string;
  category: string;
  message: string;
  clientMessageId: string;
  clientRequestId: string;
}) {
  return apiClient.post<{ ticket: MobileSupportTicket }>("/api/mobile/support/tickets", input);
}

export function getMobileSupportTicket(id: string, params?: { cursor?: string; limit?: number }) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.limit) search.set("limit", String(params.limit));
  const query = search.toString();
  return apiClient.request<{
    ticket: MobileSupportTicket;
    messages: MobileSupportMessage[];
    pageInfo: { nextCursor: string | null; hasMore: boolean };
  }>(`/api/mobile/support/tickets/${id}${query ? `?${query}` : ""}`);
}

export function replyMobileSupportTicket(id: string, input: { message: string; clientMessageId: string }) {
  return apiClient.post<{ message: MobileSupportMessage; ticket: Pick<MobileSupportTicket, "id" | "status" | "lastMessageAt"> }>(
    `/api/mobile/support/tickets/${id}/messages`,
    input
  );
}

export function createSupportOperationId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
