import Constants from "expo-constants";

const runtimeEnv = typeof process === "undefined" ? undefined : process.env;

const extra = Constants.expoConfig?.extra as {
  environment?: string;
  apiBaseUrl?: string;
  apiFallbackBaseUrls?: string[];
  sentryDsn?: string;
  eas?: { projectId?: string };
} | undefined;

function normalizeBaseUrl(value?: string | null) {
  return value?.trim().replace(/\/+$/, "") || "";
}

const primaryApiBaseUrl = normalizeBaseUrl(extra?.apiBaseUrl ?? runtimeEnv?.EXPO_PUBLIC_API_BASE_URL) || "https://www.logivya.com";

export const config = {
  environment: extra?.environment ?? runtimeEnv?.EXPO_PUBLIC_APP_ENV ?? "development",
  apiBaseUrl: primaryApiBaseUrl,
  apiFallbackBaseUrls: [
    ...(extra?.apiFallbackBaseUrls ?? []),
    "https://logivya.com",
    "https://logivya.vercel.app"
  ].map(normalizeBaseUrl).filter((url, index, urls) => url && url !== primaryApiBaseUrl && urls.indexOf(url) === index),
  sentryDsn: extra?.sentryDsn ?? runtimeEnv?.EXPO_PUBLIC_SENTRY_DSN ?? "",
  easProjectId: extra?.eas?.projectId ?? "",
  requestTimeoutMs: 15000,
  retryCount: 2,
  queryRetryCount: 2,
  queryStaleTimeMs: 60_000,
  queryGcTimeMs: 24 * 60 * 60_000
} as const;
