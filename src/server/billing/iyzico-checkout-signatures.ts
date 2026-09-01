import { createHmac, timingSafeEqual } from "node:crypto";

function secureEqual(actual: string, expected: string) {
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createIyzicoResponseSignature(secretKey: string, values: Array<string | number>) {
  return createHmac("sha256", secretKey)
    .update(values.map(String).join(":"), "utf8")
    .digest("hex");
}

export function verifyIyzicoResponseSignature(
  secretKey: string,
  signature: string,
  values: Array<string | number>,
) {
  const normalized = signature.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(normalized)) return false;
  return secureEqual(normalized, createIyzicoResponseSignature(secretKey, values));
}

export function createIyzicoCallbackState(
  secretKey: string,
  paymentId: string,
  expiresAtEpochSeconds: number,
) {
  const payload = `${paymentId}.${expiresAtEpochSeconds}`;
  const signature = createHmac("sha256", secretKey)
    .update(`logivya:iyzico:callback:v1:${payload}`, "utf8")
    .digest("base64url");
  return Buffer.from(`${payload}.${signature}`, "utf8").toString("base64url");
}

export function verifyIyzicoCallbackState(
  secretKey: string,
  state: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
) {
  if (!/^[A-Za-z0-9_-]+$/u.test(state) || state.length > 1_024) return null;
  let decoded: string;
  try {
    const encoded = Buffer.from(state, "base64url");
    if (encoded.toString("base64url") !== state) return null;
    decoded = encoded.toString("utf8");
  } catch {
    return null;
  }
  const segments = decoded.split(".");
  if (segments.length !== 3) return null;
  const [paymentId, rawExpiry, actualSignature] = segments;
  const expiresAtEpochSeconds = Number(rawExpiry);
  if (
    !paymentId
    || !actualSignature
    || !Number.isInteger(expiresAtEpochSeconds)
    || expiresAtEpochSeconds < nowEpochSeconds
    || expiresAtEpochSeconds > nowEpochSeconds + 60 * 60
  ) return null;
  const expected = createHmac("sha256", secretKey)
    .update(`logivya:iyzico:callback:v1:${paymentId}.${rawExpiry}`, "utf8")
    .digest("base64url");
  return secureEqual(actualSignature, expected)
    ? { paymentId, expiresAtEpochSeconds }
    : null;
}
