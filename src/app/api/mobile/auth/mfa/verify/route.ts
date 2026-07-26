import { z } from "zod";

import { hasPermission, PERMISSIONS } from "@/server/auth/permissions";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import {
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
import { prisma } from "@/server/db";
import { createMobileSession, parseMobilePlatform } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
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
  const diagnostics = authenticationDiagnostics(request, request.headers.get("x-client-platform"), request.headers.get("x-logivya-app-version"));
  const headers = authenticationResponseHeaders(diagnostics.correlationId);
  let stage: AuthenticationStage = "REQUEST_RECEIVED";

  async function errorResponse(code: string, message: string, status: number, details?: Record<string, unknown>) {
    const response = await mobileError(code, message, {
      status,
      details: { correlationId: diagnostics.correlationId, ...(details ?? {}) },
    });
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  }

  function successResponse<T>(response: T) {
    if (response instanceof Response) {
      for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    }
    return response;
  }

  try {
    diagnostics.started(stage);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) {
      diagnostics.rejected(stage, "MFA_CODE_INVALID", 400);
      return successResponse(await mobileValidationError(parsed.error));
    }
    stage = "CHALLENGE_LOOKUP";
    diagnostics.started(stage);
    await enforceOperationRateLimit({
      scope: "mobile-mfa-verify",
      subject: `${requestIp(request)}:${parsed.data.challengeToken.slice(0, 12)}`,
      maxAttempts: 7,
      windowMs: 10 * 60_000,
      request,
    });
    const challenge = await readMfaChallenge(parsed.data.challengeToken, "MOBILE");
    diagnostics.succeeded(stage, { userId: challenge.userId, challengeId: challenge.id });
    if (challenge.deviceId && challenge.deviceId !== parsed.data.deviceId) {
      diagnostics.rejected(stage, "MFA_DEVICE_MISMATCH", 401, { userId: challenge.userId, challengeId: challenge.id });
      return errorResponse("MFA_DEVICE_MISMATCH", "Dogrulama istegi bu cihaza ait degil.", 401);
    }
    const membership = await prisma.companyUser.findUnique({
      where: { companyId_userId: { companyId: challenge.companyId, userId: challenge.userId } },
      include: { company: true },
    });
    if (!membership || membership.status !== "ACTIVE" || challenge.user.status !== "ACTIVE") {
      diagnostics.rejected(stage, "MFA_CHALLENGE_INVALID", 401, { userId: challenge.userId, challengeId: challenge.id });
      return errorResponse("MFA_CHALLENGE_INVALID", "Dogrulama isteginin suresi doldu.", 401);
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
      const code = failure.locked ? "MFA_CHALLENGE_LOCKED" : verification.reason;
      const status = failure.locked ? 429 : verification.reason === "MFA_CODE_REUSED" ? 409 : 401;
      diagnostics.rejected(stage, code, status, { userId: challenge.userId, challengeId: challenge.id });
      return errorResponse(code, "Dogrulama kodu gecersiz.", status);
    }
    diagnostics.succeeded(stage, { userId: challenge.userId, challengeId: challenge.id });
    if (challenge.purpose === "SETUP") await activateMfaCredential(challenge.userId, verification.credentialId);
    stage = "SESSION_CREATION";
    diagnostics.started(stage, { userId: challenge.userId, challengeId: challenge.id });
    const tokens = await createMobileSession({
      userId: challenge.userId,
      companyId: challenge.companyId,
      role: membership.role,
      deviceId: parsed.data.deviceId,
      platform: parseMobilePlatform(parsed.data.platform),
      appVersion: parsed.data.appVersion,
      userAgent: request.headers.get("user-agent"),
      mfaVerified: true,
      mfaChallengeId: challenge.id,
    });
    diagnostics.succeeded(stage, { userId: challenge.userId, challengeId: challenge.id });
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
    stage = "TOKEN_OR_COOKIE_DELIVERY";
    diagnostics.succeeded(stage, { userId: challenge.userId, challengeId: challenge.id, statusCode: 200 });
    return successResponse(await mobileSuccess({
      tokens,
      trustedDeviceToken: trusted?.token,
      user: { id: challenge.user.id, name: challenge.user.name, email: challenge.user.email, phone: challenge.user.phone, locale: challenge.user.locale, role: membership.role, isPlatformAdmin },
      company: { id: membership.company.id, name: membership.company.name },
      role: membership.role,
      isAdmin: isPlatformAdmin,
      isPlatformAdmin,
      permissions: PERMISSIONS.filter((permission) => hasPermission(membership.role, permission)),
      correlationId: diagnostics.correlationId,
    }));
  } catch (error) {
    const failure = diagnostics.failed(stage, error);
    const responseCode = failure.code === "MFA_CHALLENGE_EXPIRED"
      ? "MFA_CHALLENGE_INVALID"
      : failure.code === "MFA_RATE_LIMITED"
        ? "MFA_CHALLENGE_LOCKED"
        : failure.code;
    const message = failure.code === "MFA_CONFIGURATION_ERROR"
      ? "api.error.configuration"
      : failure.code === "AUTH_SESSION_CREATE_FAILED"
        ? "api.error.configuration"
        : failure.code === "MFA_CHALLENGE_EXPIRED"
          ? "api.error.sessionExpired"
          : "api.error.generic";
    return errorResponse(responseCode, message, failure.status);
  }
}
