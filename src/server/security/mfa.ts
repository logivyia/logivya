import { createHmac, randomBytes } from "node:crypto";
import { generateSecret, generateURI, verifySync } from "otplib";
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

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
export const MFA_SETUP_TTL_MS = 10 * 60_000;
export const MFA_SETUP_MAX_ATTEMPTS = 5;

function encryptionKeyring(): EncryptionKeyring {
  const activeVersion = process.env.MFA_FIELD_ENCRYPTION_ACTIVE_VERSION || process.env.FIELD_ENCRYPTION_ACTIVE_VERSION || "v1";
  const keys: Record<string, Buffer> = {};

  for (const [name, value] of Object.entries(process.env)) {
    const dedicatedMatch = name.match(/^MFA_FIELD_ENCRYPTION_KEY_(.+)$/);
    if (dedicatedMatch && value) keys[dedicatedMatch[1].toLowerCase()] = Buffer.from(value, "base64url");
  }

  for (const [name, value] of Object.entries(process.env)) {
    const fallbackMatch = name.match(/^FIELD_ENCRYPTION_KEY_(.+)$/);
    if (fallbackMatch && value && !keys[fallbackMatch[1].toLowerCase()]) {
      keys[fallbackMatch[1].toLowerCase()] = Buffer.from(value, "base64url");
    }
  }

  if (!keys[activeVersion.toLowerCase()]) throw new Error("MFA_ENCRYPTION_NOT_CONFIGURED");
  return { activeVersion: activeVersion.toLowerCase(), keys };
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

function matchingTotpCounter(secretEncrypted: string, code: string, now = Date.now(), afterTimeStep?: number | null) {
  if (!/^\d{6}$/u.test(code)) return null;
  const secret = decryptSensitiveField(parseEncryptedField(secretEncrypted), encryptionKeyring());
  const result = verifySync({
    secret,
    token: code,
    strategy: "totp",
    algorithm: "sha1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    epoch: Math.floor(now / 1000),
    epochTolerance: TOTP_PERIOD_SECONDS,
    ...(afterTimeStep === null || afterTimeStep === undefined ? {} : { afterTimeStep }),
  });
  return result.valid && "timeStep" in result ? result.timeStep : null;
}

export async function createMfaEnrollment(email: string) {
  const secret = generateSecret({ length: 20 });
  const generatedUri = generateURI({
    issuer: "LOGIVYA",
    label: email,
    secret,
    algorithm: "sha1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
  });
  const otpauth = new URL(generatedUri);
  otpauth.searchParams.set("algorithm", "SHA1");
  otpauth.searchParams.set("digits", String(TOTP_DIGITS));
  otpauth.searchParams.set("period", String(TOTP_PERIOD_SECONDS));
  const otpauthUrl = otpauth.toString();
  return {
    secret,
    secretEncrypted: serializeEncryptedField(encryptSensitiveField(secret, encryptionKeyring())),
    otpauthUrl,
    qrCodeDataUrl: await QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: "M", margin: 1, width: 320 }),
  };
}

export async function createAndStoreMfaEnrollment(
  userId: string,
  email: string,
  options: { replacePending?: boolean } = {},
) {
  const enrollment = await createMfaEnrollment(email);
  const setupToken = randomBytes(48).toString("base64url");
  const setupTokenHash = hashOpaqueToken(setupToken);
  const setupExpiresAt = new Date(Date.now() + MFA_SETUP_TTL_MS);
  const now = new Date();
  const credential = await prisma.$transaction(async (tx) => {
    await tx.mfaCredential.updateMany({
      where: {
        userId,
        verifiedAt: null,
        revokedAt: null,
        OR: [{ setupExpiresAt: { lte: now } }, { setupExpiresAt: null }, { setupTokenHash: null }],
      },
      data: { revokedAt: now, setupKey: null, setupTokenHash: null },
    });
    const pending = await tx.mfaCredential.findFirst({
      where: { userId, verifiedAt: null, revokedAt: null, setupExpiresAt: { gt: now }, setupTokenHash: { not: null } },
      select: { id: true },
    });
    if (pending && !options.replacePending) throw new Error("TWO_FACTOR_SETUP_IN_PROGRESS");
    if (pending) {
      await tx.mfaCredential.update({
        where: { id: pending.id },
        data: { revokedAt: now, setupKey: null, setupTokenHash: null },
      });
    }
    await tx.mfaCredential.updateMany({
      where: { userId, verifiedAt: null, revokedAt: null },
      data: { revokedAt: now, setupKey: null, setupTokenHash: null },
    });
    return tx.mfaCredential.create({
      data: {
        userId,
        type: "TOTP",
        secretEncrypted: enrollment.secretEncrypted,
        recoveryCodesHashed: [],
        setupTokenHash,
        setupKey: userId,
        setupExpiresAt,
      },
    });
  });
  return {
    credentialId: credential.id,
    setupToken,
    expiresAt: setupExpiresAt.toISOString(),
    secret: enrollment.secret,
    otpauthUrl: enrollment.otpauthUrl,
    qrCodeDataUrl: enrollment.qrCodeDataUrl,
  };
}

export async function pendingMfaEnrollmentStatus(userId: string) {
  const pending = await prisma.mfaCredential.findFirst({
    where: { userId, verifiedAt: null, revokedAt: null, setupTokenHash: { not: null }, setupExpiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { setupExpiresAt: true },
  });
  return { setupInProgress: Boolean(pending), setupExpiresAt: pending?.setupExpiresAt ?? null };
}

export async function cancelPendingMfaEnrollment(userId: string, setupToken?: string) {
  const now = new Date();
  const canceled = await prisma.mfaCredential.updateMany({
    where: {
      userId,
      verifiedAt: null,
      revokedAt: null,
      ...(setupToken ? { setupTokenHash: hashOpaqueToken(setupToken) } : {}),
    },
    data: { revokedAt: now, setupKey: null, setupTokenHash: null },
  });
  return canceled.count > 0;
}

export async function verifyPendingMfaEnrollment(input: { userId: string; setupToken: string; code: string }) {
  const now = new Date();
  const credential = await prisma.mfaCredential.findUnique({
    where: { setupTokenHash: hashOpaqueToken(input.setupToken) },
  });
  if (!credential || credential.userId !== input.userId || credential.verifiedAt || credential.revokedAt) {
    return { ok: false as const, reason: "TWO_FACTOR_SETUP_NOT_FOUND" as const };
  }
  if (!credential.setupExpiresAt || credential.setupExpiresAt <= now) {
    await prisma.mfaCredential.updateMany({
      where: { id: credential.id, verifiedAt: null, revokedAt: null },
      data: { revokedAt: now, setupKey: null, setupTokenHash: null },
    });
    return { ok: false as const, reason: "TWO_FACTOR_SETUP_EXPIRED" as const };
  }
  if ((credential.setupLockedUntil && credential.setupLockedUntil > now) || credential.setupAttempts >= MFA_SETUP_MAX_ATTEMPTS) {
    return { ok: false as const, reason: "TOO_MANY_TOTP_ATTEMPTS" as const };
  }

  const counter = matchingTotpCounter(credential.secretEncrypted, input.code.trim());
  if (counter === null) {
    const attempts = credential.setupAttempts + 1;
    await prisma.mfaCredential.updateMany({
      where: { id: credential.id, verifiedAt: null, revokedAt: null },
      data: {
        setupAttempts: { increment: 1 },
        ...(attempts >= MFA_SETUP_MAX_ATTEMPTS ? { setupLockedUntil: credential.setupExpiresAt } : {}),
      },
    });
    return {
      ok: false as const,
      reason: attempts >= MFA_SETUP_MAX_ATTEMPTS ? "TOO_MANY_TOTP_ATTEMPTS" as const : "INVALID_TOTP_CODE" as const,
      attemptsRemaining: Math.max(0, MFA_SETUP_MAX_ATTEMPTS - attempts),
    };
  }

  const recovery = createRecoveryCodeSet();
  await prisma.$transaction(async (tx) => {
    const activated = await tx.mfaCredential.updateMany({
      where: {
        id: credential.id,
        userId: input.userId,
        verifiedAt: null,
        revokedAt: null,
        setupTokenHash: hashOpaqueToken(input.setupToken),
        setupExpiresAt: { gt: now },
      },
      data: {
        verifiedAt: now,
        lastUsedCounter: counter,
        setupTokenHash: null,
        setupKey: null,
        setupExpiresAt: null,
        setupAttempts: 0,
        setupLockedUntil: null,
        recoveryCodesGeneratedAt: now,
      },
    });
    if (activated.count !== 1) throw new Error("TWO_FACTOR_SETUP_NOT_FOUND");
    await tx.mfaCredential.updateMany({
      where: { userId: input.userId, id: { not: credential.id }, revokedAt: null },
      data: { revokedAt: now, setupKey: null, setupTokenHash: null },
    });
    await tx.twoFactorRecoveryCode.createMany({
      data: recovery.recoveryCodesHashed.map((codeHash) => ({ userId: input.userId, credentialId: credential.id, codeHash })),
    });
    await tx.user.update({
      where: { id: input.userId },
      data: { mfaRequired: true, mfaRequiredAt: now },
    });
  });
  return {
    ok: true as const,
    method: "TOTP" as const,
    credentialId: credential.id,
    recoveryCodes: recovery.recoveryCodes,
  };
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
    await tx.mfaCredential.update({
      where: { id: credential.id },
      data: { recoveryCodesHashed: [], recoveryCodesGeneratedAt: new Date() },
    });
  });
  return set.recoveryCodes;
}

export function verifyTotp(secretEncrypted: string, code: string) {
  return matchingTotpCounter(secretEncrypted, code.trim()) !== null;
}

export async function verifyAndConsumeMfaCode(input: {
  userId: string;
  code: string;
  allowRecoveryCode?: boolean;
}) {
  const credential = await prisma.mfaCredential.findFirst({
    where: {
      userId: input.userId,
      revokedAt: null,
      verifiedAt: { not: null },
    },
    orderBy: { createdAt: "desc" },
    include: { recoveryCodes: true },
  });
  if (!credential) return { ok: false as const, reason: "MFA_NOT_ENROLLED" as const };

  const code = input.code.trim();
  const counter = matchingTotpCounter(credential.secretEncrypted, code, Date.now(), credential.lastUsedCounter);
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

  if (input.allowRecoveryCode === false) return { ok: false as const, reason: "INVALID_TOTP_CODE" as const };

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
