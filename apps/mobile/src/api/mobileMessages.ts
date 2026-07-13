import { apiClient } from "@/api/client";

export type MobileMessageCampaign = {
  id: string;
  title?: string;
  content?: string | null;
  status: string;
  scheduleType?: string;
  sentCount?: number;
  failedCount?: number;
  canceledCount?: number;
  groupCount?: number;
  contactCount?: number;
  pendingCount?: number;
  retryingCount?: number;
  totalRecipients: number;
  scheduledAt?: string | null;
  createdAt?: string;
  completedAt?: string | null;
  deleteForEveryone?: MobileDeleteForEveryoneState;
};

export type MobileDeleteForEveryoneState = {
  status: string;
  eligible: boolean;
  expiresAt: string | null;
  progress: {
    sentTargets: number;
    keyedTargets: number;
    eligibleTargets: number;
    deleted: number;
    failed: number;
    pending: number;
    processing: number;
    expired: number;
  };
};

export type MobileMessagePayload = {
  title: string;
  content: string;
  groupIds: string[];
  categoryIds: string[];
  contactIds: string[];
  scheduleType?: "SEND_NOW" | "SCHEDULED" | "RECURRING";
  scheduledAt?: string;
  scheduledTimeZone?: string;
  timeZone?: string;
  recurringRule?: {
    frequency: "DAILY" | "WEEKLY" | "MONTHLY";
    interval?: number;
  };
};

export type MobileMessageResponse = {
  campaign: MobileMessageCampaign;
  correlationId: string;
};

export function sendMobileMessage(payload: MobileMessagePayload) {
  return apiClient.post<MobileMessageResponse>("/api/mobile/messages/send", payload);
}

export function scheduleMobileMessage(payload: MobileMessagePayload & { scheduledAt: string }) {
  return apiClient.post<MobileMessageResponse>("/api/mobile/messages/schedule", payload);
}

export function createRecurringMobileMessage(payload: MobileMessagePayload & { recurringRule: NonNullable<MobileMessagePayload["recurringRule"]> }) {
  return apiClient.post<MobileMessageResponse>("/api/mobile/messages/send", { ...payload, scheduleType: "RECURRING" });
}

export function getMobileMessageHistory(params?: { cursor?: string; limit?: number }) {
  const search = new URLSearchParams();
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.limit) search.set("limit", String(params.limit));
  const query = search.toString();
  return apiClient.request<{ campaigns: MobileMessageCampaign[]; pageInfo: { nextCursor: string | null; hasMore: boolean } }>(
    `/api/mobile/messages/history${query ? `?${query}` : ""}`
  );
}

export function deleteMobileMessageForMe(campaignId: string) {
  return apiClient.post<{ ok: true }>(`/api/mobile/messages/history/${campaignId}/delete-for-me`, {});
}

export function deleteMobileMessageForEveryone(campaignId: string) {
  return apiClient.post<{ message: string; queued: number; expired: number; failed: number; correlationId: string }>(
    `/api/mobile/messages/history/${campaignId}/delete-for-everyone`,
    {}
  );
}

export function platformDeleteMobileMessage(campaignId: string) {
  return apiClient.post<{ ok: true }>(`/api/mobile/messages/history/${campaignId}/platform-delete`, {});
}
