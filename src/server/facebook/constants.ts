import "server-only";

export const FACEBOOK_PAGES_FEATURE_FLAG = "facebook_pages";
export const FACEBOOK_CHANNEL_NAME = "Facebook Pages";
export const FACEBOOK_USER_PROVIDER = "META_GRAPH_USER";
export const FACEBOOK_PAGE_PROVIDER = "META_GRAPH_PAGE";
export const FACEBOOK_GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION?.trim() || "v26.0";

export const FACEBOOK_PAGE_SCOPES = (process.env.FACEBOOK_PAGE_SCOPES
  || "pages_show_list,pages_manage_posts,pages_read_engagement,publish_video")
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);

export function facebookAppId() {
  const value = process.env.FACEBOOK_APP_ID?.trim();
  if (!value) throw new Error("FACEBOOK_NOT_CONFIGURED");
  return value;
}

export function facebookAppSecret() {
  const value = process.env.FACEBOOK_APP_SECRET?.trim();
  if (!value) throw new Error("FACEBOOK_NOT_CONFIGURED");
  return value;
}

export function facebookOAuthRedirectUri() {
  const explicit = process.env.FACEBOOK_OAUTH_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.logivya.com").replace(/\/+$/u, "");
  return `${base}/api/facebook/oauth/callback`;
}

export function isFacebookGraphConfigured() {
  const activeVersion = (process.env.FACEBOOK_TOKEN_KEY_ACTIVE_VERSION || "v1").toUpperCase();
  const stateSecret = process.env.FACEBOOK_OAUTH_STATE_SECRET
    || process.env.AUTH_SECRET
    || process.env.NEXTAUTH_SECRET
    || process.env.PASSWORD_PEPPER;
  return Boolean(
    process.env.FACEBOOK_APP_ID?.trim()
      && process.env.FACEBOOK_APP_SECRET?.trim()
      && stateSecret && stateSecret.length >= 32
      && process.env[`FACEBOOK_TOKEN_KEY_${activeVersion}`]?.trim(),
  );
}

export function facebookProviderHealthSummary() {
  const base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.logivya.com").replace(/\/+$/u, "");
  return {
    configured: isFacebookGraphConfigured(),
    graphVersion: FACEBOOK_GRAPH_VERSION,
    oauthCallback: facebookOAuthRedirectUri(),
    deauthorizationCallback: `${base}/api/facebook/deauthorize`,
    dataDeletionCallback: `${base}/api/facebook/data-deletion`,
    providerMode: process.env.FACEBOOK_PROVIDER_MODE?.trim().toUpperCase() || "DEVELOPMENT",
  };
}
