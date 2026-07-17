import { apiClient } from "@/api/client";

export type NotificationAdminTab =
  | "dashboard"
  | "events"
  | "deliveries"
  | "deadLetters"
  | "templates"
  | "announcements"
  | "providers";

export type AdminNotificationEvent = {
  id: string;
  type: string;
  category: string;
  status: string;
  occurredAt: string;
  company?: { name: string } | null;
  actor?: { email: string } | null;
  _count: { notifications: number; deliveries: number; outbox: number; deadLetters: number };
};

export type AdminNotificationDelivery = {
  id: string;
  channel: string;
  status: string;
  attemptCount: number;
  provider?: string | null;
  errorCode?: string | null;
  createdAt: string;
  event: { type: string; category: string; correlationId?: string | null };
  company?: { name: string } | null;
  user?: { email: string } | null;
};

export type AdminNotificationDeadLetter = {
  id: string;
  channel: string;
  errorCode: string;
  attemptCount: number;
  deadLetteredAt: string;
  resolvedAt?: string | null;
  event: { type: string; category: string; correlationId?: string | null };
};

export type AdminNotificationTemplate = {
  id: string;
  eventType: string;
  channel: string;
  locale: string;
  name: string;
  status: string;
  version: number;
  isActive: boolean;
  updatedAt: string;
};

export type AdminNotificationAnnouncement = {
  id: string;
  title: string;
  body: string;
  audience: string;
  locale: string;
  channels: string[];
  priority: string;
  status: string;
  approvalState: string;
  startsAt: string;
  endsAt?: string | null;
  createdAt: string;
  createdBy?: { email: string } | null;
};

export type AdminNotificationProviderResponse = {
  providers: Record<string, Record<string, unknown>>;
  recentWebhooks: number;
};

export type AnnouncementDraftInput = {
  title: string;
  body: string;
  audience: "PLATFORM_ALL_USERS" | "COMPANY_USERS";
  locale: string;
  channels: Array<"IN_APP" | "EMAIL" | "ANDROID_PUSH" | "WEB_PUSH">;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  deepLink?: string;
  startsAt?: string;
  endsAt?: string;
};

export function getAdminNotificationEvents() {
  return apiClient.requestRaw<{ events: AdminNotificationEvent[] }>("/api/admin/notifications/events?limit=50");
}

export function getAdminNotificationDeliveries(status?: string) {
  const query = status && status !== "ALL" ? `?limit=50&status=${encodeURIComponent(status)}` : "?limit=50";
  return apiClient.requestRaw<{ deliveries: AdminNotificationDelivery[] }>(`/api/admin/notifications/deliveries${query}`);
}

export function getAdminNotificationDeadLetters() {
  return apiClient.requestRaw<{ deadLetters: AdminNotificationDeadLetter[] }>("/api/admin/notifications/dead-letters?limit=50");
}

export function retryAdminNotificationDeadLetter(id: string, resolution: string) {
  return apiClient.requestRaw<{ ok: true }>(`/api/admin/notifications/dead-letters/${id}/retry`, {
    method: "POST",
    body: JSON.stringify({ resolution })
  });
}

export function getAdminNotificationTemplates() {
  return apiClient.requestRaw<{ templates: AdminNotificationTemplate[] }>("/api/admin/notification-templates");
}

export function testAdminNotificationTemplate(id: string) {
  return apiClient.requestRaw<{ ok: true }>(`/api/admin/notification-templates/${id}/test`, {
    method: "POST",
    body: JSON.stringify({ variables: {} })
  });
}

export function getAdminNotificationAnnouncements() {
  return apiClient.requestRaw<{ announcements: AdminNotificationAnnouncement[] }>("/api/admin/announcements");
}

export function createAdminNotificationAnnouncement(input: AnnouncementDraftInput) {
  return apiClient.requestRaw<{ announcement: AdminNotificationAnnouncement }>("/api/admin/announcements", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function previewAdminNotificationAnnouncement(id: string) {
  return apiClient.requestRaw<{
    preview: { recipientCount: number; channels: string[]; locale: string; scheduledAt: string };
    previewHash: string;
    unchanged: boolean;
    requiresSecondConfirmation: boolean;
  }>(`/api/admin/announcements/${id}/preview`);
}

export function publishAdminNotificationAnnouncement(
  id: string,
  input: { previewHash: string; confirmation: string; secondConfirmation?: string }
) {
  return apiClient.requestRaw<{ ok: true; recipientCount: number; status: string }>(`/api/admin/announcements/${id}/publish`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function cancelAdminNotificationAnnouncement(id: string, reason: string) {
  return apiClient.requestRaw<{ ok: true }>(`/api/admin/announcements/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
}

export function getAdminNotificationProviders() {
  return apiClient.requestRaw<AdminNotificationProviderResponse>("/api/admin/notifications/providers");
}
