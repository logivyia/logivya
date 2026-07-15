import { z } from "zod";

import { hasPermission, PERMISSIONS } from "@/server/auth/permissions";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import {
  consumeMfaChallenge,
  readMfaChallenge,
  recordMfaSecurityEvent,
  registerMfaChallengeFailure,
  requestIp,
  trustDevice,
} from "@/server/auth/mfa-challenge";
import { prisma } from "@/server/db";
import { createMobileSession, parseMobilePlatform } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { activateMfaCredential, verifyAndConsumeMfaCode } from "@/server/security/mfa";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

const schema = z.object({
  challengeToken: z.string().min(32).max(256),
  code: z.string().trim().min(6).max(64),
  rememberDevice: z.boolean().optional().default(false),
  deviceId: z.string().min(3).max(160),
  deviceName: z.string().max(120).optional(),
  platform: z.string().optional(),
  appVersion: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    await enforceOperationRateLimit({
      scope: "mobile-mfa-verify",
      subject: `${requestIp(request)}:${parsed.data.challengeToken.slice(0, 12)}`,
      maxAttempts: 7,
      windowMs: 10 * 60_000,
      request,
    });
    const challenge = await readMfaChallenge(parsed.data.challengeToken, "MOBILE");
    if (challenge.deviceId && challenge.deviceId !== parsed.data.deviceId) {
      return mobileError("MFA_DEVICE_MISMATCH", "Dogrulama istegi bu cihaza ait degil.", { status: 401 });
    }
    const membership = await prisma.companyUser.findUnique({
      where: { companyId_userId: { companyId: challenge.companyId, userId: challenge.userId } },
      include: { company: true },
    });
    if (!membership || membership.status !== "ACTIVE" || challenge.user.status !== "ACTIVE") {
      return mobileError("MFA_CHALLENGE_INVALID", "Dogrulama isteginin suresi doldu.", { status: 401 });
    }
    const verification = await verifyAndConsumeMfaCode({
      userId: challenge.userId,
      code: parsed.data.code,
      allowUnverifiedCredential: challenge.purpose === "SETUP",
    });
    if (!verification.ok) {
      const failure = await registerMfaChallengeFailure(challenge.id);
      await prisma.loginAttempt.create({
        data: { userId: challenge.userId, email: challenge.user.email, ipAddress: requestIp(request), userAgent: request.headers.get("user-agent"), success: false, failureReason: verification.reason },
      });
      await recordMfaSecurityEvent({
        request,
        userId: challenge.userId,
        companyId: challenge.companyId,
        type: "MFA_VERIFICATION_FAILED",
        message: "Mobil iki adimli dogrulama basarisiz oldu.",
        severity: failure.locked ? "HIGH" : "MEDIUM",
        metadata: { attempts: failure.attempts, reason: verification.reason },
      });
      return mobileError(failure.locked ? "MFA_CHALLENGE_LOCKED" : verification.reason, "Dogrulama kodu gecersiz.", { status: failure.locked ? 429 : 401 });
    }
    if (challenge.purpose === "SETUP") await activateMfaCredential(challenge.userId, verification.credentialId);
    await consumeMfaChallenge(challenge.id);
    const tokens = await createMobileSession({
      userId: challenge.userId,
      companyId: challenge.companyId,
      role: membership.role,
      deviceId: parsed.data.deviceId,
      platform: parseMobilePlatform(parsed.data.platform),
      appVersion: parsed.data.appVersion,
      userAgent: request.headers.get("user-agent"),
      mfaVerified: true,
    });
    const trusted = parsed.data.rememberDevice
      ? await trustDevice({ userId: challenge.userId, deviceFingerprint: parsed.data.deviceId, deviceName: parsed.data.deviceName, request })
      : null;
    await prisma.loginAttempt.create({
      data: { userId: challenge.userId, email: challenge.user.email, ipAddress: requestIp(request), userAgent: request.headers.get("user-agent"), success: true },
    });
    const isPlatformAdmin = isAuthorizedLogivyaPlatformAdmin({ email: challenge.user.email });
    if (isPlatformAdmin) {
      await prisma.platformAdmin.updateMany({ where: { userId: challenge.userId, isActive: true }, data: { lastElevatedAt: new Date() } });
      await prisma.adminSessionEvent.create({ data: { userId: challenge.userId, type: "ADMIN_MFA_LOGIN", ipAddress: requestIp(request), userAgent: request.headers.get("user-agent") } });
    }
    await recordMfaSecurityEvent({
      request,
      userId: challenge.userId,
      companyId: challenge.companyId,
      type: verification.method === "RECOVERY" ? "MFA_RECOVERY_CODE_USED" : "MFA_LOGIN_SUCCEEDED",
      message: verification.method === "RECOVERY" ? "Mobil giriste kurtarma kodu kullanildi." : "Mobil iki adimli dogrulama basarili oldu.",
      severity: verification.method === "RECOVERY" ? "MEDIUM" : "INFO",
    });
    return mobileSuccess({
      tokens,
      trustedDeviceToken: trusted?.token,
      user: { id: challenge.user.id, name: challenge.user.name, email: challenge.user.email, phone: challenge.user.phone, locale: challenge.user.locale, role: membership.role, isPlatformAdmin },
      company: { id: membership.company.id, name: membership.company.name },
      role: membership.role,
      isAdmin: isPlatformAdmin,
      isPlatformAdmin,
      permissions: PERMISSIONS.filter((permission) => hasPermission(membership.role, permission)),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") return mobileError("RATE_LIMITED", "Cok fazla deneme yapildi.", { status: 429 });
    return mobileSafeError(error);
  }
}
