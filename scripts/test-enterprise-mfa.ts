import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

process.env.FIELD_ENCRYPTION_ACTIVE_VERSION = "v1";
process.env.FIELD_ENCRYPTION_KEY_V1 = randomBytes(32).toString("base64url");
process.env.MFA_RECOVERY_CODE_PEPPER = randomBytes(32).toString("base64url");

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(value: string) {
  let bits = "";
  for (const character of value) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function currentTotp(secret: string) {
  const counter = Math.floor(Date.now() / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const { createMfaEnrollment, verifyTotp } = await import("../src/server/security/mfa");
  const enrollment = await createMfaEnrollment("security-test@logivya.invalid");
  assert(/^[A-Z2-7]{32}$/u.test(enrollment.secret), "TOTP secret must contain 160 bits encoded as Base32");
  assert(enrollment.otpauthUrl.startsWith("otpauth://totp/Logivya:"), "otpauth URI is missing");
  assert(enrollment.otpauthUrl.includes("digits=6&period=30"), "RFC 6238 parameters are incorrect");
  assert(enrollment.qrCodeDataUrl.startsWith("data:image/png;base64,"), "QR data URL is missing");
  assert(enrollment.recoveryCodes.length === 10, "Exactly ten recovery codes are required");
  assert(enrollment.recoveryCodes.every((code) => code.replaceAll("-", "").length === 32), "Recovery codes must carry 128 bits of entropy");
  assert(new Set(enrollment.recoveryCodes).size === 10, "Recovery codes must be unique");
  assert(verifyTotp(enrollment.secretEncrypted, currentTotp(enrollment.secret)), "A standards-compliant current TOTP must verify");
  assert(!verifyTotp(enrollment.secretEncrypted, "000000") || currentTotp(enrollment.secret) === "000000", "An unrelated TOTP must fail");

  const webLogin = readFileSync(resolve("src/app/api/auth/login/route.ts"), "utf8");
  const mobileLogin = readFileSync(resolve("src/app/api/mobile/auth/login/route.ts"), "utf8");
  const webSession = readFileSync(resolve("src/server/auth/session.ts"), "utf8");
  const mobileSession = readFileSync(resolve("src/server/mobile/auth.ts"), "utf8");
  const migration = readFileSync(resolve("prisma/migrations/20260715090000_enterprise_totp_2fa/migration.sql"), "utf8");
  assert(webLogin.indexOf("issueMfaChallenge") < webLogin.indexOf("createSession(user.id"), "Web login must challenge before creating a session");
  assert(mobileLogin.indexOf("issueMfaChallenge({") < mobileLogin.indexOf("const tokens = await createMobileSession"), "Mobile login must challenge before creating a session");
  assert(webSession.includes("session.user.mfaRequired && !session.mfaVerifiedAt"), "Web API sessions must enforce completed MFA");
  assert(mobileSession.includes("session.user.mfaRequired && !session.mfaVerifiedAt"), "Mobile API sessions must enforce completed MFA");
  assert(mobileSession.includes("existing.user.mfaRequired && !existing.mfaVerifiedAt"), "Mobile refresh must not bypass MFA");
  assert(migration.includes('"lastUsedCounter"'), "Replay-prevention counter migration is missing");
  assert(!/\bDROP\s+(TABLE|COLUMN)\b/iu.test(migration), "MFA migration must not destroy existing data");

  console.log("Enterprise MFA contracts passed: RFC6238, entropy, pre-session gates, replay persistence, and additive migration.");
}

void main();
