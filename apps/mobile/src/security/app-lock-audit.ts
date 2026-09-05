import { apiClient } from "@/api/client";
import { captureAppError } from "@/services/crash-reporting";

export type AppLockAuditAction =
  | "APP_LOCK_ENABLED"
  | "APP_LOCK_DISABLED"
  | "APP_LOCK_PIN_CHANGED"
  | "APP_LOCK_BIOMETRIC_UPDATED"
  | "APP_LOCK_AUTO_LOCK_UPDATED"
  | "APP_LOCK_PRIVACY_UPDATED"
  | "APP_LOCK_RECOVERY_STARTED";

type AppLockAuditDetails = {
  biometricEnabled?: boolean;
  appSwitcherPrivacyEnabled?: boolean;
  autoLockSeconds?: 0 | 60 | 300 | 900;
};

export async function recordAppLockSecurityEvent(action: AppLockAuditAction, details?: AppLockAuditDetails) {
  try {
    await apiClient.post<{ accepted: true }>(
      "/api/mobile/security/app-lock/events",
      details ? { action, details } : { action },
      { retry: false, hostFallback: false },
    );
  } catch (error) {
    captureAppError(error, { source: "app-lock-security-audit", action });
  }
}
