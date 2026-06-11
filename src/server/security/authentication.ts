import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const PASSWORD_POLICY = { minLength: 12, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSymbol: true } as const;
export function validateStrongPassword(password: string) {
  return password.length >= PASSWORD_POLICY.minLength && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}
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
