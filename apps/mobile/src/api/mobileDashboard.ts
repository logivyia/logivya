import { apiClient } from "@/api/client";
import type { MobileSubscription } from "@/api/mobileSubscription";

export type DashboardWhatsAppAccount = {
  id: string;
  label: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  status: string;
  groupCount: number;
  contactCount: number;
  lastSyncedAt: string | null;
};

export type MobileBootstrap = {
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    locale?: string | null;
    timezone?: string | null;
    isAdmin?: boolean;
    isPlatformAdmin?: boolean;
  };
  company: {
    id: string;
    name: string;
    defaultLanguage?: string | null;
    defaultTimezone?: string | null;
    defaultCurrency?: string | null;
  };
  role: string;
  isAdmin?: boolean;
  isPlatformAdmin?: boolean;
  permissions: string[];
  subscription: MobileSubscription;
  trial: { isTrial: boolean; remainingDays: number };
  unreadNotificationsCount: number;
  whatsapp: {
    connectedCount: number;
    accounts: DashboardWhatsAppAccount[];
  };
  featureFlags: Array<{ key: string; description?: string | null }>;
  app: { minimumSupportedVersion: string };
};

export type MessageCampaignSummary = {
  id: string;
  title: string;
  status: string;
  sentCount: number;
  failedCount: number;
  createdAt: string;
};

export function getMobileBootstrap() {
  return apiClient.request<MobileBootstrap>("/api/mobile/bootstrap");
}

export function getMobileMessageHistory(limit = 50) {
  return apiClient.request<{ campaigns: MessageCampaignSummary[]; pageInfo: { nextCursor: string | null; hasMore: boolean } }>(
    `/api/mobile/messages/history?limit=${limit}`
  );
}
