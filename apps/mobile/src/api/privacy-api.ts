import { apiClient } from "@/api/client";

export type MobilePrivacyPurpose = { code: string; required: boolean; currentStatus: string };
export type MobilePrivacyRequest = { publicId: string; type: string; status: string; requestedAt: string };
export type MobilePrivacyExport = { publicId: string; status: string; expiresAt?: string | null; createdAt: string };
export type MobilePrivacyOverview = { purposes: MobilePrivacyPurpose[]; requests: MobilePrivacyRequest[]; exports: MobilePrivacyExport[] };

export function getPrivacyOverview() {
  return apiClient.requestRaw<MobilePrivacyOverview>("/api/privacy/overview");
}

export function updatePrivacyPurpose(purpose: string, enabled: boolean, locale: string) {
  return apiClient.requestRaw<{ consent: { status: string } }>(`/api/privacy/consents/${purpose}`, { method: "PATCH", body: JSON.stringify({ enabled, locale }) });
}

export function requestPrivacyExport(password: string) {
  return apiClient.requestRaw<{ job: MobilePrivacyExport; oneTimeDownloadToken: string }>("/api/privacy/export", { method: "POST", body: JSON.stringify({ password }) });
}

export function submitPrivacyRequest(input: { type: string; description: string; password: string }) {
  return apiClient.requestRaw<{ request: MobilePrivacyRequest }>("/api/privacy/requests", { method: "POST", body: JSON.stringify(input) });
}

export function requestAccountDeletion(input: { scope: "USER" | "COMPANY"; confirmation: string; password: string }) {
  return apiClient.requestRaw<{ job: { publicId: string; scope: string; status: string; cancelUntil: string } }>("/api/privacy/account-deletion", { method: "POST", body: JSON.stringify(input) });
}

export function getAccountDeletionRequests() {
  return apiClient.requestRaw<{ jobs: Array<{ publicId: string; scope: string; status: string; cancelUntil: string }> }>("/api/privacy/account-deletion");
}

export function cancelAccountDeletion(publicId: string, password: string) {
  return apiClient.requestRaw<{ job: { publicId: string; status: string } }>("/api/privacy/account-deletion", { method: "PATCH", body: JSON.stringify({ publicId, password }) });
}

export function downloadPrivacyExport(publicId: string, token: string) {
  return apiClient.download(`/api/privacy/export/${publicId}/download`, { "x-privacy-download-token": token });
}
