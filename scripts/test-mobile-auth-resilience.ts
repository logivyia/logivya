import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ApiRequestError,
  isAuthenticationRejection,
} from "../apps/mobile/src/api/api-errors";

const root = process.cwd();

function read(file: string) {
  return readFileSync(path.join(root, file), "utf8");
}

const releaseConfigOutput = execFileSync(
  process.execPath,
  [
    "-e",
    "const factory=require('./apps/mobile/app.config.js');process.stdout.write(JSON.stringify(factory({config:{}}).extra));",
  ],
  {
    cwd: root,
    encoding: "utf8",
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          ![
            "APP_ENV",
            "EAS_BUILD_PROFILE",
            "NODE_ENV",
            "EXPO_PUBLIC_API_BASE_URL",
          ].includes(key),
      ),
    ),
  },
);
const releaseConfig = JSON.parse(releaseConfigOutput) as {
  environment?: string;
  apiBaseUrl?: string;
  apiFallbackBaseUrls?: string[];
};
assert.equal(
  releaseConfig.environment,
  "production",
  "A native release process with no explicit environment must default to production.",
);
assert.equal(
  releaseConfig.apiBaseUrl,
  "https://www.logivya.com",
  "The default native release API must never resolve to localhost.",
);
assert(
  releaseConfig.apiFallbackBaseUrls?.every((url) => url.startsWith("https://")),
  "Release API fallbacks must use HTTPS.",
);

assert.equal(
  isAuthenticationRejection(
    new ApiRequestError(
      "Unauthorized",
      "UNAUTHORIZED",
      401,
      "/api/mobile/auth/me",
    ),
  ),
  true,
  "A backend 401 must invalidate the persisted mobile session.",
);
assert.equal(
  isAuthenticationRejection(
    new ApiRequestError(
      "Server unavailable",
      "INTERNAL_ERROR",
      500,
      "/api/mobile/auth/me",
    ),
  ),
  false,
  "A backend 500 must not invalidate the persisted mobile session.",
);
assert.equal(
  isAuthenticationRejection(
    new ApiRequestError(
      "Network unavailable",
      "NETWORK_ERROR",
      0,
      "/api/mobile/auth/me",
    ),
  ),
  false,
  "A network failure must not invalidate the persisted mobile session.",
);

const client = read("apps/mobile/src/api/client.ts");
assert(
  client.includes("if (isAuthenticationRejection(error))"),
  "Token refresh must distinguish rejected tokens from transient failures.",
);
assert(
  client.includes("throw error;"),
  "Transient refresh failures must propagate without forcing logout.",
);

const authService = read("apps/mobile/src/auth/auth-service.ts");
assert(
  !authService.includes("clearMobileRuntimeSessionState();"),
  "Transient bootstrap failures must preserve the runtime and persisted session.",
);
assert(
  authService.includes("if (isAuthenticationRejection(error))"),
  "Session restore must clear persisted tokens only for explicit auth rejection.",
);

const bootstrap = read("apps/mobile/src/hooks/use-auth-bootstrap.ts");
assert(
  bootstrap.includes("bootstrapRetryDelaysMs"),
  "Session bootstrap must retry transient failures before presenting recovery UI.",
);
assert(
  bootstrap.includes("setRecovering()"),
  "Transient bootstrap failure must enter recovery state instead of signing out.",
);
assert(
  !bootstrap.includes("clearSession()"),
  "Bootstrap failure must never silently sign the user out.",
);

const storage = read("apps/mobile/src/storage/secure-storage.ts");
const readCatch = storage.slice(
  storage.indexOf('source: "secure-store-read-tokens"'),
  storage.indexOf("const storedAccessToken"),
);
assert(
  readCatch.includes("throw"),
  "Secure storage read failures must surface for retry.",
);
assert(
  !readCatch.includes("clearTokens"),
  "Secure storage read failures must never destroy token material.",
);

const authApi = read("apps/mobile/src/api/auth-api.ts");
const loginRequestSource = authApi.slice(
  authApi.indexOf("export function loginRequest"),
  authApi.indexOf("export function socialLoginRequest"),
);
assert(
  loginRequestSource.includes('"/api/mobile/auth/login"') &&
    loginRequestSource.includes("auth: false") &&
    loginRequestSource.includes("retry: false") &&
    !loginRequestSource.includes("hostFallback: false"),
  "Login must not be replayed automatically, but it must retain configured production-host fallback.",
);
assert(
  authApi.includes('"/api/mobile/auth/mfa/verify"') &&
    authApi.includes("{ auth: false, retry: false, hostFallback: false }"),
  "MFA verification must not be replayed or sent to another host after a lost success response.",
);
assert(
  authApi.includes("appVersion: input.appVersion ?? config.appVersion"),
  "Mobile login diagnostics must include the app version.",
);

const serverAuth = read("src/server/mobile/auth.ts");
assert(
  serverAuth.includes("AUTH_REFRESH_TOKEN_RETRY_RECOVERED"),
  "A lost refresh response must be recoverable without session revocation.",
);
assert(
  serverAuth.includes("replacementTokenEncrypted"),
  "Replacement refresh tokens must only be retained encrypted.",
);
assert(
  serverAuth.includes("MOBILE_REFRESH_RECOVERY_KEY_"),
  "Refresh recovery encryption must use a dedicated, rotatable key.",
);
assert(
  serverAuth.includes(
    "hashOpaqueToken(candidate) === replay.session.refreshTokenHash",
  ),
  "Recovered refresh tokens must match the active session hash.",
);
assert(
  serverAuth.includes("AUTH_REFRESH_TOKEN_REPLAY_DETECTED"),
  "True refresh token replay detection must remain enforced.",
);

const schema = read("prisma/schema.prisma");
assert(
  schema.includes("replacementTokenEncrypted String?"),
  "Refresh retry recovery data must be nullable and backward compatible.",
);
assert(
  /retryCount\s+Int\s+@default\(0\)/u.test(schema),
  "Refresh retry recovery must be observable.",
);

const cleanup = read("apps/mobile/src/auth/session-cleanup.ts");
assert(
  cleanup.includes("export function clearMobileRuntimeSessionState()"),
  "Runtime-only session cleanup must remain available.",
);
assert(
  cleanup.indexOf("await clearTokens();") <
    cleanup.indexOf("clearMobileRuntimeSessionState();"),
  "Full logout must clear tokens before runtime state.",
);

console.log("Mobile auth resilience contracts passed.");
