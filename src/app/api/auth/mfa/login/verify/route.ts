import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  consumeMfaChallenge,
  MFA_CHALLENGE_COOKIE,
  MFA_TRUSTED_DEVICE_COOKIE,
  notifyMfaSecurityChange,
  readMfaChallenge,
  recordMfaSecurityEvent,
  registerMfaChallengeFailure,
  requestIp,
  trustDevice,
  verifyEmailOtpForChallenge,
} from "@/server/auth/mfa-challenge";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import {
  authCorrelationId,
  authNoStoreHeaders,
  publicAuthErrorBody,
  publicAuthFailure,
} from "@/server/auth/public-errors";
import { createSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { verifyAndConsumeMfaCode, verifyPendingMfaEnrollment } from "@/server/security/mfa";
import { confirmEmailMfaEnrollment } from "@/server/security/mfa-email";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

const schema = z.object({
  code: z.string().trim().min(6).max(64),
  rememberDevice: z.boolean().optional().default(false),
  deviceFingerprint: z.string().trim().min(8).max(160).optional(),
  deviceName: z.string().trim().max(120).optional(),
  setupToken: z.string().min(32).max(256).optional(),
});

export async function POST(request: Request) {
  const correlationId = authCorrelationId(request);
  const errorResponse = (code: unknown, extra?: Record<string, unknown>) => {
    const failure = publicAuthFailure(code);
    return NextResponse.json(
      publicAuthErrorBody(code, correlationId, extra),
      { status: failure.status, headers: authNoStoreHeaders(correlationId) },
    );
  };

  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("MFA_CODE_INVALID");
    const cookieStore = await cookies();
    const challengeToken = cookieStore.get(MFA_CHALLENGE_COOKIE)?.value;
    if (!challengeToken) return errorResponse("MFA_CHALLENGE_INVALID");

    await enforceOperationRateLimit({
      scope: "web-mfa-verify",
      subject: `${requestIp(request)}:${challengeToken.slice(0, 12)}`,
      maxAttempts: 7,
      windowMs: 10 * 60_000,
      request,
    });
    const challenge = await readMfaChallenge(challengeToken, "WEB");
    const membership = await prisma.companyUser.findUnique({
      where: { companyId_userId: { companyId: challenge.companyId, userId: challenge.userId } },
    });
    if (!membership || membership.status !== "ACTIVE" || challenge.user.status !== "ACTIVE") {
      throw new Error("MFA_CHALLENGE_INVALID");
    }

    const verification = !challenge.selectedMethod
      ? { ok: false as const, reason: "MFA_METHOD_NOT_SELECTED" as const }
      : challenge.purpose === "SETUP"
        ? challenge.selectedMethod === "EMAIL_OTP"
          ? await confirmEmailMfaEnrollment({ userId: challenge.userId, setupToken: challengeToken, code: parsed.data.code, channel: "WEB", registerFailure: false })
          : parsed.data.setupToken
            ? await verifyPendingMfaEnrollment({ userId: challenge.userId, setupToken: parsed.data.setupToken, code: parsed.data.code })
            : { ok: false as const, reason: "TWO_FACTOR_SETUP_NOT_FOUND" as const }
        : challenge.selectedMethod === "EMAIL_OTP"
          ? await verifyEmailOtpForChallenge(challenge.id, parsed.data.code)
          : await verifyAndConsumeMfaCode({ userId: challenge.userId, code: parsed.data.code, method: "TOTP" });
    if (!verification.ok) {
      const failure = await registerMfaChallengeFailure(challenge.id);
      await prisma.loginAttempt.create({
        data: {
          userId: challenge.userId,
          email: challenge.user.email,
          ipAddress: requestIp(request),
          userAgent: request.headers.get("user-agent"),
          success: false,
          failureReason: verification.reason,
        },
      });
      await recordMfaSecurityEvent({
        request,
        userId: challenge.userId,
        companyId: challenge.companyId,
        type: "MFA_VERIFICATION_FAILED",
        message: "İki adımlı doğrulama başarısız oldu.",
        severity: failure.locked ? "HIGH" : "MEDIUM",
        metadata: { attempts: failure.attempts, reason: verification.reason },
      });
      return errorResponse(
        failure.locked ? "MFA_CHALLENGE_LOCKED" : verification.reason,
        { attemptsRemaining: Math.max(0, 5 - failure.attempts) },
      );
    }

    if (!("challengeConsumed" in verification && verification.challengeConsumed)) await consumeMfaChallenge(challenge.id);
    try {
      await createSession(challenge.userId, challenge.companyId, request, { mfaVerified: true });
    } catch (error) {
      logger.error("auth.web_mfa_session_create_failed", error, {
        correlationId,
        userId: challenge.userId,
        companyId: challenge.companyId,
      });
      throw new Error("AUTH_SESSION_CREATE_FAILED");
    }
    await prisma.loginAttempt.create({
      data: { userId: challenge.userId, email: challenge.user.email, ipAddress: requestIp(request), userAgent: request.headers.get("user-agent"), success: true },
    });

    if (parsed.data.rememberDevice && (parsed.data.deviceFingerprint || challenge.deviceId)) {
      const trusted = await trustDevice({
        userId: challenge.userId,
        deviceFingerprint: parsed.data.deviceFingerprint || challenge.deviceId!,
        deviceName: parsed.data.deviceName,
        request,
      });
      cookieStore.set(MFA_TRUSTED_DEVICE_COOKIE, trusted.token, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: trusted.expiresAt,
      });
    }
    cookieStore.set(MFA_CHALLENGE_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/api/auth/mfa/login", maxAge: 0 });

    const isPlatformAdmin = isAuthorizedLogivyaPlatformAdmin({ email: challenge.user.email });
    if (isPlatformAdmin) {
      await prisma.platformAdmin.updateMany({ where: { userId: challenge.userId, isActive: true }, data: { lastElevatedAt: new Date() } });
      await prisma.adminSessionEvent.create({
        data: { userId: challenge.userId, type: "ADMIN_MFA_LOGIN", ipAddress: requestIp(request), userAgent: request.headers.get("user-agent") },
      });
    }
    await recordMfaSecurityEvent({
      request,
      userId: challenge.userId,
      companyId: challenge.companyId,
      type: verification.method === "RECOVERY" ? "MFA_RECOVERY_CODE_USED" : "MFA_LOGIN_SUCCEEDED",
      message: verification.method === "RECOVERY" ? "Kurtarma kodu ile giriş yapıldı." : "İki adımlı doğrulama başarılı oldu.",
      severity: verification.method === "RECOVERY" ? "MEDIUM" : "INFO",
    });
    if (challenge.purpose === "SETUP") {
      await notifyMfaSecurityChange({
        userId: challenge.userId,
        companyId: challenge.companyId,
        type: "security.mfa_enabled",
        title: "İki adımlı doğrulama etkin",
        message: "Authenticator doğrulaması hesabınızı korumak için etkinleştirildi.",
      });
    }
    return NextResponse.json(
      {
        ok: true,
        isAdmin: isPlatformAdmin,
        isPlatformAdmin,
        ...(challenge.purpose === "SETUP" && "recoveryCodes" in verification ? { recoveryCodes: verification.recoveryCodes } : {}),
      },
      { headers: authNoStoreHeaders(correlationId) },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "MFA_ERROR";
    const failure = publicAuthFailure(code);
    if (failure.code === "AUTH_INTERNAL_ERROR") {
      logger.error("auth.web_mfa_verify_failed", error, { correlationId });
    }
    return errorResponse(code);
  }
}
