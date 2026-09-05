import Constants from "expo-constants";
import { Platform } from "react-native";

const runtimeEnv = typeof process === "undefined" ? undefined : process.env;

const extra = Constants.expoConfig?.extra as {
  environment?: string;
  apiBaseUrl?: string;
  apiFallbackBaseUrls?: string[];
  sentryDsn?: string;
  buildMarker?: string;
  releaseId?: string;
  gitCommit?: string;
  buildDate?: string;
  apiContractVersion?: string;
  socialSignIn?: {
    googleWebClientId?: string;
    googleIosClientId?: string;
    googleAndroidClientId?: string;
  };
  eas?: { projectId?: string };
} | undefined;

function normalizeBaseUrl(value?: string | null) {
  return value?.trim().replace(/\/+$/, "") || "";
}

const primaryApiBaseUrl = normalizeBaseUrl(extra?.apiBaseUrl ?? runtimeEnv?.EXPO_PUBLIC_API_BASE_URL) || "https://www.logivya.com";

function numericBuildNumber(value: string | number | null | undefined) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

const nativeBuildNumber = Platform.OS === "ios"
  ? numericBuildNumber(Constants.expoConfig?.ios?.buildNumber)
  : numericBuildNumber(Constants.expoConfig?.android?.versionCode);

export const config = {
  environment: extra?.environment ?? runtimeEnv?.EXPO_PUBLIC_APP_ENV ?? "development",
  apiBaseUrl: primaryApiBaseUrl,
  apiFallbackBaseUrls: (extra?.apiFallbackBaseUrls ?? [])
    .map(normalizeBaseUrl)
    .filter((url, index, urls) => url && url !== primaryApiBaseUrl && urls.indexOf(url) === index),
  sentryDsn: extra?.sentryDsn ?? runtimeEnv?.EXPO_PUBLIC_SENTRY_DSN ?? "",
  appVersion: Constants.expoConfig?.version ?? "unknown",
  versionCode: nativeBuildNumber,
  buildMarker: extra?.buildMarker ?? "unknown",
  releaseId: extra?.releaseId ?? "unknown",
  gitCommit: extra?.gitCommit ?? "unknown",
  buildDate: extra?.buildDate ?? "unknown",
  apiContractVersion: extra?.apiContractVersion ?? "unknown",
  googleWebClientId: extra?.socialSignIn?.googleWebClientId ?? runtimeEnv?.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
  googleIosClientId: extra?.socialSignIn?.googleIosClientId ?? runtimeEnv?.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "",
  googleAndroidClientId: extra?.socialSignIn?.googleAndroidClientId ?? runtimeEnv?.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? "",
  easProjectId: extra?.eas?.projectId ?? "",
  requestTimeoutMs: 15000,
  retryCount: 2,
  queryRetryCount: 2,
  queryStaleTimeMs: 60_000,
  queryGcTimeMs: 24 * 60 * 60_000
} as const;
