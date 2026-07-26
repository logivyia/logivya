import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  MFA_CHALLENGE_COOKIE,
  MFA_TRUSTED_DEVICE_COOKIE,
  readMfaChallenge,
  recordMfaSecurityEvent,
  registerMfaChallengeFailure,
  requestIp,
  trustDevice,
} from "@/server/auth/mfa-challenge";
import {
  authenticationDiagnostics,
  authenticationResponseHeaders,
  type AuthenticationStage,
} from "@/server/auth/diagnostics";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import { createSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { activateMfaCredential, verifyAndConsumeMfaCode } from "@/server/security/mfa";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

const schema = z.object({
  code: z.string().trim().min(6).max(64),
  rememberDevice: z.boolean().optional().default(false),
  deviceFingerprint: z.string().trim().min(8).max(160).optional(),
  deviceName: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  const diagnostics = authenticationDiagnostics(request, "web");
  const headers = authenticationResponseHeaders(diagnostics.correlationId);
  let stage: AuthenticationStage = "REQUEST_RECEIVED";

  function errorResponse(code: string, status: number, extra?: Record<string, unknown>) {
    return NextResponse.json(
      { error: code, code, correlationId: diagnostics.correlationId, ...extra },
      { status, headers },
    );
  }

  try {
    diagnostics.started(stage);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      diagnostics.rejected(stage, "MFA_CODE_INVALID", 400);
      return errorResponse("MFA_CODE_INVALID", 400);
    }
    const cookieStore = await cookies();
    const challengeToken = cookieStore.get(MFA_CHALLENGE_COOKIE)?.value;
    if (!challengeToken) {
      diagnostics.rejected("CHALLENGE_LOOKUP", "MFA_CHALLENGE_EXPIRED", 401);
      return errorResponse("MFA_CHALLENGE_EXPIRED", 401);
    }

    stage = "CHALLENGE_LOOKUP";
    diagnostics.started(stage);
    await enforceOperationRateLimit({
      scope: "web-mfa-verify",
      subject: `${requestIp(request)}:${challengeToken.slice(0, 12)}`,
      maxAttempts: 7,
      windowMs: 10 * 60_000,
      request,
    });
    const challenge = await readMfaChallenge(challengeToken, "WEB");
    diagnostics.succeeded(stage, { userId: challenge.userId, challengeId: challenge.id });
    const membership = await prisma.companyUser.findUnique({
      where: { companyId_userId: { companyId: challenge.companyId, userId: challenge.userId } },
    });
    if (!membership || membership.status !== "ACTIVE" || challenge.user.status !== "ACTIVE") {
      throw new Error("MFA_CHALLENGE_INVALID");
    }

    stage = "TOTP_SECRET_DECRYPTION";
    diagnostics.started(stage, { userId: challenge.userId, challengeId: challenge.id });
    const verification = await verifyAndConsumeMfaCode({
      userId: challenge.userId,
      code: parsed.data.code,
      allowUnverifiedCredential: challenge.purpose === "SETUP",
    });
    stage = "TOTP_VERIFICATION";
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
        message: "Iki adimli dogrulama basarisiz oldu.",
        severity: failure.locked ? "HIGH" : "MEDIUM",
        metadata: { attempts: failure.attempts, reason: verification.reason },
      });
      const code = failure.locked ? "MFA_RATE_LIMITED" : verification.reason;
      const status = failure.locked ? 429 : verification.reason === "MFA_CODE_REUSED" ? 409 : 401;
      diagnostics.rejected(stage, code, status, { userId: challenge.userId, challengeId: challenge.id });
      return errorResponse(
        code,
        status,
        { attemptsRemaining: Math.max(0, 5 - failure.attempts) },
      );
    }
    diagnostics.succeeded(stage, { userId: challenge.userId, challengeId: challenge.id });

    if (challenge.purpose === "SETUP") {
      await activateMfaCredential(challenge.userId, verification.credentialId);
    }
    stage = "SESSION_CREATION";
    diagnostics.started(stage, { userId: challenge.userId, challengeId: challenge.id });
    await createSession(challenge.userId, challenge.companyId, request, {
      mfaVerified: true,
      mfaChallengeId: challenge.id,
    });
    diagnostics.succeeded(stage, { userId: challenge.userId, challengeId: challenge.id });
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
      message: verification.method === "RECOVERY" ? "Kurtarma kodu ile giris yapildi." : "Iki adimli dogrulama basarili oldu.",
      severity: verification.method === "RECOVERY" ? "MEDIUM" : "INFO",
    });
    stage = "TOKEN_OR_COOKIE_DELIVERY";
    diagnostics.succeeded(stage, { userId: challenge.userId, challengeId: challenge.id, statusCode: 200 });
    return NextResponse.json(
      { ok: true, isAdmin: isPlatformAdmin, isPlatformAdmin, correlationId: diagnostics.correlationId },
      { headers },
    );
  } catch (error) {
    const failure = diagnostics.failed(stage, error);
    return errorResponse(failure.code, failure.status);
  }
}
