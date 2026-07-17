import type { NavigationState, PartialState } from "@react-navigation/native";
import { normalizeEventName, sanitizeLogMetadata } from "@logivya/logging";
import { useSettingsStore } from "@/auth/settings-store";

declare const require: (name: string) => unknown;

type AnalyticsModule = {
  default?: () => {
    logScreenView?: (params: { screen_name: string; screen_class: string }) => Promise<void>;
    logEvent?: (name: string, params?: Record<string, unknown>) => Promise<void>;
    setAnalyticsCollectionEnabled?: (enabled: boolean) => Promise<void>;
  };
};

function loadAnalytics() {
  try {
    const loadedModule = require("@react-native-firebase/analytics") as AnalyticsModule;
    return loadedModule.default?.() ?? null;
  } catch {
    return null;
  }
}

export function getActiveRouteName(state?: NavigationState | PartialState<NavigationState>): string | undefined {
  if (!state) return undefined;
  const route = state.routes[state.index ?? 0];
  if (!route) return undefined;
  if (route.state) return getActiveRouteName(route.state as NavigationState | PartialState<NavigationState>);
  return route.name;
}

export async function trackScreenView(screenName?: string) {
  if (!screenName || !useSettingsStore.getState().analyticsEnabled) return;
  const analytics = loadAnalytics();
  await analytics?.logScreenView?.({ screen_name: screenName, screen_class: screenName }).catch(() => undefined);
}

export async function trackEvent(name: string, params?: Record<string, unknown>) {
  if (!useSettingsStore.getState().analyticsEnabled) return;
  const analytics = loadAnalytics();
  const eventName = normalizeEventName(name).replace(/[^A-Za-z0-9_]/g, "_").slice(0, 40);
  const safeParams = Object.fromEntries(
    Object.entries(sanitizeLogMetadata(params)).flatMap(([key, value]) => {
      const safeKey = key.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 40);
      if (!safeKey) return [];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return [[safeKey, value]];
      }
      return [[safeKey, JSON.stringify(value).slice(0, 100)]];
    })
  );
  await analytics?.logEvent?.(eventName, safeParams).catch(() => undefined);
}

export async function configureAnalyticsCollection(enabled: boolean) {
  const analytics = loadAnalytics();
  await analytics?.setAnalyticsCollectionEnabled?.(enabled).catch(() => undefined);
}
