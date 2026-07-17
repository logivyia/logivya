import { decryptPrivateValue, encryptPrivateValue } from "@/server/security/private-fields";

export function encryptPushToken(token: string) {
  return encryptPrivateValue(token);
}

export function decryptPushToken(storedValue: string) {
  if (!storedValue.trim().startsWith("{")) return storedValue;
  try {
    return decryptPrivateValue(storedValue);
  } catch {
    throw new Error("PUSH_TOKEN_DECRYPTION_FAILED");
  }
}

export function isEncryptedPushToken(storedValue: string) {
  if (!storedValue.trim().startsWith("{")) return false;
  try {
    const parsed = JSON.parse(storedValue) as Record<string, unknown>;
    return typeof parsed.ciphertext === "string" && typeof parsed.iv === "string" && typeof parsed.authTag === "string" && typeof parsed.keyVersion === "string";
  } catch {
    return false;
  }
}
