import * as SecureStore from "expo-secure-store";

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

export async function saveTokens(tokens: StoredTokens) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
    SecureStore.setItemAsync(ACCESS_EXPIRES_KEY, tokens.accessTokenExpiresAt),
    SecureStore.setItemAsync(REFRESH_EXPIRES_KEY, tokens.refreshTokenExpiresAt)
  ]);
}

export async function readTokens(): Promise<StoredTokens | null> {
  const [accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(ACCESS_EXPIRES_KEY),
    SecureStore.getItemAsync(REFRESH_EXPIRES_KEY)
  ]);

  if (!accessToken || !refreshToken || !accessTokenExpiresAt || !refreshTokenExpiresAt) return null;
  return { accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt };
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(ACCESS_EXPIRES_KEY),
    SecureStore.deleteItemAsync(REFRESH_EXPIRES_KEY)
  ]);
}
