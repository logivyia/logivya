import { apiClient } from "@/api/client";
import { config } from "@/constants/config";
import { getMobilePlatform } from "@/utils/device";
import type { AuthSessionPayload, AuthTokens, LoginResponsePayload, MobileCompany, MobileUser } from "@/types/api";

export type MobileMePayload = {
  user: Omit<MobileUser, "role"> & { role?: string };
  company: MobileCompany;
  role: string;
  isAdmin?: boolean;
  isPlatformAdmin?: boolean;
  permissions: string[];
};

function normalizeIdentifier(identifier: string) {
  return identifier.trim().toLowerCase();
}

export function loginRequest(input: { identifier: string; password: string; deviceId: string; appVersion?: string; trustedDeviceToken?: string }) {
  return apiClient.post<LoginResponsePayload>("/api/mobile/auth/login", {
    ...input,
    identifier: normalizeIdentifier(input.identifier),
    platform: getMobilePlatform(),
    appVersion: input.appVersion ?? config.appVersion,
  }, { auth: false, retry: false, hostFallback: false });
}

export function verifyMfaLoginRequest(input: {
  challengeToken: string;
  code: string;
  rememberDevice: boolean;
  deviceId: string;
  deviceName?: string;
  appVersion?: string;
  setupToken?: string;
}) {
  return apiClient.post<AuthSessionPayload>("/api/mobile/auth/mfa/verify", {
    ...input,
    platform: getMobilePlatform(),
    appVersion: input.appVersion ?? config.appVersion,
  }, { auth: false, retry: false, hostFallback: false });
}

export function acceptInvitationRequest(invitationToken: string) {
  return apiClient.post<{ status: "ACCEPTED"; companyId: string; role: string; tokens: AuthTokens }>(
    `/api/mobile/company/invitations/${encodeURIComponent(invitationToken)}/accept`,
    { action: "ACCEPT" },
  );
}

export function acceptInvitationCodeRequest(invitationCode: string) {
  return apiClient.post<{ status: "ACCEPTED"; companyId: string; role: string; tokens: AuthTokens }>(
    "/api/mobile/company/invitations/code/accept",
    { code: invitationCode.trim() },
  );
}

export function registerRequest(input: {
  fullName: string;
  email: string;
  phone?: string;
  companyName?: string;
  password: string;
  passwordConfirmation: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  acceptKvkk: boolean;
  marketingConsent?: boolean;
  invitationToken?: string;
  invitationCode?: string;
  deviceId: string;
}) {
  return apiClient.post<AuthSessionPayload>("/api/mobile/auth/register", {
    name: input.fullName,
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim(),
    password: input.password,
    passwordConfirmation: input.passwordConfirmation,
    termsAccepted: input.acceptTerms,
    privacyAccepted: input.acceptPrivacy,
    kvkkAccepted: input.acceptKvkk,
    referralCode: undefined,
    invitationToken: input.invitationToken,
    invitationCode: input.invitationCode,
    deviceId: input.deviceId,
    platform: getMobilePlatform()
  }, { auth: false });
}

export function forgotPasswordRequest(identifier: string) {
  return apiClient.post<{ message: string }>("/api/mobile/auth/forgot-password", { identifier: normalizeIdentifier(identifier) }, { auth: false });
}

export function resetPasswordRequest(input: {
  identifier: string;
  code: string;
  password: string;
  confirmPassword: string;
}) {
  return apiClient.post<{ message: string }>("/api/mobile/auth/reset-password", {
    identifier: normalizeIdentifier(input.identifier),
    code: input.code.trim(),
    password: input.password,
    passwordConfirmation: input.confirmPassword
  }, { auth: false });
}

export function meRequest() {
  return apiClient.request<MobileMePayload>("/api/mobile/auth/me");
}

export function logoutRequest(refreshToken: string) {
  return apiClient.post<{ message: string }>("/api/mobile/auth/logout", { refreshToken });
}
