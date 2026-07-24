import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";

import { prisma } from "@/server/db";
import { hashOpaqueToken } from "@/server/security/authentication";
import {
  decryptSensitiveField,
  encryptSensitiveField,
  parseEncryptedField,
  serializeEncryptedField,
  type EncryptionKeyring,
} from "@/server/security/encryption";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

function encryptionKeyring(): EncryptionKeyring {
  const activeVersion = process.env.FIELD_ENCRYPTION_ACTIVE_VERSION || "v1";
  const keys: Record<string, Buffer> = {};

  for (const [name, value] of Object.entries(process.env)) {
    const match = name.match(/^FIELD_ENCRYPTION_KEY_(.+)$/);
    if (match && value) keys[match[1].toLowerCase()] = Buffer.from(value, "base64url");
  }

  if (!keys[activeVersion.toLowerCase()]) throw new Error("MFA_ENCRYPTION_NOT_CONFIGURED");
  return { activeVersion: activeVersion.toLowerCase(), keys };
}

function encodeBase32(bytes: Buffer) {
  let bits = "";
  let output = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  for (let index = 0; index < bits.length; index += 5) {
    output += BASE32_ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return output;
}

function decodeBase32(value: string) {
  let bits = "";
  for (const character of value.replace(/=+$/u, "").toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("MFA_SECRET_INVALID");
    bits += index.toString(2).padStart(5, "0");
  }
  const output: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    output.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(output);
}

function normalizedRecoveryCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

function recoveryPeppers() {
  const peppers = [process.env.MFA_RECOVERY_CODE_PEPPER, process.env.PASSWORD_PEPPER].filter(
    (value): value is string => Boolean(value),
  );
  const unique = [...new Set(peppers)];
  if (!unique.length) throw new Error("MFA_RECOVERY_PEPPER_NOT_CONFIGURED");
  return unique;
}

function hashRecoveryCodeWithPepper(value: string, pepper: string) {
  return createHmac("sha256", pepper).update(normalizedRecoveryCode(value)).digest("base64url");
}

export function hashRecoveryCode(value: string) {
  return hashRecoveryCodeWithPepper(value, recoveryPeppers()[0]);
}

function legacyRecoveryHash(value: string) {
  return hashOpaqueToken(value.trim().toUpperCase());
}

function formatRecoveryCode(bytes: Buffer) {
  return bytes.toString("hex").toUpperCase().match(/.{1,4}/gu)?.join("-") ?? bytes.toString("hex").toUpperCase();
}

function createRecoveryCodeSet() {
  const recoveryCodes = Array.from({ length: 10 }, () => formatRecoveryCode(randomBytes(16)));
  return { recoveryCodes, recoveryCodesHashed: recoveryCodes.map(hashRecoveryCode) };
}

function totpForCounter(secret: string, counter: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** TOTP_DIGITS);
  return number.toString().padStart(TOTP_DIGITS, "0");
}

function constantTimeCodeEqual(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function matchingTotpCounter(secretEncrypted: string | null, code: string, now = Date.now()) {
  if (!secretEncrypted || !/^\d{6}$/u.test(code)) return null;
  const secret = decryptSensitiveField(parseEncryptedField(secretEncrypted), encryptionKeyring());
  const currentCounter = Math.floor(now / (TOTP_PERIOD_SECONDS * 1000));
  for (const offset of [0, -1, 1]) {
    const counter = currentCounter + offset;
    if (constantTimeCodeEqual(code, totpForCounter(secret, counter))) return counter;
  }
  return null;
}

export async function createMfaEnrollment(email: string) {
  const secret = encodeBase32(randomBytes(20));
  const { recoveryCodes, recoveryCodesHashed } = createRecoveryCodeSet();
  const otpauthUrl = `otpauth://totp/Logivya:${encodeURIComponent(email)}?secret=${secret}&issuer=Logivya&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
  return {
    secret,
    recoveryCodes,
    recoveryCodesHashed,
    secretEncrypted: serializeEncryptedField(encryptSensitiveField(secret, encryptionKeyring())),
    otpauthUrl,
    qrCodeDataUrl: await QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: "M", margin: 1, width: 320 }),
  };
}

export async function createAndStoreMfaEnrollment(userId: string, email: string) {
  const enrollment = await createMfaEnrollment(email);
  const credential = await prisma.$transaction(async (tx) => {
    await tx.mfaCredential.updateMany({
      where: { userId, verifiedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return tx.mfaCredential.create({
      data: {
        userId,
        type: "TOTP",
        secretEncrypted: enrollment.secretEncrypted,
        recoveryCodesHashed: [],
        recoveryCodes: {
          create: enrollment.recoveryCodesHashed.map((codeHash) => ({ userId, codeHash })),
        },
      },
    });
  });
  return {
    credentialId: credential.id,
    secret: enrollment.secret,
    otpauthUrl: enrollment.otpauthUrl,
    qrCodeDataUrl: enrollment.qrCodeDataUrl,
    recoveryCodes: enrollment.recoveryCodes,
  };
}

export async function activateMfaCredential(userId: string, credentialId: string) {
  const now = new Date();
  await prisma.$transaction([
    prisma.mfaCredential.updateMany({
      where: { userId, id: { not: credentialId }, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.mfaCredential.update({
      where: { id: credentialId },
      data: { verifiedAt: now, revokedAt: null },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { mfaRequired: true, mfaRequiredAt: now },
    }),
  ]);
}

export async function replaceRecoveryCodes(userId: string) {
  const credential = await prisma.mfaCredential.findFirst({
    where: { userId, verifiedAt: { not: null }, revokedAt: null },
    orderBy: { verifiedAt: "desc" },
  });
  if (!credential) throw new Error("MFA_NOT_ENROLLED");
  const set = createRecoveryCodeSet();
  await prisma.$transaction(async (tx) => {
    await tx.twoFactorRecoveryCode.deleteMany({ where: { credentialId: credential.id } });
    await tx.twoFactorRecoveryCode.createMany({
      data: set.recoveryCodesHashed.map((codeHash) => ({ userId, credentialId: credential.id, codeHash })),
    });
    await tx.mfaCredential.update({ where: { id: credential.id }, data: { recoveryCodesHashed: [] } });
  });
  return set.recoveryCodes;
}

export function verifyTotp(secretEncrypted: string | null, code: string) {
  return matchingTotpCounter(secretEncrypted, code.trim()) !== null;
}

export async function verifyAndConsumeMfaCode(input: {
  userId: string;
  code: string;
  allowUnverifiedCredential?: boolean;
}) {
  const credential = await prisma.mfaCredential.findFirst({
    where: {
      userId: input.userId,
      revokedAt: null,
      ...(input.allowUnverifiedCredential ? {} : { verifiedAt: { not: null } }),
    },
    orderBy: { createdAt: "desc" },
    include: { recoveryCodes: true },
  });
  if (!credential) return { ok: false as const, reason: "MFA_NOT_ENROLLED" as const };

  const code = input.code.trim();
  const counter = matchingTotpCounter(credential.secretEncrypted, code);
  if (counter !== null) {
    const updated = await prisma.mfaCredential.updateMany({
      where: {
        id: credential.id,
        revokedAt: null,
        OR: [{ lastUsedCounter: null }, { lastUsedCounter: { lt: counter } }],
      },
      data: { lastUsedCounter: counter, verifiedAt: credential.verifiedAt ?? new Date() },
    });
    if (updated.count === 1) return { ok: true as const, method: "TOTP" as const, credentialId: credential.id };
    return { ok: false as const, reason: "MFA_CODE_REUSED" as const };
  }

  const normalized = normalizedRecoveryCode(code);
  if (normalized.length < 16) return { ok: false as const, reason: "MFA_INVALID" as const };
  const hashes = [
    ...recoveryPeppers().map((pepper) => hashRecoveryCodeWithPepper(code, pepper)),
    legacyRecoveryHash(code),
  ];
  const recoveryCode = credential.recoveryCodes.find((item) => !item.usedAt && hashes.includes(item.codeHash));
  if (recoveryCode) {
    const consumed = await prisma.twoFactorRecoveryCode.updateMany({
      where: { id: recoveryCode.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 1) {
      await prisma.mfaCredential.update({ where: { id: credential.id }, data: { verifiedAt: credential.verifiedAt ?? new Date() } });
      return { ok: true as const, method: "RECOVERY" as const, credentialId: credential.id };
    }
    return { ok: false as const, reason: "MFA_CODE_REUSED" as const };
  }

  const legacyHash = hashes.find((hash) => credential.recoveryCodesHashed.includes(hash));
  if (legacyHash) {
    const remaining = credential.recoveryCodesHashed.filter((hash) => hash !== legacyHash);
    const consumed = await prisma.mfaCredential.updateMany({
      where: { id: credential.id, revokedAt: null, recoveryCodesHashed: { has: legacyHash } },
      data: { recoveryCodesHashed: remaining, verifiedAt: credential.verifiedAt ?? new Date() },
    });
    if (consumed.count === 1) return { ok: true as const, method: "RECOVERY" as const, credentialId: credential.id };
  }

  return { ok: false as const, reason: "MFA_INVALID" as const };
}
