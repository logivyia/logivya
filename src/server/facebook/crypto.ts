import "server-only";

import {
  decryptSensitiveField,
  encryptSensitiveField,
  parseEncryptedField,
  serializeEncryptedField,
  type EncryptionKeyring,
} from "@/server/security/encryption";

function facebookTokenKeyring(): EncryptionKeyring {
  const activeVersion = (process.env.FACEBOOK_TOKEN_KEY_ACTIVE_VERSION || "v1").toLowerCase();
  const encoded = process.env[`FACEBOOK_TOKEN_KEY_${activeVersion.toUpperCase()}`]?.trim();
  if (!encoded) throw new Error("FACEBOOK_TOKEN_ENCRYPTION_KEY_NOT_CONFIGURED");
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32) throw new Error("FACEBOOK_TOKEN_ENCRYPTION_KEY_NOT_CONFIGURED");
  return { activeVersion, keys: { [activeVersion]: key } };
}

export function encryptFacebookToken(value: string) {
  return serializeEncryptedField(encryptSensitiveField(value, facebookTokenKeyring()));
}

export function decryptFacebookToken(value: string) {
  return decryptSensitiveField(parseEncryptedField(value), facebookTokenKeyring());
}
