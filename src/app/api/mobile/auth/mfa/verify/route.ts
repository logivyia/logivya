import { z } from "zod";

import { hasPermission, PERMISSIONS } from "@/server/auth/permissions";
import { getPlatformAdminProfile } from "@/server/auth/platform-admin";
import {
  consumeMfaChallenge,
  notifyMfaSecurityChange,
  readMfaChallenge,
  recordMfaSecurityEvent,
  registerMfaChallengeFailure,
  requestIp,
  trustDevice,
  verifyEmailOtpForChallenge,
} from "@/server/auth/mfa-challenge";
import {
  authCorrelationId,
  authNoStoreHeaders,
  publicAuthFailure,
} from "@/server/auth/public-errors";
import { prisma } from "@/server/db";
import { createMobileSession, parseMobilePlatform } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import {
  mobileError,
  mobileSafeError,
  mobileSuccess,
  mobileValidationError,
} from "@/server/mobile/response";
import { logger } from "@/server/observability/logger";
import {
  verifyAndConsumeMfaCode,
  verifyPendingMfaEnrollment,
} from "@/server/security/mfa";
import { confirmEmailMfaEnrollment } from "@/server/security/mfa-email";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

const schema = z.object({
  challengeToken: z.string().min(32).max(256),
  code: z.string().trim().min(6).max(64),
  rememberDevice: z.boolean().optional().default(false),
  deviceId: z.string().min(3).max(160),
  deviceName: z.string().max(120).optional(),
  platform: z.string().optional(),
  appVersion: z.string().max(40).optional(),
  setupToken: z.string().min(32).max(256).optional(),
});

export async function POST(request: Request) {
  const correlationId = authCorrelationId(request);
  const withAuthHeaders = <T extends Response>(response: T) => {
    for (const [name, value] of Object.entries(
      authNoStoreHeaders(correlationId),
    )) {
      response.headers.set(name, value);
    }
    return response;
  };
  const errorResponse = async (
    code: unknown,
    details?: Record<string, unknown>,
  ) => {
    const failure = publicAuthFailure(code);
    return withAuthHeaders(
      await mobileError(failure.code, failure.messageKey, {
        status: failure.status,
        details: { correlationId, ...details },
      }),
    );
  };

  try {
    const body = await readMobileJson(request);
    if (!body.ok) return withAuthHeaders(body.response);
    const parsed = schema.safeParse(body.data);
    if (!parsed.success)
      return withAuthHeaders(await mobileValidationError(parsed.error));
    await enforceOperationRateLimit({
      scope: "mobile-mfa-verify",
      subject: `${requestIp(request)}:${parsed.data.challengeToken.slice(0, 12)}`,
      maxAttempts: 7,
      windowMs: 10 * 60_000,
      request,
    });
    const challenge = await readMfaChallenge(
      parsed.data.challengeToken,
      "MOBILE",
    );
    if (challenge.deviceId && challenge.deviceId !== parsed.data.deviceId) {
      return errorResponse("MFA_CHALLENGE_INVALID");
    }
    const membership = await prisma.companyUser.findUnique({
      where: {
        companyId_userId: {
          companyId: challenge.companyId,
          userId: challenge.userId,
        },
      },
      include: { company: true },
    });
    if (
      !membership ||
      membership.status !== "ACTIVE" ||
      challenge.user.status !== "ACTIVE"
    ) {
      return errorResponse("MFA_CHALLENGE_INVALID");
    }
    const verification = !challenge.selectedMethod
      ? { ok: false as const, reason: "MFA_METHOD_NOT_SELECTED" as const }
      : challenge.purpose === "SETUP"
        ? challenge.selectedMethod === "EMAIL_OTP"
          ? await confirmEmailMfaEnrollment({
              userId: challenge.userId,
              setupToken: parsed.data.challengeToken,
              code: parsed.data.code,
              channel: "MOBILE",
              registerFailure: false,
            })
          : parsed.data.setupToken
            ? await verifyPendingMfaEnrollment({
                userId: challenge.userId,
                setupToken: parsed.data.setupToken,
                code: parsed.data.code,
              })
            : {
                ok: false as const,
                reason: "TWO_FACTOR_SETUP_NOT_FOUND" as const,
              }
        : challenge.selectedMethod === "EMAIL_OTP"
          ? await verifyEmailOtpForChallenge(challenge.id, parsed.data.code)
          : await verifyAndConsumeMfaCode({
              userId: challenge.userId,
              code: parsed.data.code,
              method: "TOTP",
            });
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
        message: "Mobil iki adımlı doğrulama başarısız oldu.",
        severity: failure.locked ? "HIGH" : "MEDIUM",
        metadata: { attempts: failure.attempts, reason: verification.reason },
      });
      return errorResponse(
        failure.locked ? "MFA_CHALLENGE_LOCKED" : verification.reason,
        { attemptsRemaining: Math.max(0, 5 - failure.attempts) },
      );
    }
    if (!(
      "challengeConsumed" in verification && verification.challengeConsumed
    ))
      await consumeMfaChallenge(challenge.id);
    let tokens;
    try {
      tokens = await createMobileSession({
        userId: challenge.userId,
        companyId: challenge.companyId,
        role: membership.role,
        deviceId: parsed.data.deviceId,
        platform: parseMobilePlatform(parsed.data.platform),
        appVersion: parsed.data.appVersion,
        userAgent: request.headers.get("user-agent"),
        mfaVerified: true,
      });
    } catch (error) {
      logger.error("auth.mobile_mfa_session_create_failed", error, {
        correlationId,
        userId: challenge.userId,
        companyId: challenge.companyId,
      });
      throw new Error("AUTH_SESSION_CREATE_FAILED");
    }
    const trusted = parsed.data.rememberDevice
      ? await trustDevice({
          userId: challenge.userId,
          deviceFingerprint: parsed.data.deviceId,
          deviceName: parsed.data.deviceName,
          request,
        })
      : null;
    await prisma.loginAttempt.create({
      data: {
        userId: challenge.userId,
        email: challenge.user.email,
        ipAddress: requestIp(request),
        userAgent: request.headers.get("user-agent"),
        success: true,
      },
    });
    const platformAdmin = await getPlatformAdminProfile({
      userId: challenge.userId,
      email: challenge.user.email,
    });
    const { isPlatformAdmin } = platformAdmin;
    if (isPlatformAdmin) {
      await prisma.platformAdmin.updateMany({
        where: { userId: challenge.userId, isActive: true },
        data: { lastElevatedAt: new Date() },
      });
      await prisma.adminSessionEvent.create({
        data: {
          userId: challenge.userId,
          type: "ADMIN_MFA_LOGIN",
          ipAddress: requestIp(request),
          userAgent: request.headers.get("user-agent"),
        },
      });
    }
    await recordMfaSecurityEvent({
      request,
      userId: challenge.userId,
      companyId: challenge.companyId,
      type:
        verification.method === "RECOVERY"
          ? "MFA_RECOVERY_CODE_USED"
          : "MFA_LOGIN_SUCCEEDED",
      message:
        verification.method === "RECOVERY"
          ? "Mobil girişte kurtarma kodu kullanıldı."
          : "Mobil iki adımlı doğrulama başarılı oldu.",
      severity: verification.method === "RECOVERY" ? "MEDIUM" : "INFO",
    });
    if (challenge.purpose === "SETUP") {
      await notifyMfaSecurityChange({
        userId: challenge.userId,
        companyId: challenge.companyId,
        type: "security.mfa_enabled",
        title: "İki adımlı doğrulama etkin",
        message:
          "Authenticator doğrulaması hesabınızı korumak için etkinleştirildi.",
      });
    }
    return withAuthHeaders(
      await mobileSuccess({
        tokens,
        trustedDeviceToken: trusted?.token,
        user: {
          id: challenge.user.id,
          name: challenge.user.name,
          email: challenge.user.email,
          phone: challenge.user.phone,
          locale: challenge.user.locale,
          role: membership.role,
          isPlatformAdmin,
        },
        company: { id: membership.company.id, name: membership.company.name },
        role: membership.role,
        isAdmin: isPlatformAdmin,
        isPlatformAdmin,
        platformAdminRole: platformAdmin.platformAdminRole,
        adminPermissions: platformAdmin.adminPermissions,
        permissions: PERMISSIONS.filter((permission) =>
          hasPermission(membership.role, permission),
        ),
        ...(challenge.purpose === "SETUP" && "recoveryCodes" in verification
          ? { recoveryCodes: verification.recoveryCodes }
          : {}),
      }),
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "AUTH_INTERNAL_ERROR";
    const failure = publicAuthFailure(code);
    if (failure.code === "AUTH_INTERNAL_ERROR") {
      logger.error("auth.mobile_mfa_verify_failed", error, { correlationId });
      return withAuthHeaders(await mobileSafeError(error, failure.messageKey));
    }
    return errorResponse(code);
  }
}
