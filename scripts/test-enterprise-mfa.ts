import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

process.env.MFA_FIELD_ENCRYPTION_ACTIVE_VERSION = "v1";
process.env.MFA_FIELD_ENCRYPTION_KEY_V1 = randomBytes(32).toString("base64url");
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
  assert(/^otpauth:\/\/totp\/LOGIVYA:/iu.test(enrollment.otpauthUrl), "otpauth URI is missing");
  const otpParameters = new URL(enrollment.otpauthUrl).searchParams;
  assert(otpParameters.get("digits") === "6" && otpParameters.get("period") === "30", "RFC 6238 parameters are incorrect");
  assert(enrollment.qrCodeDataUrl.startsWith("data:image/png;base64,"), "QR data URL is missing");
  assert(!("recoveryCodes" in enrollment), "Recovery codes must not be disclosed before the first TOTP verification");
  assert(verifyTotp(enrollment.secretEncrypted, currentTotp(enrollment.secret)), "A standards-compliant current TOTP must verify");
  assert(!verifyTotp(enrollment.secretEncrypted, "000000") || currentTotp(enrollment.secret) === "000000", "An unrelated TOTP must fail");

  const webLogin = readFileSync(resolve("src/app/api/auth/login/route.ts"), "utf8");
  const mobileLogin = readFileSync(resolve("src/app/api/mobile/auth/login/route.ts"), "utf8");
  const webSession = readFileSync(resolve("src/server/auth/session.ts"), "utf8");
  const mobileSession = readFileSync(resolve("src/server/mobile/auth.ts"), "utf8");
  const enrollmentService = readFileSync(resolve("src/server/security/mfa.ts"), "utf8");
  const webEnroll = readFileSync(resolve("src/app/api/auth/mfa/enroll/route.ts"), "utf8");
  const webVerify = readFileSync(resolve("src/app/api/auth/mfa/verify/route.ts"), "utf8");
  const mobileEnroll = readFileSync(resolve("src/app/api/mobile/auth/mfa/enroll/route.ts"), "utf8");
  const mobileVerify = readFileSync(resolve("src/app/api/mobile/auth/mfa/confirm/route.ts"), "utf8");
  const baseMigration = readFileSync(resolve("prisma/migrations/20260715090000_enterprise_totp_2fa/migration.sql"), "utf8");
  const lifecycleMigration = readFileSync(resolve("prisma/migrations/20260719120000_totp_enrollment_lifecycle/migration.sql"), "utf8");
  assert(webLogin.indexOf("issueMfaChallenge") < webLogin.indexOf("createSession(user.id"), "Web login must challenge before creating a session");
  assert(mobileLogin.indexOf("issueMfaChallenge({") < mobileLogin.indexOf("const tokens = await createMobileSession"), "Mobile login must challenge before creating a session");
  assert(webSession.includes("session.user.mfaRequired && !session.mfaVerifiedAt"), "Web API sessions must enforce completed MFA");
  assert(mobileSession.includes("session.user.mfaRequired && !session.mfaVerifiedAt"), "Mobile API sessions must enforce completed MFA");
  assert(mobileSession.includes("existing.user.mfaRequired && !existing.mfaVerifiedAt"), "Mobile refresh must not bypass MFA");
  assert(enrollmentService.includes("setupTokenHash = hashOpaqueToken(setupToken)"), "Pending MFA setup tokens must be stored as hashes");
  assert(enrollmentService.includes("setupExpiresAt = new Date(Date.now() + MFA_SETUP_TTL_MS)"), "Pending MFA setup must expire");
  assert(enrollmentService.indexOf("const recovery = createRecoveryCodeSet()") > enrollmentService.indexOf("matchingTotpCounter(credential.secretEncrypted"), "Recovery codes must be generated only after a valid TOTP");
  assert(enrollmentService.includes("setupAttempts >= MFA_SETUP_MAX_ATTEMPTS"), "Enrollment brute-force protection is missing");
  assert(enrollmentService.includes("MFA_FIELD_ENCRYPTION_KEY_"), "MFA secrets must support a key isolated from WhatsApp session encryption");
  assert(webEnroll.includes("verifyPassword") && mobileEnroll.includes("verifyPassword"), "Web and mobile enrollment must confirm the password");
  assert(webVerify.includes("setupToken") && mobileVerify.includes("setupToken"), "Web and mobile verification must bind to the pending setup token");
  assert(baseMigration.includes('"lastUsedCounter"'), "Replay-prevention counter migration is missing");
  assert(lifecycleMigration.includes('"setupTokenHash"') && lifecycleMigration.includes('"setupExpiresAt"'), "Enrollment lifecycle migration is missing");
  assert(!/\bDROP\s+(TABLE|COLUMN)\b/iu.test(`${baseMigration}\n${lifecycleMigration}`), "MFA migrations must not destroy existing data");

  console.log("Enterprise MFA contracts passed: RFC6238, pending setup binding, post-verification recovery codes, pre-session gates, replay protection, and additive migrations.");
}

void main();
