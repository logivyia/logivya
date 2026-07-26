import { randomBytes } from "node:crypto";

import { activeTotpCredentialWhere } from "@/server/auth/mfa-credential-policy";
import { prisma } from "@/server/db";
import { hashOpaqueToken } from "@/server/security/authentication";

export const MFA_CHALLENGE_COOKIE = "logivya_mfa_challenge";
export const MFA_TRUSTED_DEVICE_COOKIE = "logivya_mfa_trusted_device";
export const MFA_CHALLENGE_TTL_MS = 10 * 60_000;
export const MFA_MAX_ATTEMPTS = 5;
export const MFA_TRUSTED_DEVICE_DAYS = 30;

export type MfaChallengeChannel = "WEB" | "MOBILE";
export type MfaChallengePurpose = "LOGIN" | "SETUP";

export function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function issueMfaChallenge(input: {
  userId: string;
  companyId: string;
  channel: MfaChallengeChannel;
  purpose?: MfaChallengePurpose;
  request: Request;
  deviceId?: string | null;
  platform?: string | null;
  appVersion?: string | null;
}) {
  const token = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + MFA_CHALLENGE_TTL_MS);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.mfaLoginChallenge.updateMany({
      where: { userId: input.userId, channel: input.channel, consumedAt: null },
      data: { consumedAt: now },
    });
    await tx.mfaLoginChallenge.create({
      data: {
        userId: input.userId,
        companyId: input.companyId,
        tokenHash: hashOpaqueToken(token),
        channel: input.channel,
        purpose: input.purpose ?? "LOGIN",
        deviceId: input.deviceId,
        platform: input.platform,
        appVersion: input.appVersion,
        ipAddress: requestIp(input.request),
        userAgent: input.request.headers.get("user-agent"),
        expiresAt,
      },
    });
  });

  return { token, expiresAt };
}

export async function readMfaChallenge(token: string, channel: MfaChallengeChannel) {
  const challenge = await prisma.mfaLoginChallenge.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: { user: true },
  });
  if (!challenge || challenge.channel !== channel || challenge.consumedAt || challenge.expiresAt <= new Date()) {
    throw new Error("MFA_CHALLENGE_INVALID");
  }
  if (challenge.attempts >= MFA_MAX_ATTEMPTS) throw new Error("MFA_CHALLENGE_LOCKED");
  return challenge;
}

export async function registerMfaChallengeFailure(challengeId: string) {
  const challenge = await prisma.mfaLoginChallenge.update({
    where: { id: challengeId },
    data: { attempts: { increment: 1 } },
    select: { attempts: true },
  });
  if (challenge.attempts >= MFA_MAX_ATTEMPTS) {
    await prisma.mfaLoginChallenge.updateMany({
      where: { id: challengeId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }
  return { attempts: challenge.attempts, locked: challenge.attempts >= MFA_MAX_ATTEMPTS };
}

export async function consumeMfaChallenge(challengeId: string) {
  const consumed = await prisma.mfaLoginChallenge.updateMany({
    where: { id: challengeId, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) throw new Error("MFA_CHALLENGE_INVALID");
}

export async function findActiveTotpCredential(userId: string) {
  return prisma.mfaCredential.findFirst({
    where: activeTotpCredentialWhere(userId),
    orderBy: { verifiedAt: "desc" },
  });
}

export async function validateTrustedDevice(userId: string, token: string | null | undefined, deviceFingerprint?: string | null) {
  if (!token) return null;
  const device = await prisma.trustedDevice.findUnique({ where: { tokenHash: hashOpaqueToken(token) } });
  if (!device || device.userId !== userId || device.revokedAt || !device.expiresAt || device.expiresAt <= new Date()) return null;
  if (!deviceFingerprint || device.deviceFingerprint !== deviceFingerprint) return null;
  return prisma.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
}

export async function trustDevice(input: {
  userId: string;
  deviceFingerprint: string;
  deviceName?: string | null;
  request: Request;
}) {
  const token = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + MFA_TRUSTED_DEVICE_DAYS * 86_400_000);
  const tokenHash = hashOpaqueToken(token);
  const device = await prisma.trustedDevice.upsert({
    where: { userId_deviceFingerprint: { userId: input.userId, deviceFingerprint: input.deviceFingerprint } },
    create: {
      userId: input.userId,
      deviceFingerprint: input.deviceFingerprint,
      deviceName: input.deviceName,
      ipAddress: requestIp(input.request),
      userAgent: input.request.headers.get("user-agent"),
      tokenHash,
      expiresAt,
      lastUsedAt: new Date(),
    },
    update: {
      deviceName: input.deviceName,
      ipAddress: requestIp(input.request),
      userAgent: input.request.headers.get("user-agent"),
      tokenHash,
      expiresAt,
      lastUsedAt: new Date(),
      trustedAt: new Date(),
      revokedAt: null,
    },
  });
  return { token, expiresAt, deviceId: device.id };
}

export async function revokeUserSecuritySessions(userId: string, except?: { webSessionId?: string; mobileSessionId?: string }) {
  const now = new Date();
  await prisma.$transaction([
    prisma.userSession.updateMany({
      where: { userId, revokedAt: null, ...(except?.webSessionId ? { id: { not: except.webSessionId } } : {}) },
      data: { revokedAt: now },
    }),
    prisma.mobileDeviceSession.updateMany({
      where: { userId, revokedAt: null, ...(except?.mobileSessionId ? { id: { not: except.mobileSessionId } } : {}) },
      data: { revokedAt: now },
    }),
  ]);
}

export async function recordMfaSecurityEvent(input: {
  request: Request;
  userId: string;
  companyId?: string | null;
  type: string;
  message: string;
  severity?: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const { recordSecurityEvent } = await import("@/server/security/events");
  await recordSecurityEvent({
    request: input.request,
    userId: input.userId,
    companyId: input.companyId,
    type: input.type,
    message: input.message,
    severity: input.severity ?? "INFO",
    result: /FAILED|DENIED/i.test(input.type) ? "DENIED" : "RECORDED",
    source: "mfa",
    metadata: input.metadata,
  });
}
