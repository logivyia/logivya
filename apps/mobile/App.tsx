import "react-native-gesture-handler";

import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useRef } from "react";
import { useEffect } from "react";
import { useColorScheme } from "react-native";

import { useSettingsStore } from "@/auth/settings-store";
import { useAuthStore } from "@/auth/auth-store";
import { ErrorBoundary } from "@/components/error-boundary";
import { useAuthBootstrap } from "@/hooks/use-auth-bootstrap";
import { useProductionServices } from "@/hooks/use-production-services";
import { linking } from "@/navigation/linking";
import { RootNavigator } from "@/navigation/root-navigator";
import { getActiveRouteName, trackScreenView } from "@/services/analytics";
import { initCrashReporting, wrapWithCrashReporting } from "@/services/crash-reporting";
import { OfflineQueryProvider } from "@/services/offline-query";
import { installGlobalStartupGuards } from "@/services/startup-guards";
import { darkNavigationTheme, lightNavigationTheme } from "@/theme/navigation";
import { ThemeProvider } from "@/theme/theme-provider";

installGlobalStartupGuards();
initCrashReporting();

function App() {
  const systemScheme = useColorScheme();
  const preferredTheme = useSettingsStore((state) => state.theme);
  const accountLocale = useAuthStore((state) => state.user?.locale);
  const applyAccountLocale = useSettingsStore((state) => state.applyAccountLocale);
  const themeMode = preferredTheme === "system" ? systemScheme ?? "light" : preferredTheme;
  const routeNameRef = useRef<string | undefined>(undefined);

  useAuthBootstrap();
  useProductionServices();

  useEffect(() => {
    applyAccountLocale(accountLocale);
  }, [accountLocale, applyAccountLocale]);

  return (
    <ErrorBoundary>
      <OfflineQueryProvider>
        <ThemeProvider mode={themeMode}>
          <NavigationContainer
            linking={linking}
            theme={themeMode === "dark" ? darkNavigationTheme : lightNavigationTheme}
            onReady={() => {
              routeNameRef.current = undefined;
            }}
            onStateChange={(state) => {
              const currentRouteName = getActiveRouteName(state);
              if (currentRouteName && routeNameRef.current !== currentRouteName) {
                routeNameRef.current = currentRouteName;
                void trackScreenView(currentRouteName);
              }
            }}
          >
            <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
            <RootNavigator />
          </NavigationContainer>
        </ThemeProvider>
      </OfflineQueryProvider>
    </ErrorBoundary>
  );
}

export default wrapWithCrashReporting(App);
