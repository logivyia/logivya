import type { NavigationState, PartialState } from "@react-navigation/native";

declare const require: (name: string) => unknown;

type AnalyticsModule = {
  default?: () => {
    logScreenView?: (params: { screen_name: string; screen_class: string }) => Promise<void>;
    logEvent?: (name: string, params?: Record<string, unknown>) => Promise<void>;
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
  if (!screenName) return;
  const analytics = loadAnalytics();
  await analytics?.logScreenView?.({ screen_name: screenName, screen_class: screenName }).catch(() => undefined);
}

export async function trackEvent(name: string, params?: Record<string, unknown>) {
  const analytics = loadAnalytics();
  await analytics?.logEvent?.(name, params).catch(() => undefined);
}
