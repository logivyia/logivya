import type { AuthTokens } from "@/types/api";

const DEFAULT_ACCESS_TOKEN_SECONDS = 15 * 60;
const DEFAULT_REFRESH_TOKEN_DAYS = 30;

function dateString(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  return null;
}

export function normalizeAuthTokens(tokens: AuthTokens): AuthTokens {
  const accessTokenExpiresAt =
    dateString(tokens.accessTokenExpiresAt) ||
    new Date(Date.now() + (tokens.expiresIn ?? DEFAULT_ACCESS_TOKEN_SECONDS) * 1000).toISOString();

  const refreshTokenExpiresAt =
    dateString(tokens.refreshTokenExpiresAt) ||
    dateString(tokens.refreshExpiresAt) ||
    new Date(Date.now() + DEFAULT_REFRESH_TOKEN_DAYS * 86_400_000).toISOString();

  return {
    ...tokens,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
  };
}
