import { createHash, createHmac } from "node:crypto";

import {
  decryptSensitiveField,
  encryptSensitiveField,
  parseEncryptedField,
  serializeEncryptedField,
  type EncryptionKeyring,
} from "@/server/security/encryption";

function privacySecret() {
  const value = process.env.TRIAL_IDENTITY_HASH_KEY || process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("TRIAL_IDENTITY_HASH_KEY_NOT_CONFIGURED");
  return value;
}

function privacyKeyring(): EncryptionKeyring {
  const activeVersion = (process.env.FIELD_ENCRYPTION_ACTIVE_VERSION || "v1").toLowerCase();
  const configured = process.env[`FIELD_ENCRYPTION_KEY_${activeVersion.toUpperCase()}`];
  const fallback = process.env.TRIAL_FIELD_ENCRYPTION_KEY || process.env.SESSION_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!configured && !fallback) throw new Error("PRIVATE_FIELD_ENCRYPTION_NOT_CONFIGURED");
  const key = configured ? Buffer.from(configured, "base64url") : createHash("sha256").update(fallback || "").digest();
  if (key.length !== 32) throw new Error("PRIVATE_FIELD_ENCRYPTION_NOT_CONFIGURED");
  return { activeVersion, keys: { [activeVersion]: key } };
}

export function keyedPrivateHash(purpose: string, value: string) {
  const normalized = value.trim().toLowerCase();
  return createHmac("sha256", privacySecret()).update(`${purpose}\0${normalized}`).digest("base64url");
}

export function encryptPrivateValue(value: string) {
  return serializeEncryptedField(encryptSensitiveField(value, privacyKeyring()));
}

export function decryptPrivateValue(value: string) {
  return decryptSensitiveField(parseEncryptedField(value), privacyKeyring());
}
