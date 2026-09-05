import "server-only";

import {
  FACEBOOK_GRAPH_VERSION,
  FACEBOOK_PAGE_SCOPES,
  facebookAppId,
  facebookOAuthRedirectUri,
} from "@/server/facebook/constants";
import { createFacebookOAuthState, registerFacebookOAuthState } from "@/server/facebook/oauth-state";
import type { MobileAuthContext } from "@/server/mobile/auth";

export function buildFacebookAuthorizationUrl(auth: MobileAuthContext, state: string) {
  const url = new URL(`https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", facebookAppId());
  url.searchParams.set("redirect_uri", facebookOAuthRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  const configurationId = process.env.FACEBOOK_LOGIN_CONFIG_ID?.trim();
  if (configurationId) url.searchParams.set("config_id", configurationId);
  else url.searchParams.set("scope", FACEBOOK_PAGE_SCOPES.join(","));
  url.searchParams.set("auth_type", "rerequest");
  url.searchParams.set("return_scopes", "true");
  return url.toString();
}

export async function createFacebookAuthorizationUrl(auth: MobileAuthContext) {
  const state = createFacebookOAuthState({
    userId: auth.user.id,
    companyId: auth.company.id,
    platform: auth.platform,
  });
  await registerFacebookOAuthState(state);
  return buildFacebookAuthorizationUrl(auth, state);
}
