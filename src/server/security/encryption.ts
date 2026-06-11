import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedSensitiveField = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: string;
};
export type EncryptionKeyring = { activeVersion: string; keys: Record<string, Buffer> };

export function encryptSensitiveField(value: string, keyring: EncryptionKeyring): EncryptedSensitiveField {
  const key = keyring.keys[keyring.activeVersion];
  if (!key || key.length !== 32) throw new Error("Active AES-256-GCM encryption key is missing or invalid");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    keyVersion: keyring.activeVersion,
  };
}

export function decryptSensitiveField(field: EncryptedSensitiveField, keyring: EncryptionKeyring) {
  const key = keyring.keys[field.keyVersion];
  if (!key || key.length !== 32) throw new Error(`Encryption key version unavailable: ${field.keyVersion}`);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(field.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(field.authTag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(field.ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function serializeEncryptedField(field: EncryptedSensitiveField) { return JSON.stringify(field); }
export function parseEncryptedField(value: string): EncryptedSensitiveField { return JSON.parse(value) as EncryptedSensitiveField; }
