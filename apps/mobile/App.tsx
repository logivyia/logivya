import "react-native-gesture-handler";

import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useRef } from "react";
import { useColorScheme } from "react-native";

import { ErrorBoundary } from "@/components/error-boundary";
import { RootNavigator } from "@/navigation/root-navigator";
import { useAuthBootstrap } from "@/hooks/use-auth-bootstrap";
import { useProductionServices } from "@/hooks/use-production-services";
import { useSettingsStore } from "@/auth/settings-store";
import { getActiveRouteName, trackScreenView } from "@/services/analytics";
import { initCrashReporting, wrapWithCrashReporting } from "@/services/crash-reporting";
import { linking } from "@/navigation/linking";
import { OfflineQueryProvider } from "@/services/offline-query";
import { darkNavigationTheme, lightNavigationTheme } from "@/theme/navigation";
import { ThemeProvider } from "@/theme/theme-provider";

initCrashReporting();

function App() {
  const systemScheme = useColorScheme();
  const preferredTheme = useSettingsStore((state) => state.theme);
  const themeMode = preferredTheme === "system" ? systemScheme ?? "light" : preferredTheme;
  const routeNameRef = useRef<string | undefined>(undefined);

  useAuthBootstrap();
  useProductionServices();

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
