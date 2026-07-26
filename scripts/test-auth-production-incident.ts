import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function read(file: string) {
  return readFileSync(path.join(root, file), "utf8");
}

function decodeBase32(value: string) {
  let bits = "";
  for (const character of value) {
    const index = alphabet.indexOf(character);
    assert.notEqual(index, -1, "The generated TOTP secret must be valid Base32.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret: string, now = Date.now()) {
  const counter = Math.floor(now / 30_000);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

async function main() {
  const { activeTotpCredentialWhere, TOTP_CREDENTIAL_TYPE } = await import("../src/server/auth/mfa-credential-policy");
  assert.equal(TOTP_CREDENTIAL_TYPE, "TOTP");
  assert.deepEqual(activeTotpCredentialWhere("user-1"), {
    userId: "user-1",
    type: "TOTP",
    revokedAt: null,
    verifiedAt: { not: null },
  });
  assert.deepEqual(activeTotpCredentialWhere("user-1", true), {
    userId: "user-1",
    type: "TOTP",
    revokedAt: null,
  });

  delete process.env.FIELD_ENCRYPTION_ACTIVE_VERSION;
  delete process.env.FIELD_ENCRYPTION_KEY_V1;
  process.env.MFA_FIELD_ENCRYPTION_ACTIVE_VERSION = "v1";
  process.env.MFA_FIELD_ENCRYPTION_KEY_V1 = randomBytes(32).toString("base64url");
  process.env.MFA_RECOVERY_CODE_PEPPER = randomBytes(32).toString("base64url");

  const { createMfaEnrollment, verifyTotp } = await import("../src/server/security/mfa");
  const enrollment = await createMfaEnrollment("auth-incident@logivya.invalid");
  assert.equal(
    verifyTotp(enrollment.secretEncrypted, totp(enrollment.secret)),
    true,
    "The production MFA_FIELD_ENCRYPTION_* aliases must decrypt and verify a current TOTP.",
  );

  delete process.env.MFA_FIELD_ENCRYPTION_ACTIVE_VERSION;
  delete process.env.MFA_FIELD_ENCRYPTION_KEY_V1;
  process.env.FIELD_ENCRYPTION_ACTIVE_VERSION = "v1";
  process.env.FIELD_ENCRYPTION_KEY_V1 = randomBytes(32).toString("base64url");
  const legacyEnrollment = await createMfaEnrollment("legacy-auth-incident@logivya.invalid");

  process.env.MFA_FIELD_ENCRYPTION_ACTIVE_VERSION = "v1";
  process.env.MFA_FIELD_ENCRYPTION_KEY_V1 = randomBytes(32).toString("base64url");
  assert.equal(
    verifyTotp(legacyEnrollment.secretEncrypted, totp(legacyEnrollment.secret)),
    true,
    "A dedicated v1 key must not make existing legacy v1 MFA credentials unreadable.",
  );

  const webRoute = read("src/app/api/auth/mfa/login/verify/route.ts");
  const mobileRoute = read("src/app/api/mobile/auth/mfa/verify/route.ts");
  const mobileLoginRoute = read("src/app/api/mobile/auth/login/route.ts");
  const webSession = read("src/server/auth/session.ts");
  const mobileSession = read("src/server/mobile/auth.ts");
  const diagnostics = read("src/server/auth/diagnostics.ts");
  const mfaService = read("src/server/security/mfa.ts");
  const mfaChallenge = read("src/server/auth/mfa-challenge.ts");

  assert(!webRoute.includes("consumeMfaChallenge("), "Web MFA must not consume its challenge before session creation.");
  assert(!mobileRoute.includes("consumeMfaChallenge("), "Mobile MFA must not consume its challenge before session creation.");
  assert(webRoute.includes("mfaChallengeId: challenge.id"), "Web session creation must atomically consume the MFA challenge.");
  assert(mobileRoute.includes("mfaChallengeId: challenge.id"), "Mobile session creation must atomically consume the MFA challenge.");
  assert(webSession.includes("mfaLoginChallenge.updateMany"), "Web session persistence must include challenge consumption in its transaction.");
  assert(mobileSession.includes("mfaLoginChallenge.updateMany"), "Mobile session persistence must include challenge consumption in its transaction.");
  assert(diagnostics.includes("createHash(\"sha256\")"), "Authentication logs must use opaque user and challenge references.");
  assert(diagnostics.includes("AUTH_SESSION_CREATE_FAILED"), "Authentication diagnostics must expose a safe session-stage error code.");
  assert(!diagnostics.includes("totpCode"), "Authentication diagnostics must never log a TOTP code.");
  assert(!diagnostics.includes("refreshToken"), "Authentication diagnostics must never log a refresh token.");
  assert(mfaService.includes("activeTotpCredentialWhere"), "MFA verification must ignore active non-TOTP credentials.");
  assert(mfaChallenge.includes("activeTotpCredentialWhere"), "Login challenge detection must ignore active non-TOTP credentials.");
  assert(
    mobileLoginRoute.includes('availableMethods: ["TOTP"] as const'),
    "Android v151 MFA challenges must always include a render-safe availableMethods array.",
  );
  assert(
    mobileLoginRoute.includes('selectedMethod: "TOTP" as const'),
    "Android v151 must receive an immediately usable TOTP method instead of an empty method chooser.",
  );

  console.log("Production authentication incident contracts passed.");
}

void main();
