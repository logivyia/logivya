import { create } from "zustand";

type ThemePreference = "light" | "dark" | "system";
type Locale = "tr" | "en";

type SettingsState = {
  theme: ThemePreference;
  locale: Locale;
  biometricEnabled: boolean;
  setTheme: (theme: ThemePreference) => void;
  setLocale: (locale: Locale) => void;
  setBiometricEnabled: (enabled: boolean) => void;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: "system",
  locale: "tr",
  biometricEnabled: false,
  setTheme: (theme) => set({ theme }),
  setLocale: (locale) => set({ locale }),
  setBiometricEnabled: (biometricEnabled) => set({ biometricEnabled })
}));
