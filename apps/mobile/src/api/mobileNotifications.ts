import { apiClient } from "@/api/client";

export type MobileNotification = {
  id: string;
  tenantId?: string;
  userId?: string;
  type: string;
  title: string;
  message: string;
  payload?: Record<string, unknown> | null;
  category?: NotificationCategory;
  priority?: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  deepLink?: string | null;
  read?: boolean;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
};

export type NotificationCategory =
  | "ACCOUNT"
  | "SECURITY"
  | "SUPPORT"
  | "SUBSCRIPTION"
  | "BILLING"
  | "INVITATION"
  | "WHATSAPP"
  | "MESSAGE"
  | "SYSTEM"
  | "MARKETING"
  | "COMPLIANCE"
  | "ADMINISTRATION"
  | "BACKUP"
  | "INCIDENT";

export type MobileNotificationChannel = "IN_APP" | "EMAIL" | "ANDROID_PUSH" | "IOS_PUSH" | "WEB_PUSH";

export type MobileNotificationPreference = {
  category: NotificationCategory;
  channel: MobileNotificationChannel;
  enabled: boolean;
  mandatoryLocked: boolean;
  digestMode: "IMMEDIATE" | "DAILY" | "WEEKLY";
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
};

export type NotificationPageInfo = {
  nextCursor: string | null;
  hasMore: boolean;
};

export function getMobileNotifications(params?: { cursor?: string | null; limit?: number; unreadOnly?: boolean; type?: string }) {
  const query = new URLSearchParams();
  if (params?.cursor) query.set("cursor", params.cursor);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.unreadOnly) query.set("unreadOnly", "true");
  if (params?.type) query.set("type", params.type);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiClient.request<{ notifications: MobileNotification[]; pageInfo: NotificationPageInfo }>(`/api/mobile/notifications${suffix}`);
}

export function getMobileUnreadNotificationCount() {
  return apiClient.request<{ unreadCount: number }>("/api/mobile/notifications/unread-count");
}

export function markMobileNotificationAsRead(notificationId: string) {
  return apiClient.post<{ read: true; notificationId: string }>("/api/mobile/notifications/read", { notificationId });
}

export function markAllMobileNotificationsAsRead() {
  return apiClient.post<{ updatedCount: number }>("/api/mobile/notifications/read-all", {});
}

export function getMobileNotificationPreferences() {
  return apiClient.request<{ preferences: MobileNotificationPreference[] }>("/api/mobile/notifications/preferences");
}

export function updateMobileNotificationPreferences(preferences: MobileNotificationPreference[]) {
  return apiClient.patch<{ preferences: MobileNotificationPreference[] }>("/api/mobile/notifications/preferences", {
    preferences: preferences.map(({ category, channel, enabled, digestMode, quietHoursStart, quietHoursEnd }) => ({
      category,
      channel,
      enabled,
      digestMode,
      quietHoursStart,
      quietHoursEnd
    }))
  });
}

export function registerMobileNotificationToken(input: {
  token: string;
  deviceId: string;
  platform: "IOS" | "ANDROID" | "WEB";
  appVersion?: string;
}) {
  return apiClient.post<{ registered: true; pushDevice: { id: string; deviceId: string; platform: string; lastSeenAt: string } }>("/api/mobile/push/register", input);
}

export function unregisterMobileNotificationToken(input: { token?: string; deviceId?: string }) {
  return apiClient.delete<{ removed: true; revokedCount: number }>("/api/mobile/push/register", {
    body: JSON.stringify(input)
  });
}
