import { decryptSensitiveField, encryptSensitiveField, parseEncryptedField, serializeEncryptedField, type EncryptionKeyring } from "@/server/security/encryption";

function telegramKeyring(): EncryptionKeyring {
  const activeVersion = (process.env.TELEGRAM_SESSION_KEY_ACTIVE_VERSION || "v1").toLowerCase();
  const encoded = process.env[`TELEGRAM_SESSION_KEY_${activeVersion.toUpperCase()}`];
  if (!encoded) throw new Error("TELEGRAM_SESSION_ENCRYPTION_KEY_NOT_CONFIGURED");
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32) throw new Error("TELEGRAM_SESSION_ENCRYPTION_KEY_NOT_CONFIGURED");
  return { activeVersion, keys: { [activeVersion]: key } };
}

export function encryptTelegramDatabaseKey(value: string) {
  return serializeEncryptedField(encryptSensitiveField(value, telegramKeyring()));
}

export function decryptTelegramDatabaseKey(value: string) {
  const encoded = decryptSensitiveField(parseEncryptedField(value), telegramKeyring());
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32) throw new Error("TELEGRAM_DATABASE_ENCRYPTION_KEY_INVALID");
  // TDLib JSON represents `bytes` values as padded standard base64. Node's
  // base64url output is intentionally unpadded, which TDLib rejects with
  // "Wrong padding length" before the authorization flow can start.
  return key.toString("base64");
}
