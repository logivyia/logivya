import { DarkTheme, DefaultTheme, type Theme } from "@react-navigation/native";

import { colors } from "@/theme/colors";

export const lightNavigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.orange,
    background: colors.surfaceLight,
    card: colors.white,
    text: colors.navy,
    border: colors.border,
    notification: colors.orange
  }
};

export const darkNavigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.orange,
    background: colors.navy,
    card: colors.navySoft,
    text: colors.white,
    border: colors.borderDark,
    notification: colors.orange
  }
};
