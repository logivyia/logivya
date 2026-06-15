import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;

export const config = {
  apiBaseUrl: extra?.apiBaseUrl ?? "https://www.logivya.com",
  requestTimeoutMs: 15000,
  retryCount: 2
} as const;
