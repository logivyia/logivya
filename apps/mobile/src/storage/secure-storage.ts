import * as SecureStore from "expo-secure-store";

import { captureAppError } from "@/services/crash-reporting";
import { translateCurrent } from "@/i18n/runtime";

const ACCESS_TOKEN_KEY = "logivya.accessToken";
const REFRESH_TOKEN_KEY = "logivya.refreshToken";
const ACCESS_EXPIRES_KEY = "logivya.accessTokenExpiresAt";
const REFRESH_EXPIRES_KEY = "logivya.refreshTokenExpiresAt";

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
};

export class SecureTokenStorageError extends Error {
  constructor(message = translateCurrent("secureSessionSaveFailed")) {
    super(message);
    this.name = "SecureTokenStorageError";
  }
}

function toSecureStoreString(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" || Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asStoredString(value: string | null) {
  if (!value) return null;
  const parsed = safeParseJson(value);
  return typeof parsed === "string" ? parsed : value;
}

async function setRequiredSecureItem(key: string, value: unknown) {
  const normalized = toSecureStoreString(value);
  if (!normalized) throw new SecureTokenStorageError();
  await SecureStore.setItemAsync(key, normalized);
}

export async function saveTokens(tokens: StoredTokens) {
  try {
    await Promise.all([
      setRequiredSecureItem(ACCESS_TOKEN_KEY, tokens.accessToken),
      setRequiredSecureItem(REFRESH_TOKEN_KEY, tokens.refreshToken),
      setRequiredSecureItem(ACCESS_EXPIRES_KEY, tokens.accessTokenExpiresAt),
      setRequiredSecureItem(REFRESH_EXPIRES_KEY, tokens.refreshTokenExpiresAt)
    ]);
  } catch (error) {
    captureAppError(error, { source: "secure-store-save-tokens" });
    throw error instanceof SecureTokenStorageError ? error : new SecureTokenStorageError();
  }
}

export async function readTokens(): Promise<StoredTokens | null> {
  let accessToken: string | null;
  let refreshToken: string | null;
  let accessTokenExpiresAt: string | null;
  let refreshTokenExpiresAt: string | null;

  try {
    [accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.getItemAsync(ACCESS_EXPIRES_KEY),
      SecureStore.getItemAsync(REFRESH_EXPIRES_KEY)
    ]);
  } catch (error) {
    captureAppError(error, { source: "secure-store-read-tokens" });
    await clearTokens();
    return null;
  }

  const storedAccessToken = asStoredString(accessToken);
  const storedRefreshToken = asStoredString(refreshToken);
  const storedAccessTokenExpiresAt = asStoredString(accessTokenExpiresAt);
  const storedRefreshTokenExpiresAt = asStoredString(refreshTokenExpiresAt);

  if (!storedAccessToken || !storedRefreshToken || !storedAccessTokenExpiresAt || !storedRefreshTokenExpiresAt) return null;
  return {
    accessToken: storedAccessToken,
    refreshToken: storedRefreshToken,
    accessTokenExpiresAt: storedAccessTokenExpiresAt,
    refreshTokenExpiresAt: storedRefreshTokenExpiresAt
  };
}

export async function clearTokens() {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(ACCESS_EXPIRES_KEY),
    SecureStore.deleteItemAsync(REFRESH_EXPIRES_KEY)
  ]);
}
