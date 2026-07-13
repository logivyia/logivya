import { colors } from "@/theme/colors";

export type ThemeMode = "light" | "dark";

export const appThemes = {
  light: {
    mode: "light" as const,
    background: colors.surfaceLight,
    surface: colors.surfaceLight,
    card: colors.white,
    cardMuted: "#F8FAFC",
    text: colors.navy,
    muted: colors.slate,
    border: colors.border,
    primary: colors.orange,
    primaryText: colors.white,
    icon: colors.navy,
    iconMuted: colors.slate,
    header: colors.white,
    headerText: colors.navy,
    input: colors.white,
    badge: "#FFF2E8",
    danger: colors.danger,
    dangerSoft: "#FEE2E2",
    success: colors.success,
    successSoft: "#DCFCE7",
    warning: colors.warning,
    warningSoft: "#FEF3C7",
    shadow: "rgba(15, 23, 42, 0.08)"
  },
  dark: {
    mode: "dark" as const,
    background: colors.navy,
    surface: colors.navy,
    card: colors.navySoft,
    cardMuted: colors.navyElevated,
    text: colors.white,
    muted: colors.slateSoft,
    border: colors.borderDark,
    primary: colors.orange,
    primaryText: colors.white,
    icon: colors.white,
    iconMuted: colors.slateSoft,
    header: colors.navySoft,
    headerText: colors.white,
    input: "#0C1A2C",
    badge: "rgba(255, 107, 0, 0.16)",
    danger: colors.danger,
    dangerSoft: "rgba(239, 68, 68, 0.18)",
    success: colors.success,
    successSoft: "rgba(18, 185, 129, 0.18)",
    warning: colors.warning,
    warningSoft: "rgba(245, 158, 11, 0.18)",
    shadow: "rgba(0, 0, 0, 0.3)"
  }
} as const;

export type AppTheme = (typeof appThemes)[keyof typeof appThemes];
