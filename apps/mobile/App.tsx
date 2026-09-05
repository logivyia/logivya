import "react-native-gesture-handler";

import { NavigationContainer, useNavigationContainerRef, type ParamListBase } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useRef } from "react";
import { useEffect } from "react";
import { I18nManager, Platform, useColorScheme, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useSettingsStore } from "@/auth/settings-store";
import { useAuthStore } from "@/auth/auth-store";
import { ErrorBoundary } from "@/components/error-boundary";
import { IosUpdatePrompt } from "@/components/ios-update-prompt";
import { useAuthBootstrap } from "@/hooks/use-auth-bootstrap";
import { useProductionServices } from "@/hooks/use-production-services";
import { linking } from "@/navigation/linking";
import { RootNavigator } from "@/navigation/root-navigator";
import { configureAnalyticsCollection, getActiveRouteName, trackScreenView } from "@/services/analytics";
import { initCrashReporting, wrapWithCrashReporting } from "@/services/crash-reporting";
import {
  hydrateMobileRecoveryContext,
  setCurrentMobileRoute,
} from "@/services/mobile-recovery-context";
import { OfflineQueryProvider } from "@/services/offline-query";
import {
  configurePerformanceMonitoring,
  stopPerformanceScreenTracking,
  trackPerformanceScreen,
} from "@/services/performance-monitoring";
import { installGlobalStartupGuards } from "@/services/startup-guards";
import { AppLockGate } from "@/security/app-lock-gate";
import { darkNavigationTheme, lightNavigationTheme } from "@/theme/navigation";
import { ThemeProvider } from "@/theme/theme-provider";
import { localeMetadata } from "@/i18n/config";

installGlobalStartupGuards();
initCrashReporting();
I18nManager.allowRTL(true);

function AppContent() {
  const systemScheme = useColorScheme();
  const preferredTheme = useSettingsStore((state) => state.theme);
  const locale = useSettingsStore((state) => state.locale);
  const analyticsEnabled = useSettingsStore((state) => state.analyticsEnabled);
  const diagnosticsEnabled = useSettingsStore((state) => state.diagnosticsEnabled);
  const accountLocale = useAuthStore((state) => state.user?.locale);
  const applyAccountLocale = useSettingsStore((state) => state.applyAccountLocale);
  const themeMode = preferredTheme === "system" ? systemScheme ?? "light" : preferredTheme;
  const navigationRef = useNavigationContainerRef<ParamListBase>();
  const routeNameRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    void hydrateMobileRecoveryContext();
  }, []);

  useAuthBootstrap();
  useProductionServices();

  useEffect(() => {
    applyAccountLocale(accountLocale);
  }, [accountLocale, applyAccountLocale]);

  useEffect(() => {
    void configureAnalyticsCollection(analyticsEnabled);
  }, [analyticsEnabled]);

  useEffect(() => {
    void configurePerformanceMonitoring(diagnosticsEnabled).then(() => {
      if (diagnosticsEnabled) {
        void trackPerformanceScreen(navigationRef.getCurrentRoute()?.name);
      }
    });
  }, [diagnosticsEnabled, navigationRef]);

  useEffect(() => () => {
    void stopPerformanceScreenTracking();
  }, []);

  return (
    <OfflineQueryProvider>
      <ThemeProvider mode={themeMode}>
        <AppLockGate>
          <NavigationContainer
            ref={navigationRef}
            linking={linking}
            theme={themeMode === "dark" ? darkNavigationTheme : lightNavigationTheme}
            onReady={() => {
              const currentRouteName = navigationRef.getCurrentRoute()?.name;
              routeNameRef.current = currentRouteName;
              setCurrentMobileRoute(currentRouteName);
              void trackPerformanceScreen(currentRouteName);
            }}
            onStateChange={(state) => {
              const currentRouteName = getActiveRouteName(state);
              if (currentRouteName && routeNameRef.current !== currentRouteName) {
                routeNameRef.current = currentRouteName;
                setCurrentMobileRoute(currentRouteName);
                void trackScreenView(currentRouteName);
                void trackPerformanceScreen(currentRouteName);
              }
            }}
          >
            <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
            <View style={{ direction: localeMetadata[locale].direction, flex: 1 }}>
              <RootNavigator />
              {Platform.OS === "ios" ? <IosUpdatePrompt /> : null}
            </View>
          </NavigationContainer>
        </AppLockGate>
      </ThemeProvider>
    </OfflineQueryProvider>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

export default wrapWithCrashReporting(App);
