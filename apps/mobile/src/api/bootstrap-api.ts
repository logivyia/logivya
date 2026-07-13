import { apiClient } from "@/api/client";

export type BootstrapPayload = {
  user: unknown;
  company: unknown;
  role: string;
  isAdmin?: boolean;
  isPlatformAdmin?: boolean;
  permissions: string[];
  subscription: unknown;
  notifications: { unreadCount: number };
  whatsapp: { connectedCount: number; totalCount: number };
  featureFlags: string[];
  minSupportedVersion: string;
};

export function bootstrapRequest() {
  return apiClient.request<BootstrapPayload>("/api/mobile/bootstrap");
}
