import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { socialIdentityAudiences } from "@/server/auth/social-identity";

async function main() {
  const root = process.cwd();
  const originalGoogleClientIds = process.env.GOOGLE_OAUTH_CLIENT_IDS;
  const originalGoogleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;

  delete process.env.GOOGLE_OAUTH_CLIENT_IDS;
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  assert.deepEqual(socialIdentityAudiences("GOOGLE"), [], "Google sign-in must fail closed without configured audiences.");

  process.env.GOOGLE_OAUTH_CLIENT_IDS = "web-client, ios-client,web-client";
  assert.deepEqual(
    socialIdentityAudiences("GOOGLE"),
    ["web-client", "ios-client"],
    "Google audiences must be trimmed and deduplicated.",
  );
  assert.ok(
    socialIdentityAudiences("APPLE").includes("com.logivya.mobile"),
    "Native Apple tokens must be scoped to the Logivya iOS bundle identifier.",
  );

  if (originalGoogleClientIds === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_IDS;
  else process.env.GOOGLE_OAUTH_CLIENT_IDS = originalGoogleClientIds;
  if (originalGoogleClientId === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  else process.env.GOOGLE_OAUTH_CLIENT_ID = originalGoogleClientId;

  const [route, verifier, loginScreen, socialProvider, appConfig, easConfigSource] = await Promise.all([
    readFile(path.join(root, "src/app/api/mobile/auth/social/route.ts"), "utf8"),
    readFile(path.join(root, "src/server/auth/social-identity.ts"), "utf8"),
    readFile(path.join(root, "apps/mobile/src/screens/auth/login-screen.tsx"), "utf8"),
    readFile(path.join(root, "apps/mobile/src/auth/social-provider.ts"), "utf8"),
    readFile(path.join(root, "apps/mobile/app.config.js"), "utf8"),
    readFile(path.join(root, "apps/mobile/eas.json"), "utf8"),
  ]);

  assert.match(route, /verifySocialIdentity/u, "The social route must verify provider identity tokens server-side.");
  assert.match(route, /resolveMfaLoginDecision/u, "Social sign-in must preserve workspace MFA policy.");
  assert.match(route, /validateTrustedDevice/u, "Social sign-in must preserve trusted-device validation.");
  assert.match(route, /createMobileSession/u, "Social sign-in must issue the standard mobile session.");
  assert.match(route, /SOCIAL_ACCOUNT_NOT_FOUND/u, "Social sign-in must not silently create a new workspace.");
  assert.doesNotMatch(route, /logger\.[a-z]+\([^\n]*identityToken/u, "Identity tokens must never be written to logs.");

  assert.match(verifier, /googleClient\.verifyIdToken/u, "Google ID tokens must be verified by the official server library.");
  assert.match(verifier, /https:\/\/appleid\.apple\.com\/auth\/keys/u, "Apple ID tokens must use Apple's JWKS.");
  assert.match(verifier, /issuer: "https:\/\/appleid\.apple\.com"/u, "Apple token issuer must be pinned.");
  assert.match(verifier, /payload\.nonce !== expectedNonce/u, "Apple nonce correlation must be enforced.");
  assert.match(verifier, /googleControlsEmailDomain/u, "Google email authority must be checked before account matching.");

  assert.match(loginScreen, /GoogleSigninButton/u, "The login screen must use the Google-provided sign-in control.");
  assert.match(loginScreen, /AppleAuthenticationButton/u, "The login screen must use Apple's official sign-in control.");
  assert.match(
    loginScreen,
    /<GoogleSigninButton[\s\S]*?\{appleSignInAvailable \? \(/u,
    "Google sign-in must be rendered on both Android and iOS, independently of Apple availability.",
  );
  assert.match(
    socialProvider,
    /Platform\.OS === "android"[\s\S]*?GoogleSignin\.hasPlayServices/u,
    "Android Google sign-in must verify Google Play Services availability.",
  );
  assert.match(
    socialProvider,
    /Platform\.OS === "ios" && AppleAuthentication\.isAvailableAsync\(\)/u,
    "Apple sign-in must remain limited to supported iOS devices.",
  );
  assert.match(socialProvider, /AppleAuthenticationScope\.EMAIL/u, "Apple sign-in must request the verified email scope.");
  assert.match(socialProvider, /Crypto\.randomUUID/u, "Apple sign-in must use unpredictable state and nonce values.");
  assert.match(appConfig, /usesAppleSignIn: nativeDiagnosticMode \? undefined : true/u, "The iOS Sign in with Apple capability must be enabled.");

  const easConfig = JSON.parse(easConfigSource.replace(/^\uFEFF/u, "")) as {
    build?: Record<string, { env?: Record<string, string> }>;
  };
  for (const profile of ["production", "production-apk"]) {
    assert.ok(
      easConfig.build?.[profile]?.env?.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      `${profile} must include the Android Google OAuth client ID.`,
    );
  }

  console.log("Mobile Google/Apple social-auth contracts passed.");
}

void main();
