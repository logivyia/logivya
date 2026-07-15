import { apiClient } from "@/api/client";

export type MfaStatus = {
  enabled: boolean;
  required: boolean;
  enabledAt?: string | null;
  recoveryCodesRemaining: number;
  trustedDevices: Array<{ id: string; deviceName?: string | null; ipAddress: string; trustedAt: string; lastUsedAt?: string | null; expiresAt: string }>;
  recentEvents: Array<{ id: string; type: string; severity: string; message: string; ipAddress?: string | null; createdAt: string }>;
};

export type MfaEnrollment = {
  credentialId: string;
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  recoveryCodes: string[];
};

export function getMfaStatus() {
  return apiClient.request<MfaStatus>("/api/mobile/auth/mfa/status");
}

export function startMfaEnrollment() {
  return apiClient.post<MfaEnrollment>("/api/mobile/auth/mfa/enroll", {});
}

export function confirmMfaEnrollment(code: string) {
  return apiClient.post<{ ok: true }>("/api/mobile/auth/mfa/confirm", { code });
}

export function disableMfa(password: string, code: string) {
  return apiClient.post<{ ok: true; signedOut: true }>("/api/mobile/auth/mfa/disable", { password, code });
}

export function regenerateMfaRecoveryCodes(code: string) {
  return apiClient.post<{ recoveryCodes: string[] }>("/api/mobile/auth/mfa/recovery-codes", { code });
}

export function revokeMfaTrustedDevice(id: string) {
  return apiClient.delete<{ ok: true }>(`/api/mobile/auth/mfa/trusted-devices/${encodeURIComponent(id)}`);
}
