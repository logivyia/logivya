import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  APP_LOCK_HASH_ROUNDS,
  getAppLockBlockDurationMs,
  isValidAppLockPin,
  shouldLockAfterBackground,
} from "../apps/mobile/src/security/app-lock-policy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(path: string) {
  return readFileSync(resolve(path), "utf8");
}

const storage = source("apps/mobile/src/security/app-lock-storage.ts");
const store = source("apps/mobile/src/security/app-lock-store.ts");
const gate = source("apps/mobile/src/security/app-lock-gate.tsx");
const settings = source("apps/mobile/src/security/mobile-app-lock-settings.tsx");
const auditClient = source("apps/mobile/src/security/app-lock-audit.ts");
const auditRoute = source("src/app/api/mobile/security/app-lock/events/route.ts");
const notifications = source("apps/mobile/src/services/notifications.ts");
const notificationService = source("src/server/notifications/service.ts");
const appConfig = JSON.parse(source("apps/mobile/app.json")) as { expo?: { plugins?: unknown[] } };
const packageJson = JSON.parse(source("apps/mobile/package.json")) as { dependencies?: Record<string, string> };
const policy = source("src/server/security/mfa-policy.ts");
const optionalMfaTest = source("scripts/test-optional-mfa-policy.ts");

assert(isValidAppLockPin("123456"), "A six-digit PIN must be accepted");
for (const invalid of ["12345", "1234567", "abcdef", "12 456", "１２３４５６"]) {
  assert(!isValidAppLockPin(invalid), `Invalid PIN must be rejected: ${invalid}`);
}

assert(APP_LOCK_HASH_ROUNDS >= 100, "The local PIN verifier must use repeated hashing");
assert(getAppLockBlockDurationMs(4) === 0, "Early failed attempts must not claim a block");
assert(getAppLockBlockDurationMs(5) >= 30_000, "Repeated PIN failures must trigger a temporary block");
assert(getAppLockBlockDurationMs(10) > getAppLockBlockDurationMs(5), "Brute-force blocks must escalate");
assert(!shouldLockAfterBackground(Date.now() - 30_000, Date.now(), 60), "App must remain unlocked inside the configured grace period");
assert(shouldLockAfterBackground(Date.now() - 61_000, Date.now(), 60), "App must lock after the configured grace period");
assert(shouldLockAfterBackground(Date.now(), Date.now(), 0), "Immediate mode must lock whenever the app backgrounds");

assert(storage.includes("expo-secure-store"), "App lock state must use the native secure store");
assert(storage.includes("WHEN_UNLOCKED_THIS_DEVICE_ONLY"), "App lock state must be device-only and unavailable while locked");
assert(storage.includes("Crypto.getRandomBytesAsync(32)"), "PIN hashing must use a random salt");
assert(storage.includes("Crypto.CryptoDigestAlgorithm.SHA256"), "PIN verifier must be cryptographically hashed");
assert(storage.includes("constantTimeEqual"), "PIN verifier comparison must be timing resistant");
assert(storage.includes("parsed.userId !== userId"), "Local app lock must be bound to the authenticated user");
assert(storage.includes("storageKeyForUser") && storage.includes("userHash.slice"), "Each local account must receive an isolated secure-store key");
assert(!storage.includes('"pin":'), "Plaintext PIN must never be persisted");

assert(store.includes('biometricsSecurityLevel: "strong"'), "Biometric unlock must require strong biometrics");
assert(store.includes("disableDeviceFallback: true"), "OS passcode fallback must not bypass the Logivya PIN");
assert(store.includes("initializationFailed") && store.includes("locked: true"), "Secure-store initialization failures must fail closed");
assert(gate.includes("AppState.addEventListener"), "App lifecycle changes must drive auto-lock");
assert(gate.includes("storeUserId !== userId"), "Authenticated content must remain covered until the current user's lock state is loaded");
assert(gate.includes("enableAppSwitcherProtectionAsync"), "App previews must support app-switcher privacy");
assert(gate.includes("preventScreenCaptureAsync"), "The locked screen must block screen capture");
assert(gate.includes("resetForAccountRecovery") && gate.includes("clearMobileSessionState"), "Forgot PIN must clear the local lock and require account sign-in");
assert(settings.includes("Mobile app lock") && settings.includes("6-digit PIN"), "Security Center must expose app-lock controls");

assert(auditClient.includes("/api/mobile/security/app-lock/events"), "App-lock changes must be sent to the security audit endpoint");
assert(auditRoute.includes("requireMobileAuth") && auditRoute.includes("tryRecordSecurityEvent"), "App-lock audit events must be authenticated and centrally recorded");
assert(auditRoute.includes("enforceOperationRateLimit"), "App-lock audit endpoint must be rate limited");
for (const forbidden of ["pinHash", "salt", "currentPin", "nextPin", "biometricTemplate"]) {
  assert(!auditRoute.includes(forbidden), `Security audit endpoint must not accept ${forbidden}`);
}

assert(notifications.includes("AndroidNotificationVisibility.PRIVATE"), "Android notifications must hide sensitive lock-screen content");
assert(notificationService.match(/body: input\.message/g)?.length === 2, "Both push delivery paths must preserve the localized notification copy");
assert((notificationService.match(/notificationId: input\.notificationId/g)?.length ?? 0) >= 2, "Both push delivery paths must carry the canonical notification identifier for secure in-app resolution");
assert(packageJson.dependencies?.["expo-local-authentication"], "Native biometric dependency is missing");
assert(packageJson.dependencies?.["expo-crypto"], "Native cryptography dependency is missing");
assert(JSON.stringify(appConfig.expo?.plugins).includes("expo-local-authentication"), "Face ID permission plugin is missing");

assert(policy.includes('"TOTP"') && policy.includes('"EMAIL_OTP"'), "TOTP and email OTP must remain supported");
assert(!policy.includes('"SMS"'), "SMS must not be an MFA method");
assert(optionalMfaTest.includes("Password-only login") && optionalMfaTest.includes("SMS must not be part"), "Optional MFA and no-SMS acceptance coverage must remain active");

console.log("Mobile app-lock security contracts passed: 38 checks verified.");
