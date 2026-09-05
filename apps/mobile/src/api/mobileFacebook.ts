import { apiClient } from "@/api/client";
import type { LocalMessageAttachment, MobileMessageAttachment } from "@/api/mobileMedia";

export type MobileFacebookPage = {
  id: string;
  pageId: string | null;
  name: string;
  username: string | null;
  category: string | null;
  pictureUrl: string | null;
  status: string;
  tasks: string[];
  canPublish: boolean;
  lastSyncedAt: string | null;
};

export type MobileFacebookPost = {
  id: string;
  pageName: string;
  content: string | null;
  status: "PENDING" | "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "CANCELED";
  externalMessageId: string | null;
  scheduledAt: string | null;
  attachmentCount: number;
  createdAt: string;
  sentAt: string | null;
  errorMessage: string | null;
  canDelete: boolean;
  attemptCount: number;
  maxAttempts: number;
  lastErrorCode: string | null;
  nextAttemptAt: string | null;
};

export function getFacebookPagesAccess() {
  return apiClient.request<{ enabled: boolean; configured: boolean }>("/api/mobile/facebook/access", { retry: false });
}

export function startFacebookPagesOAuth() {
  return apiClient.post<{ authorizationUrl: string }>("/api/mobile/facebook/oauth/start", {}, { retry: false });
}

export function getFacebookPages() {
  return apiClient.request<{ accounts: MobileFacebookPage[] }>("/api/mobile/facebook/accounts", { retry: false });
}

export function syncFacebookPages() {
  return apiClient.post<{ connectedPages: number }>("/api/mobile/facebook/accounts/sync", {}, { retry: false });
}

export function disconnectFacebookPage(accountId: string) {
  return apiClient.post<{ disconnected: true }>(`/api/mobile/facebook/accounts/${accountId}/disconnect`, {}, { retry: false });
}

export function connectDiscoveredFacebookPage(accountId: string) {
  return apiClient.post<{ connected: true; accountId: string }>(`/api/mobile/facebook/accounts/${accountId}/connect`, {}, { retry: false });
}

export function getFacebookPostHistory() {
  return apiClient.request<{ items: MobileFacebookPost[] }>("/api/mobile/facebook/posts?take=50", { retry: false });
}

export function createFacebookPost(input: {
  pageAccountIds: string[];
  message: string;
  link?: string;
  mediaFileIds?: string[];
  scheduledAt?: string;
}) {
  return apiClient.post<{ post: { id: string; status: string }; posts: Array<{ id: string; status: string }>; queued: true }>("/api/mobile/facebook/posts", input, { retry: false });
}

export function deleteFacebookPost(messageId: string) {
  return apiClient.delete<{ deleted: true }>(`/api/mobile/facebook/posts/${messageId}`, { retry: false });
}

export function uploadFacebookMedia(file: LocalMessageAttachment) {
  return apiClient.uploadFile<{ attachment: MobileMessageAttachment; checksum: string }>(
    "/api/mobile/facebook/media",
    file.uri,
    {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.size),
      "X-File-Name": encodeURIComponent(file.fileName),
      "X-File-Size": String(file.size),
    },
  );
}
