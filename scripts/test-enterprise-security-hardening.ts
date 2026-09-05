import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const secret = "logivya-security-contract-test-secret-with-at-least-64-characters-2026";
process.env.MOBILE_JWT_SECRET = secret;

function read(file: string) {
  return readFileSync(path.join(root, file), "utf8");
}

function assertPermissionNotGranted(manifest: string, permission: string) {
  const escaped = permission.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declarations = manifest.match(new RegExp(`<uses-permission\\b[^>]*android:name=["']${escaped}["'][^>]*/?>`, "g")) ?? [];
  assert(
    declarations.every((declaration) => declaration.includes("tools:node=\"remove\"")),
    `${permission} must be absent or explicitly removed from the merged Android manifest.`,
  );
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signedToken(header: unknown, payload: unknown) {
  const body = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

async function main() {
const { createAccessToken, verifyAccessToken } = await import("../src/server/mobile/auth");
const { assertSafeExternalUrl } = await import("../src/server/security/urls");

const issued = createAccessToken({ userId: "user_123", companyId: "company_123", sessionId: "session_123", role: "OWNER" });
const verified = verifyAccessToken(issued.accessToken);
assert.equal(verified.iss, "logivya");
assert.equal(verified.aud, "logivya-mobile");
assert.equal(verified.typ, "mobile_access");
assert.ok(verified.jti.length >= 16);

const now = Math.floor(Date.now() / 1000);
const validPayload = { typ: "mobile_access", iss: "logivya", aud: "logivya-mobile", jti: "0123456789abcdef", sub: "user", companyId: "company", sessionId: "session", role: "OWNER", iat: now, exp: now + 900 };
assert.throws(() => verifyAccessToken(signedToken({ alg: "none", typ: "JWT" }, validPayload)), /UNAUTHORIZED/, "JWT algorithm confusion must be rejected.");
assert.throws(() => verifyAccessToken(signedToken({ alg: "HS256", typ: "JWT" }, { ...validPayload, exp: now - 1 })), /UNAUTHORIZED/, "Expired JWTs must be rejected.");
assert.throws(() => verifyAccessToken(signedToken({ alg: "HS256", typ: "JWT" }, { ...validPayload, aud: "other-client" })), /UNAUTHORIZED/, "Wrong JWT audience must be rejected.");
assert.throws(() => verifyAccessToken(signedToken({ alg: "HS256", typ: "JWT" }, { ...validPayload, iat: now + 120, exp: now + 900 })), /UNAUTHORIZED/, "Future-issued JWTs must be rejected.");
assert.throws(() => verifyAccessToken(signedToken({ alg: "HS256", typ: "JWT" }, { ...validPayload, exp: now + 901 })), /UNAUTHORIZED/, "Access-token lifetime escalation must be rejected.");

assert.equal(assertSafeExternalUrl("https://example.com/hook").hostname, "example.com");
for (const unsafe of ["http://example.com", "https://localhost/hook", "https://127.0.0.1/hook", "https://10.0.0.1/hook", "https://[::1]/hook", "https://user:pass@example.com/hook"]) {
  assert.throws(() => assertSafeExternalUrl(unsafe), undefined, `SSRF-sensitive URL must be rejected: ${unsafe}`);
}

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260716170000_mobile_refresh_token_replay_detection/migration.sql");
const mobileAuth = read("src/server/mobile/auth.ts");
const sessions = read("src/server/auth/device-sessions.ts");
const proxy = read("src/proxy.ts");
const vercelIgnore = read(".vercelignore");
const manifest = read("apps/mobile/android/app/src/main/AndroidManifest.xml");
const secureStorage = read("apps/mobile/src/storage/secure-storage.ts");
const webCampaignRoute = read("src/app/api/campaigns/route.ts");
const mobileCampaignRoute = read("src/app/api/mobile/messages/send/route.ts");
const webDeleteRoute = read("src/app/api/messages/campaigns/[id]/delete-everyone/route.ts");
const mobileDeleteRoute = read("src/app/api/mobile/messages/history/[id]/delete-for-everyone/route.ts");

assert(schema.includes("model MobileRefreshTokenHistory"));
assert(migration.includes('CREATE TABLE "MobileRefreshTokenHistory"'));
assert(mobileAuth.includes("AUTH_REFRESH_TOKEN_REPLAY_DETECTED"));
assert(mobileAuth.includes("pg_advisory_xact_lock"));
assert(mobileAuth.includes("deviceFingerprint: replay.session.deviceId"));
assert(sessions.includes("where: { userId, revokedAt: null"), "Session list and revocation must be scoped to the authenticated user.");
assert(proxy.includes("isApiRequest && (hasSession || isWebLogin)") && proxy.includes("assertWebMutationOrigin(request)"), "Cookie-authenticated API mutations and login must enforce trusted-origin CSRF checks even with an Authorization header.");
assert(vercelIgnore.includes("/sessions"), "Only the repository-root session snapshot directory may be excluded from Vercel uploads.");
assert(!/^sessions$/m.test(vercelIgnore), "Vercel uploads must not exclude API session routes.");
assertPermissionNotGranted(manifest, "android.permission.READ_EXTERNAL_STORAGE");
assertPermissionNotGranted(manifest, "android.permission.WRITE_EXTERNAL_STORAGE");
assert(!manifest.includes("android.permission.SYSTEM_ALERT_WINDOW"));
assert(manifest.includes('android:allowBackup="false"'));
assert(manifest.includes('android:usesCleartextTraffic="false"'));
assert(secureStorage.includes("WHEN_UNLOCKED_THIS_DEVICE_ONLY"));
assert(webCampaignRoute.includes('scope: "message.campaign.create"'));
assert(mobileCampaignRoute.includes('scope: "message.campaign.create"'));
assert(webDeleteRoute.includes('scope: "message.delete-everyone"'));
assert(mobileDeleteRoute.includes('scope: "message.delete-everyone"'));

console.log("Enterprise security hardening contracts passed: JWT, refresh replay, session ownership, CSRF, SSRF, Android permissions, and secure storage.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
