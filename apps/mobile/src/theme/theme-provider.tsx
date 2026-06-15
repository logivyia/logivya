import { createContext, useContext, type ReactNode } from "react";

import { appThemes, type AppTheme, type ThemeMode } from "@/theme/theme";

const ThemeContext = createContext<AppTheme>(appThemes.light);

export function ThemeProvider({ mode, children }: { mode: ThemeMode; children: ReactNode }) {
  return <ThemeContext.Provider value={appThemes[mode]}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
