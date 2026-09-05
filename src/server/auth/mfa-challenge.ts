import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { prisma } from "@/server/db";
import { hashOpaqueToken } from "@/server/security/authentication";
import { createNotification } from "@/server/notifications/service";
import { logger } from "@/server/observability/logger";
import { sendTemplateEmailSafely } from "@/server/email/service";
import type { MfaMethodType } from "@/server/security/mfa-policy";

export const MFA_CHALLENGE_COOKIE = "logivya_mfa_challenge";
export const MFA_TRUSTED_DEVICE_COOKIE = "logivya_mfa_trusted_device";
export const MFA_CHALLENGE_TTL_MS = 10 * 60_000;
export const MFA_MAX_ATTEMPTS = 5;
export const MFA_TRUSTED_DEVICE_DAYS = 30;

export type MfaChallengeChannel = "WEB" | "MOBILE";
export type MfaChallengePurpose = "LOGIN" | "SETUP" | "STEP_UP";

const EMAIL_OTP_RESEND_DELAY_MS = 30_000;

function emailOtpPepper() {
  const pepper = process.env.MFA_EMAIL_OTP_PEPPER || process.env.PASSWORD_PEPPER;
  if (!pepper) throw new Error("MFA_EMAIL_OTP_PEPPER_NOT_CONFIGURED");
  return pepper;
}

function hashEmailOtp(challengeId: string, code: string) {
  return createHmac("sha256", emailOtpPepper()).update(`${challengeId}:${code}`).digest("base64url");
}

function equalHash(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function maskMfaEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, Math.min(2, local.length))}${"*".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

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
  selectedMethod?: MfaMethodType | null;
}) {
  const token = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + MFA_CHALLENGE_TTL_MS);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.mfaLoginChallenge.updateMany({
      where: {
        userId: input.userId,
        channel: input.channel,
        consumedAt: null,
        expiresAt: { lte: now },
      },
      data: { consumedAt: now },
    });
    await tx.mfaLoginChallenge.create({
      data: {
        userId: input.userId,
        companyId: input.companyId,
        tokenHash: hashOpaqueToken(token),
        channel: input.channel,
        purpose: input.purpose ?? "LOGIN",
        selectedMethod: input.selectedMethod,
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

export async function sendEmailOtpForChallenge(input: { token: string; channel: MfaChallengeChannel; force?: boolean }) {
  const challenge = await readMfaChallenge(input.token, input.channel);
  if (challenge.selectedMethod !== "EMAIL_OTP") throw new Error("MFA_METHOD_NOT_SELECTED");
  if (!input.force && challenge.otpSentAt && challenge.otpExpiresAt && challenge.otpSentAt.getTime() > Date.now() - EMAIL_OTP_RESEND_DELAY_MS) {
    return { sent: true as const, expiresAt: challenge.otpExpiresAt, emailMasked: maskMfaEmail(challenge.user.email), rateLimited: true as const };
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const otpExpiresAt = new Date(Math.min(challenge.expiresAt.getTime(), Date.now() + MFA_CHALLENGE_TTL_MS));
  await prisma.mfaLoginChallenge.update({
    where: { id: challenge.id },
    data: { otpCodeHash: hashEmailOtp(challenge.id, code), otpSentAt: new Date(), otpExpiresAt },
  });
  const delivery = await sendTemplateEmailSafely({
    to: challenge.user.email,
    template: "mfa_email_otp",
    companyId: challenge.companyId,
    userId: challenge.userId,
    variables: { code, locale: challenge.user.locale },
  });
  if (!delivery.sent) {
    await prisma.mfaLoginChallenge.update({ where: { id: challenge.id }, data: { otpCodeHash: null, otpExpiresAt: null } });
    throw new Error("MFA_EMAIL_DELIVERY_FAILED");
  }
  return { sent: true as const, expiresAt: otpExpiresAt, emailMasked: maskMfaEmail(challenge.user.email), rateLimited: false as const };
}

export async function verifyEmailOtpForChallenge(challengeId: string, code: string) {
  const challenge = await prisma.mfaLoginChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge || challenge.selectedMethod !== "EMAIL_OTP" || !challenge.otpCodeHash || !challenge.otpExpiresAt || challenge.otpExpiresAt <= new Date()) {
    return { ok: false as const, reason: "MFA_EMAIL_OTP_EXPIRED" as const };
  }
  if (!/^\d{6}$/u.test(code.trim()) || !equalHash(hashEmailOtp(challenge.id, code.trim()), challenge.otpCodeHash)) {
    return { ok: false as const, reason: "MFA_EMAIL_OTP_INVALID" as const };
  }
  await prisma.mfaCredential.updateMany({
    where: { userId: challenge.userId, type: "EMAIL_OTP", status: "ENABLED", revokedAt: null },
    data: { lastUsedAt: new Date() },
  });
  return { ok: true as const, method: "EMAIL_OTP" as const };
}

export async function selectMfaChallengeMethod(input: { token: string; channel: MfaChallengeChannel; method: MfaMethodType }) {
  const challenge = await readMfaChallenge(input.token, input.channel);
  if (challenge.purpose === "SETUP") throw new Error("MFA_CHALLENGE_METHOD_FIXED");
  const enabled = await prisma.mfaCredential.findFirst({
    where: { userId: challenge.userId, type: input.method, status: "ENABLED", verifiedAt: { not: null }, revokedAt: null },
    select: { id: true },
  });
  if (!enabled) throw new Error("MFA_METHOD_NOT_ENABLED");
  await prisma.mfaLoginChallenge.update({
    where: { id: challenge.id },
    data: { selectedMethod: input.method, otpCodeHash: null, otpSentAt: null, otpExpiresAt: null, attempts: 0 },
  });
  const email = input.method === "EMAIL_OTP" ? await sendEmailOtpForChallenge({ token: input.token, channel: input.channel, force: true }) : null;
  return { selectedMethod: input.method, ...(email ? { emailMasked: email.emailMasked, expiresAt: email.expiresAt } : {}) };
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
  await prisma.$transaction(async (tx) => {
    const initial = await tx.mfaLoginChallenge.findUnique({
      where: { id: challengeId },
      select: { userId: true, companyId: true, channel: true },
    });
    if (!initial) throw new Error("MFA_CHALLENGE_INVALID");

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mfa-challenge:${initial.userId}:${initial.companyId}:${initial.channel}`}))`;
    const challenge = await tx.mfaLoginChallenge.findUnique({
      where: { id: challengeId },
      select: { userId: true, companyId: true, channel: true, consumedAt: true, expiresAt: true },
    });
    const now = new Date();
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= now) {
      throw new Error("MFA_CHALLENGE_INVALID");
    }

    await tx.mfaLoginChallenge.updateMany({
      where: {
        userId: challenge.userId,
        companyId: challenge.companyId,
        channel: challenge.channel,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
  });
}

export async function findActiveMfaCredential(userId: string, method?: MfaMethodType) {
  return prisma.mfaCredential.findFirst({
    where: { userId, ...(method ? { type: method } : {}), status: "ENABLED", verifiedAt: { not: null }, revokedAt: null },
    orderBy: [{ isPreferred: "desc" }, { verifiedAt: "desc" }],
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

export async function notifyMfaSecurityChange(input: {
  userId: string;
  companyId: string;
  type: string;
  title: string;
  message: string;
}) {
  try {
    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } });
    await Promise.all([
      createNotification({
        companyId: input.companyId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        payload: { category: "SECURITY" },
      }),
      ...(user ? [sendTemplateEmailSafely({
        to: user.email,
        template: "security_alert",
        companyId: input.companyId,
        userId: input.userId,
        variables: { title: input.title, message: input.message },
      })] : []),
    ]);
  } catch (error) {
    logger.error("mfa.security_notification_failed", error, {
      companyId: input.companyId,
      userId: input.userId,
      notificationType: input.type,
    });
  }
}
