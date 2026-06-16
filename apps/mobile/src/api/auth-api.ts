import { apiClient } from "@/api/client";
import { getMobilePlatform } from "@/utils/device";
import type { AuthSessionPayload, MobileCompany, MobileUser } from "@/types/api";

export type MobileMePayload = {
  user: Omit<MobileUser, "role"> & { role?: string };
  company: MobileCompany;
  role: string;
  permissions: string[];
};

export function loginRequest(input: { identifier: string; password: string; deviceId: string; appVersion?: string }) {
  return apiClient.post<AuthSessionPayload>("/api/mobile/auth/login", {
    ...input,
    platform: getMobilePlatform()
  }, { auth: false });
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
  deviceId: string;
}) {
  return apiClient.post<AuthSessionPayload>("/api/mobile/auth/register", {
    name: input.fullName,
    email: input.email,
    phone: input.phone,
    password: input.password,
    passwordConfirmation: input.passwordConfirmation,
    termsAccepted: input.acceptTerms,
    privacyAccepted: input.acceptPrivacy,
    kvkkAccepted: input.acceptKvkk,
    referralCode: undefined,
    deviceId: input.deviceId,
    platform: getMobilePlatform()
  }, { auth: false });
}

export function forgotPasswordRequest(identifier: string) {
  return apiClient.post<{ message: string }>("/api/mobile/auth/forgot-password", { emailOrPhone: identifier }, { auth: false });
}

export function resetPasswordRequest(input: {
  identifier: string;
  code: string;
  password: string;
  confirmPassword: string;
}) {
  return apiClient.post<{ message: string }>("/api/mobile/auth/reset-password", input, { auth: false });
}

export function meRequest() {
  return apiClient.request<MobileMePayload>("/api/mobile/auth/me");
}

export function logoutRequest(refreshToken: string) {
  return apiClient.post<{ message: string }>("/api/mobile/auth/logout", { refreshToken });
}
