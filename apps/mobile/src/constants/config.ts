import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra as {
  environment?: string;
  apiBaseUrl?: string;
  sentryDsn?: string;
  eas?: { projectId?: string };
} | undefined;

export const config = {
  environment: extra?.environment ?? process.env.EXPO_PUBLIC_APP_ENV ?? "development",
  apiBaseUrl: extra?.apiBaseUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://www.logivya.com",
  sentryDsn: extra?.sentryDsn ?? process.env.EXPO_PUBLIC_SENTRY_DSN ?? "",
  easProjectId: extra?.eas?.projectId ?? "",
  requestTimeoutMs: 15000,
  retryCount: 2,
  queryRetryCount: 2,
  queryStaleTimeMs: 60_000,
  queryGcTimeMs: 24 * 60 * 60_000
} as const;
