import { apiClient } from "@/api/client";
import { normalizeMfaStatus } from "@/api/mobile-response-normalizers";

export type MfaMethodType = "TOTP" | "EMAIL_OTP";
export type MfaPolicy =
  "NONE" | "REQUIRE_ANY_MFA" | "REQUIRE_TOTP" | "REQUIRE_TOTP_FOR_ADMINS";

export type MfaStatus = {
  enabled: boolean;
  enabledAt?: string | null;
  setupInProgress: boolean;
  setupExpiresAt?: string | null;
  verifiedEmail: string;
  preferredMethod?: MfaMethodType | null;
  methods: Array<{
    type: MfaMethodType;
    status:
      "PENDING" | "ENABLED" | "DISABLED" | "LOCKED" | "REQUIRES_REVERIFICATION";
    enabled: boolean;
    preferred: boolean;
    enabledAt?: string | null;
  }>;
};

export type MfaEnrollment = {
  credentialId: string;
  setupToken: string;
  expiresAt: string;
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
};

export type EmailMfaEnrollment = {
  setupToken: string;
  emailMasked: string;
  expiresAt: string;
};

export type SecuritySession = {
  id: string;
  kind: "WEB" | "MOBILE";
  deviceName: string;
  ipAddress?: string | null;
  lastActiveAt: string;
  expiresAt: string;
  createdAt: string;
  current: boolean;
};

export async function getMfaStatus() {
  const payload = await apiClient.request<unknown>(
    "/api/mobile/auth/mfa/status",
  );
  return normalizeMfaStatus(payload);
}

export function startMfaEnrollment(password: string, currentCode?: string) {
  return apiClient.post<MfaEnrollment>("/api/mobile/auth/mfa/enroll", {
    password,
    currentCode: currentCode || undefined,
  });
}

export function confirmMfaEnrollment(setupToken: string, code: string) {
  return apiClient.post<{ ok: true; recoveryCodes: string[] }>(
    "/api/mobile/auth/mfa/confirm",
    { setupToken, code },
  );
}

export function startEmailMfaEnrollment(
  password: string,
  currentCode?: string,
) {
  return apiClient.post<EmailMfaEnrollment>(
    "/api/mobile/auth/mfa/email/enroll",
    { password, currentCode: currentCode || undefined },
  );
}

export function confirmEmailMfaEnrollment(setupToken: string, code: string) {
  return apiClient.post<{ ok: true }>("/api/mobile/auth/mfa/email/confirm", {
    setupToken,
    code,
  });
}

export function startEmailMfaStepUp() {
  return apiClient.post<{
    challengeToken: string;
    emailMasked: string;
    expiresAt: string;
  }>("/api/mobile/auth/mfa/step-up/email/send", {});
}

export function cancelMfaEnrollment(setupToken?: string) {
  return apiClient.post<{ ok: true }>("/api/mobile/auth/mfa/cancel", {
    setupToken,
  });
}

export function disableMfa(
  method: MfaMethodType,
  password: string,
  code: string,
  stepUpToken?: string,
  verificationMethod?: MfaMethodType,
) {
  return apiClient.post<{
    ok: true;
    signedOut: false;
    preferredMethod?: MfaMethodType | null;
  }>("/api/mobile/auth/mfa/disable", {
    method,
    password,
    code,
    stepUpToken: stepUpToken || undefined,
    verificationMethod,
  });
}

export function setPreferredMfaMethod(
  method: MfaMethodType,
  password: string,
  currentCode: string,
) {
  return apiClient.post<{ ok: true; preferredMethod: MfaMethodType }>(
    "/api/mobile/auth/mfa/preferred",
    { method, password, currentCode },
  );
}

export function updateCompanyMfaPolicy(
  policy: MfaPolicy,
  password: string,
  currentCode?: string,
) {
  return apiClient.patch<{ ok: true; policy: MfaPolicy }>(
    "/api/mobile/company/security-policy",
    { policy, password, currentCode: currentCode || undefined },
  );
}

export function regenerateMfaRecoveryCodes(password: string, code: string) {
  return apiClient.post<{ recoveryCodes: string[] }>(
    "/api/mobile/auth/mfa/recovery-codes",
    { password, code },
  );
}

export function revokeMfaTrustedDevice(id: string) {
  return apiClient.delete<{ ok: true }>(
    `/api/mobile/auth/mfa/trusted-devices/${encodeURIComponent(id)}`,
  );
}

export function getSecuritySessions() {
  return apiClient.request<{ sessions: SecuritySession[] }>(
    "/api/mobile/auth/sessions",
  );
}

export function revokeSecuritySession(session: SecuritySession) {
  return apiClient.delete<{ ok: true; currentRevoked: boolean }>(
    `/api/mobile/auth/sessions/${session.kind}/${encodeURIComponent(session.id)}`,
  );
}

export function logoutEverywhere() {
  return apiClient.delete<{ ok: true }>("/api/mobile/auth/sessions");
}
