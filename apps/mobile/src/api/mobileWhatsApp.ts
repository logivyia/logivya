import { apiClient } from "@/api/client";

export type MobileWhatsAppStatus =
  | "CONNECTED"
  | "DISCONNECTED"
  | "FAILED"
  | "PENDING_QR"
  | "PENDING_PHONE_CODE"
  | "CONNECTING"
  | "ARCHIVED"
  | "UNKNOWN"
  | string;

export type MobileWhatsAppAccount = {
  id: string;
  label: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  status: MobileWhatsAppStatus;
  qrCode?: string | null;
  qrExpiresAt?: string | null;
  pairingCode?: string | null;
  pairingCodeExpiresAt?: string | null;
  groupCount: number;
  contactCount: number;
  healthScore: number;
  healthLabel?: "healthy" | "attention" | "risk" | "critical" | string;
  recoveryLevel?: number;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastSyncedAt: string | null;
  lastHeartbeatAt?: string | null;
  lastPingAt?: string | null;
  lastPongAt?: string | null;
  lastMessageAt?: string | null;
  lastGroupSyncAt?: string | null;
  sessionRestoredAt?: string | null;
  sessionSnapshotAt?: string | null;
  archivedAt: string | null;
  lastError: string | null;
};

export type MobileWhatsAppUnifiedStatus = {
  connectedCount: number;
  reconnectingCount: number;
  healthyCount: number;
  totalGroupCount: number;
  accounts: MobileWhatsAppAccount[];
};

export function getMobileWhatsAppAccounts() {
  return apiClient.request<{ accounts: MobileWhatsAppAccount[] }>("/api/mobile/whatsapp/accounts");
}

export function getMobileWhatsAppStatus() {
  return apiClient.request<{ status: MobileWhatsAppUnifiedStatus }>("/api/mobile/whatsapp/status");
}

export function createMobileWhatsAppQrSession() {
  return apiClient.post<{ account: MobileWhatsAppAccount }>("/api/mobile/whatsapp/accounts/qr", {});
}

export function createMobileWhatsAppPhoneCode(phoneNumber: string) {
  return apiClient.post<{ account: MobileWhatsAppAccount }>("/api/mobile/whatsapp/accounts/phone-code", { phoneNumber });
}

export function getMobileWhatsAppAccountStatus(id: string) {
  return apiClient.request<{ account: MobileWhatsAppAccount }>(`/api/mobile/whatsapp/accounts/${id}/status`, { retry: false });
}

export function reconnectMobileWhatsAppAccount(id: string) {
  return apiClient.post<{ account: MobileWhatsAppAccount }>(`/api/mobile/whatsapp/accounts/${id}/reconnect`, {});
}

export function archiveMobileWhatsAppAccount(id: string) {
  return apiClient.post<{ account: MobileWhatsAppAccount }>(`/api/mobile/whatsapp/accounts/${id}/archive`, {});
}

export function deleteMobileWhatsAppAccount(id: string) {
  return apiClient.request<{ message: string }>(`/api/mobile/whatsapp/accounts/${id}`, { method: "DELETE" });
}
