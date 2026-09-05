import { apiClient } from "@/api/client";
import type { MobileMessageAttachment } from "@/api/mobileMedia";

export type TelegramAuthState = "STARTING" | "WAIT_PHONE_NUMBER" | "WAIT_EMAIL_ADDRESS" | "WAIT_EMAIL_CODE" | "WAIT_CODE" | "WAIT_PASSWORD" | "WAIT_OTHER_DEVICE" | "READY" | "LOGGING_OUT" | "CLOSED" | "ERROR";

export type MobileTelegramAccount = {
  id: string;
  label: string;
  accountType: "USER" | "BOT";
  phoneNumberMasked: string | null;
  telegramUserId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string;
  authState: TelegramAuthState;
  authStateDetail: { passwordHint?: string; emailPattern?: string; timeoutSeconds?: number } | null;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastSyncedAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MobileTelegramChat = {
  id: string;
  accountId: string;
  title: string;
  username: string | null;
  type: "PRIVATE" | "BASIC_GROUP" | "SUPERGROUP" | "CHANNEL" | "SECRET" | "UNKNOWN";
  participantCount: number;
  canSend: boolean;
  freightPublicationEnabled: boolean;
  isActive: boolean;
  isArchived: boolean;
  rawPermissions?: { canSendPhotos?: boolean; canSendVideos?: boolean; canSendDocuments?: boolean } | null;
  lastSyncedAt: string;
  categoryAssignments: Array<{ category: { id: string; name: string; color: string } }>;
};

export type MobileTelegramHistoryItem = {
  id: string;
  title: string | null;
  content: string;
  contentJson?: { attachment?: MobileMessageAttachment; attachments?: MobileMessageAttachment[] } | null;
  scheduleType: "SEND_NOW" | "SCHEDULED" | "RECURRING";
  scheduledAt: string | null;
  timezone: string;
  nextRunAt: string;
  status: string;
  deleteRequestedAt: string | null;
  deletedForEveryoneAt: string | null;
  deleteTotalCount: number;
  deleteSuccessCount: number;
  deleteFailedCount: number;
  createdAt: string;
  account: { id: string; label: string; username: string | null };
  targets: Array<{ chat: { id: string; title: string; type: string } }>;
  runs: Array<{
    id: string;
    status: string;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    floodWaitCount: number;
    scheduledFor: string;
    deliveries: Array<{ id: string; chatId: string; status: string; attemptCount: number; errorCode: string | null; sentAt: string | null }>;
  }>;
};

export function getTelegramAccess() {
  return apiClient.request<{ enabled: boolean; audience: "public" | "internal" | null }>("/api/mobile/telegram/access", { retry: false });
}

export function getTelegramAccounts() {
  return apiClient.request<{ accounts: MobileTelegramAccount[] }>("/api/mobile/telegram/accounts", { retry: false });
}

export function createTelegramAccount(label?: string) {
  return apiClient.post<{ account: MobileTelegramAccount }>("/api/mobile/telegram/accounts", label ? { label } : {});
}

export function submitTelegramAuth(accountId: string, step: "phone" | "code" | "password" | "email" | "email_code", value: string) {
  return apiClient.post<{ authState: TelegramAuthState; status: string; detail?: Record<string, unknown> }>(`/api/mobile/telegram/accounts/${accountId}/auth`, { step, value }, { retry: false });
}

export function syncTelegramChats(accountId: string) {
  return apiClient.post<{ synced: number; sendable: number }>(`/api/mobile/telegram/accounts/${accountId}/sync`, {}, { retry: false });
}

export function archiveTelegramAccount(accountId: string) {
  return apiClient.post<{ archived: true }>(`/api/mobile/telegram/accounts/${accountId}/archive`, {}, { retry: false });
}

export function getTelegramChats(accountId?: string) {
  const suffix = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
  return apiClient.request<{ chats: MobileTelegramChat[] }>(`/api/mobile/telegram/chats${suffix}`, { retry: false });
}

export function setTelegramFreightPublication(chatId: string, enabled: boolean) {
  return apiClient.request<{ id: string; freightPublicationEnabled: boolean }>(`/api/mobile/telegram/chats/${encodeURIComponent(chatId)}/publication`, {
    method: "PATCH", body: JSON.stringify({ enabled }), retry: false,
  });
}

export function assignTelegramCategoryChats(categoryId: string, chatIds: string[]) {
  return apiClient.request<{ categoryId: string; chatIds: string[] }>(`/api/mobile/telegram/categories/${categoryId}/chats`, {
    method: "PUT",
    body: JSON.stringify({ chatIds }),
    retry: false,
  });
}

export function createTelegramDispatch(payload: {
  accountId: string;
  clientRequestId: string;
  title?: string;
  content: string;
  mediaFileId?: string;
  mediaFileIds?: string[];
  chatIds: string[];
  scheduleType: "SEND_NOW" | "SCHEDULED" | "RECURRING";
  scheduledAt?: string;
  recurringRule?: { frequency: "DAILY" | "WEEKLY" | "MONTHLY"; interval: number; endsAt?: string };
}) {
  return apiClient.post<{ dispatch: { id: string }; duplicate: boolean }>("/api/mobile/telegram/dispatches", payload);
}

export function getTelegramHistory() {
  return apiClient.request<{ items: MobileTelegramHistoryItem[]; nextCursor: string | null }>("/api/mobile/telegram/dispatches?take=50", { retry: false });
}

export function cancelTelegramDispatch(id: string) {
  return apiClient.post<{ canceled: true }>(`/api/mobile/telegram/dispatches/${id}/cancel`, {}, { retry: false });
}

export function deleteTelegramDispatchForEveryone(id: string) {
  return apiClient.post<{
    requestedAt: string;
    completedAt: string | null;
    total: number;
    deleted: number;
    failed: number;
    pending: number;
    alreadyDeleted: number;
    canRetry: boolean;
  }>(`/api/mobile/telegram/dispatches/${id}/delete-for-everyone`, {}, { retry: false });
}
