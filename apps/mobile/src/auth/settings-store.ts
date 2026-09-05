import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { detectDeviceLocale, normalizeLocale, type Locale } from "@/i18n/config";

type ThemePreference = "light" | "dark" | "system";
const SETTINGS_STORAGE_KEY = "logivya.mobile.settings.v2";
const SETTINGS_STORAGE_VERSION = 4;

type SettingsState = {
  theme: ThemePreference;
  locale: Locale;
  notificationsEnabled: boolean;
  analyticsEnabled: boolean;
  diagnosticsEnabled: boolean;
  onboardingCompleted: boolean;
  hydrated: boolean;
  setTheme: (theme: ThemePreference) => void;
  setLocale: (locale: Locale) => void;
  applyAccountLocale: (locale: string | null | undefined) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setAnalyticsEnabled: (enabled: boolean) => void;
  setDiagnosticsEnabled: (enabled: boolean) => void;
  completeOnboarding: () => void;
  restartOnboarding: () => void;
  setHydrated: (hydrated: boolean) => void;
};

function migrateSettings(value: unknown) {
  const candidate = value && typeof value === "object" ? value as Partial<SettingsState> : {};
  const theme = candidate.theme === "light" || candidate.theme === "dark" || candidate.theme === "system"
    ? candidate.theme
    : "system";
  return {
    theme,
    locale: normalizeLocale(candidate.locale) ?? detectDeviceLocale(),
    notificationsEnabled: typeof candidate.notificationsEnabled === "boolean" ? candidate.notificationsEnabled : true,
    analyticsEnabled: typeof candidate.analyticsEnabled === "boolean" ? candidate.analyticsEnabled : false,
    diagnosticsEnabled: typeof candidate.diagnosticsEnabled === "boolean" ? candidate.diagnosticsEnabled : false,
    onboardingCompleted: typeof candidate.onboardingCompleted === "boolean" ? candidate.onboardingCompleted : false,
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      locale: detectDeviceLocale(),
      notificationsEnabled: true,
      analyticsEnabled: false,
      diagnosticsEnabled: false,
      onboardingCompleted: false,
      hydrated: false,
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
      applyAccountLocale: (value) => {
        const locale = normalizeLocale(value);
        if (locale) set({ locale });
      },
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setAnalyticsEnabled: (analyticsEnabled) => set({ analyticsEnabled }),
      setDiagnosticsEnabled: (diagnosticsEnabled) => set({ diagnosticsEnabled }),
      completeOnboarding: () => set({ onboardingCompleted: true }),
      restartOnboarding: () => set({ onboardingCompleted: false }),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      version: SETTINGS_STORAGE_VERSION,
      migrate: (persistedState) => migrateSettings(persistedState),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...migrateSettings(persistedState),
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) void AsyncStorage.removeItem(SETTINGS_STORAGE_KEY);
        if (state) state.setHydrated(true);
        else setTimeout(() => useSettingsStore.setState({ hydrated: true }), 0);
      },
      partialize: (state) => ({
        theme: state.theme,
        locale: state.locale,
        notificationsEnabled: state.notificationsEnabled,
        analyticsEnabled: state.analyticsEnabled,
        diagnosticsEnabled: state.diagnosticsEnabled,
        onboardingCompleted: state.onboardingCompleted,
      }),
    },
  ),
);
