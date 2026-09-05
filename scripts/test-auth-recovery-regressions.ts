import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  publicAuthErrorBody,
  publicAuthFailure,
} from "../src/server/auth/public-errors";

function source(path: string) {
  return readFileSync(resolve(path), "utf8");
}

const invalidCode = publicAuthFailure("INVALID_TOTP_CODE");
assert.equal(invalidCode.code, "AUTH_MFA_CODE_INVALID");
assert.equal(invalidCode.status, 401);

const expiredChallenge = publicAuthFailure("MFA_CHALLENGE_INVALID");
assert.equal(expiredChallenge.code, "AUTH_MFA_CHALLENGE_EXPIRED");
assert.equal(expiredChallenge.status, 401);

const rateLimited = publicAuthFailure("MFA_CHALLENGE_LOCKED");
assert.equal(rateLimited.code, "AUTH_MFA_RATE_LIMITED");
assert.equal(rateLimited.status, 429);

const publicBody = publicAuthErrorBody(
  "INVALID_TOTP_CODE",
  "auth-test-correlation",
);
assert.equal(publicBody.error, "AUTH_MFA_CODE_INVALID");
assert.equal(publicBody.correlationId, "auth-test-correlation");
assert(
  !JSON.stringify(publicBody).includes("secret"),
  "Public auth errors must not expose secret material.",
);

const challengeService = source("src/server/auth/mfa-challenge.ts");
const issueChallengeBlock = challengeService.slice(
  challengeService.indexOf("export async function issueMfaChallenge"),
  challengeService.indexOf("export async function readMfaChallenge"),
);
assert(
  issueChallengeBlock.includes("expiresAt: { lte: now }"),
  "Issuing a challenge may clean up expired challenges.",
);
assert(
  !issueChallengeBlock.includes("expiresAt: { gt: now }"),
  "A duplicate login must not invalidate another live challenge held by the same user.",
);
const consumeChallengeBlock = challengeService.slice(
  challengeService.indexOf("export async function consumeMfaChallenge"),
  challengeService.indexOf("export async function findActiveMfaCredential"),
);
assert(
  consumeChallengeBlock.includes("pg_advisory_xact_lock"),
  "MFA challenge consumption must serialize concurrent verification attempts.",
);
assert(
  consumeChallengeBlock.includes("consumedAt: null") &&
    consumeChallengeBlock.includes("data: { consumedAt: now }"),
  "A successful verification must atomically consume sibling live challenges.",
);

const mobileSession = source("src/server/mobile/auth.ts");
const createSessionBlock = mobileSession.slice(
  mobileSession.indexOf("export async function createMobileSession"),
  mobileSession.indexOf("export async function rotateRefreshToken"),
);
assert(
  createSessionBlock.indexOf("mobileJwtSecret();") <
    createSessionBlock.indexOf("prisma.$transaction"),
  "JWT configuration must be validated before any existing mobile session is revoked.",
);
assert(
  createSessionBlock.includes("tx.mobileDeviceSession.updateMany") &&
    createSessionBlock.includes("tx.mobileDeviceSession.create"),
  "Replacing a device session must revoke and create inside one transaction.",
);

const mobileAuthApi = source("apps/mobile/src/api/auth-api.ts");
const loginRequestSource = mobileAuthApi.slice(
  mobileAuthApi.indexOf("export function loginRequest"),
  mobileAuthApi.indexOf("export function socialLoginRequest"),
);
assert(
  loginRequestSource.includes('"/api/mobile/auth/login"') &&
    loginRequestSource.includes("auth: false") &&
    loginRequestSource.includes("retry: false") &&
    !loginRequestSource.includes("hostFallback: false"),
  "Password login must keep HTTPS production-host fallback without request replay.",
);
assert(
  mobileAuthApi.includes('"/api/mobile/auth/mfa/verify"') &&
    mobileAuthApi.includes(
      "{ auth: false, retry: false, hostFallback: false }",
    ),
  "MFA verification must remain single-host and non-replayable.",
);

const secureStorage = source("apps/mobile/src/storage/secure-storage.ts");
assert(
  secureStorage.includes("PENDING_MFA_CHALLENGE_KEY") &&
    secureStorage.includes("WHEN_UNLOCKED_THIS_DEVICE_ONLY"),
  "A pending login challenge must survive restart in device-only secure storage.",
);
const pendingChallengeBlock = secureStorage.slice(
  secureStorage.indexOf("export async function savePendingMfaChallenge"),
  secureStorage.indexOf("export async function readPendingMfaChallenge"),
);
assert(
  pendingChallengeBlock.includes("if (challenge.mfaSetupRequired)"),
  "Enrollment QR and setup secrets must not be persisted as a recoverable login challenge.",
);
for (const forbidden of ["password:", "code:", "qrCodeDataUrl:", "secret:"]) {
  assert(
    !pendingChallengeBlock.includes(forbidden),
    `Pending challenge storage must not persist ${forbidden.replace(":", "")}.`,
  );
}

const loginScreen = source("apps/mobile/src/screens/auth/login-screen.tsx");
assert(
  loginScreen.includes("readPendingMfaChallenge"),
  "The Android login screen must restore an unexpired MFA challenge after process restart.",
);
assert(
  loginScreen.includes("clearPendingMfaChallenge"),
  "The Android login screen must clear an abandoned MFA challenge.",
);

const app = source("apps/mobile/App.tsx");
assert(
  app.indexOf("<ErrorBoundary>") < app.indexOf("<AppContent />"),
  "The root error boundary must wrap hooks and providers that can fail during startup.",
);

const errorBoundary = source("apps/mobile/src/components/error-boundary.tsx");
assert(
  errorBoundary.includes("clearRecoverableAppCache"),
  "Retry must invalidate corrupt persisted query state before remounting the app.",
);
assert(
  errorBoundary.includes("clearMobileSessionState"),
  "Returning to login must remain an explicit, user-selected recovery action.",
);
assert(
  !errorBoundary.includes("useTranslation") &&
    !errorBoundary.includes("useTheme"),
  "The fatal fallback must not depend on providers that may have failed.",
);

const offlineQuery = source("apps/mobile/src/services/offline-query.tsx");
assert(
  offlineQuery.includes('buster: "logivya-query-cache-v2"'),
  "Persisted query cache must have a schema buster for safe upgrades.",
);

const statusRoute = source("src/app/api/auth/mfa/login/status/route.ts");
assert(
  statusRoute.includes("authNoStoreHeaders"),
  "MFA challenge restoration must never be cached.",
);
assert(
  statusRoute.includes('challenge.purpose !== "LOGIN"'),
  "Only ordinary login challenges may be restored.",
);
assert(
  !statusRoute.includes("secretEncrypted"),
  "Challenge restoration must not return encrypted TOTP material.",
);

const serverI18n = source("src/i18n/server.ts");
const localeRoute = source("src/app/api/locales/[locale]/route.ts");
const nextConfig = source("next.config.ts");
assert(
  serverI18n.includes('"packages", "locales"') &&
    localeRoute.includes('"packages", "locales"'),
  "Server-side authentication errors and locale responses must load the packaged locale source.",
);
assert(
  nextConfig.includes('"./packages/locales/**/*.json"'),
  "Serverless output tracing must include runtime locale dictionaries.",
);
assert(
  !serverI18n.includes('process.cwd(), "locales"') &&
    !localeRoute.includes('process.cwd(), "locales"'),
  "Runtime code must not reference the removed legacy locale directory.",
);

console.log("Authentication recovery regression contracts passed.");
