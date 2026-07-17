import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { detectDeviceLocale, normalizeLocale, type Locale } from "@/i18n/config";

type ThemePreference = "light" | "dark" | "system";

type SettingsState = {
  theme: ThemePreference;
  locale: Locale;
  biometricEnabled: boolean;
  notificationsEnabled: boolean;
  analyticsEnabled: boolean;
  diagnosticsEnabled: boolean;
  setTheme: (theme: ThemePreference) => void;
  setLocale: (locale: Locale) => void;
  applyAccountLocale: (locale: string | null | undefined) => void;
  setBiometricEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setAnalyticsEnabled: (enabled: boolean) => void;
  setDiagnosticsEnabled: (enabled: boolean) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      locale: detectDeviceLocale(),
      biometricEnabled: false,
      notificationsEnabled: true,
      analyticsEnabled: false,
      diagnosticsEnabled: false,
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
      applyAccountLocale: (value) => {
        const locale = normalizeLocale(value);
        if (locale) set({ locale });
      },
      setBiometricEnabled: (biometricEnabled) => set({ biometricEnabled }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setAnalyticsEnabled: (analyticsEnabled) => set({ analyticsEnabled }),
      setDiagnosticsEnabled: (diagnosticsEnabled) => set({ diagnosticsEnabled }),
    }),
    {
      name: "logivya.mobile.settings.v2",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        theme: state.theme,
        locale: state.locale,
        biometricEnabled: state.biometricEnabled,
        notificationsEnabled: state.notificationsEnabled,
        analyticsEnabled: state.analyticsEnabled,
        diagnosticsEnabled: state.diagnosticsEnabled,
      }),
    },
  ),
);
