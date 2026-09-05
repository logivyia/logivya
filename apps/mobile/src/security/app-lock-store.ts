import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";
import { create } from "zustand";

import {
  changeStoredAppLockPin,
  clearStoredAppLock,
  createStoredAppLock,
  readStoredAppLock,
  updateStoredAppLock,
  verifyStoredAppLockPin,
  type AppLockVerification,
  type StoredAppLock,
} from "@/security/app-lock-storage";
import type { AppLockAutoLockSeconds } from "@/security/app-lock-policy";
import { captureAppError } from "@/services/crash-reporting";

type BiometricCapability = {
  available: boolean;
  label: "Face ID" | "Touch ID" | "Fingerprint" | "Biometrics";
};

type AppLockState = {
  userId: string | null;
  loading: boolean;
  locked: boolean;
  initializationFailed: boolean;
  config: StoredAppLock | null;
  biometric: BiometricCapability;
  initialize: (userId: string) => Promise<void>;
  enable: (userId: string, pin: string) => Promise<void>;
  disable: (userId: string, pin: string) => Promise<AppLockVerification>;
  changePin: (userId: string, currentPin: string, nextPin: string) => Promise<AppLockVerification>;
  updatePreferences: (userId: string, patch: Partial<Pick<StoredAppLock, "biometricEnabled" | "autoLockSeconds" | "appSwitcherPrivacyEnabled">>) => Promise<void>;
  lock: () => void;
  unlockWithPin: (pin: string) => Promise<AppLockVerification>;
  unlockWithBiometric: () => Promise<boolean>;
  resetForAccountRecovery: () => Promise<void>;
  clearRuntime: () => void;
};

async function getBiometricCapability(): Promise<BiometricCapability> {
  const [hardware, enrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const fingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  return {
    available: hardware && enrolled && (face || fingerprint),
    label: face ? "Face ID" : fingerprint ? (Platform.OS === "ios" ? "Touch ID" : "Fingerprint") : "Biometrics",
  };
}

export const useAppLockStore = create<AppLockState>((set, get) => ({
  userId: null,
  loading: false,
  locked: false,
  initializationFailed: false,
  config: null,
  biometric: { available: false, label: "Biometrics" },
  initialize: async (userId) => {
    if (!userId) return;
    set({ userId, loading: true, locked: true, initializationFailed: false, config: null });
    try {
      const [config, biometric] = await Promise.all([
        readStoredAppLock(userId),
        getBiometricCapability().catch(() => ({ available: false, label: "Biometrics" as const })),
      ]);
      if (get().userId !== userId) return;
      set({ config, biometric, locked: Boolean(config), loading: false, initializationFailed: false });
    } catch (error) {
      captureAppError(error, { source: "app-lock-initialize" });
      if (get().userId === userId) {
        set({ config: null, locked: true, loading: false, initializationFailed: true });
      }
    }
  },
  enable: async (userId, pin) => {
    const config = await createStoredAppLock(userId, pin);
    set({ userId, config, locked: false, initializationFailed: false });
  },
  disable: async (userId, pin) => {
    const verification = await verifyStoredAppLockPin(userId, pin);
    if (verification.success) {
      await clearStoredAppLock(userId);
      set({ config: null, locked: false, initializationFailed: false });
    }
    return verification;
  },
  changePin: async (userId, currentPin, nextPin) => {
    const result = await changeStoredAppLockPin(userId, currentPin, nextPin);
    if (result.success) set({ config: result.config });
    return result;
  },
  updatePreferences: async (userId, patch) => {
    const config = await updateStoredAppLock(userId, patch);
    set({ config });
  },
  lock: () => {
    if (get().config) set({ locked: true });
  },
  unlockWithPin: async (pin) => {
    const { initializationFailed, userId } = get();
    if (initializationFailed) return { success: false, reason: "NOT_CONFIGURED", blockedUntil: null };
    if (!userId) return { success: false, reason: "NOT_CONFIGURED", blockedUntil: null };
    const result = await verifyStoredAppLockPin(userId, pin);
    if (result.success) set({ config: result.config, locked: false });
    else if (result.reason === "NOT_CONFIGURED") set({ config: null, locked: false });
    return result;
  },
  unlockWithBiometric: async () => {
    const { config, biometric } = get();
    if (!config?.biometricEnabled || !biometric.available) return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Logivya kilidini açın",
      promptSubtitle: "Kimliğinizi cihazınızda doğrulayın",
      cancelLabel: "PIN kullan",
      fallbackLabel: "PIN kullan",
      disableDeviceFallback: true,
      biometricsSecurityLevel: "strong",
    });
    if (result.success) set({ locked: false });
    return result.success;
  },
  resetForAccountRecovery: async () => {
    const userId = get().userId;
    if (userId) await clearStoredAppLock(userId);
    set({ userId: null, config: null, locked: false, loading: false, initializationFailed: false });
  },
  clearRuntime: () => set({ userId: null, config: null, locked: false, loading: false, initializationFailed: false }),
}));

export type { BiometricCapability };
