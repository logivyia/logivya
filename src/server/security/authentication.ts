import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export {
  isValidPassword,
  MIN_PASSWORD_LENGTH,
  passwordCharacterCount,
  validatePasswordPolicy,
} from "@logivya/validation/password-policy";
export function hashOpaqueToken(token: string) { return createHash("sha256").update(token).digest("base64url"); }
export function createExpiringToken(ttlMinutes: number) {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashOpaqueToken(token), expiresAt: new Date(Date.now() + ttlMinutes * 60_000) };
}
export function verifyOpaqueToken(token: string, expectedHash: string) {
  const actual = Buffer.from(hashOpaqueToken(token));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function progressiveLockoutMinutes(failedAttempts: number) {
  if (failedAttempts < 5) return 0;
  return Math.min(2 ** (failedAttempts - 5), 240);
}
