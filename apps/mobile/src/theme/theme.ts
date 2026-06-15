import { colors } from "@/theme/colors";

export type ThemeMode = "light" | "dark";

export const appThemes = {
  light: {
    mode: "light" as const,
    background: colors.surfaceLight,
    card: colors.white,
    text: colors.navy,
    muted: colors.slate,
    border: colors.border,
    primary: colors.orange,
    primaryText: colors.white
  },
  dark: {
    mode: "dark" as const,
    background: colors.navy,
    card: colors.navySoft,
    text: colors.white,
    muted: "#cbd5e1",
    border: "#334155",
    primary: colors.orange,
    primaryText: colors.white
  }
} as const;

export type AppTheme = (typeof appThemes)[keyof typeof appThemes];
