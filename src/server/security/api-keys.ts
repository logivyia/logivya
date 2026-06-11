import { createHash, randomBytes } from "node:crypto";

export function createApiKey() {
  const secret = `lvy_${randomBytes(32).toString("base64url")}`;
  return { secret, keyPrefix: secret.slice(0, 12), keyHash: hashApiKey(secret) };
}
export function hashApiKey(secret: string) { return createHash("sha256").update(secret).digest("base64url"); }
export function rotateApiKey() { return createApiKey(); }
