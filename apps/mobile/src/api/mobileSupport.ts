import { apiClient } from "@/api/client";

export type MobileSupportMessage = {
  id: string;
  senderType: string;
  message: string;
  attachmentUrl: string | null;
  createdAt: string;
};

export type MobileSupportTicket = {
  id: string;
  subject: string;
  type: string;
  status: string;
  priority?: string;
  createdAt: string;
  lastMessageAt?: string | null;
  messages?: MobileSupportMessage[];
};

export type MobileTicketListItem = MobileSupportTicket & {
  messages: Array<Pick<MobileSupportMessage, "message" | "senderType" | "createdAt">>;
};

export function getMobileSupportTickets(params?: { cursor?: string; limit?: number }) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.limit) search.set("limit", String(params.limit));
  const query = search.toString();
  return apiClient.request<{ tickets: MobileTicketListItem[]; pageInfo: { nextCursor: string | null; hasMore: boolean } }>(
    `/api/mobile/support/tickets${query ? `?${query}` : ""}`
  );
}

export function createMobileSupportTicket(input: { subject: string; type: string; message: string }) {
  return apiClient.post<{ ticket: MobileSupportTicket }>("/api/mobile/support/tickets", input);
}

export function getMobileSupportTicket(id: string) {
  return apiClient.request<{ ticket: MobileSupportTicket }>(`/api/mobile/support/tickets/${id}`);
}

export function replyMobileSupportTicket(id: string, message: string) {
  return apiClient.post<{ message: MobileSupportMessage }>(`/api/mobile/support/tickets/${id}/messages`, { message });
}
