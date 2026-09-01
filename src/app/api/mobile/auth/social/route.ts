import { z } from "zod";

import { hasPermission, PERMISSIONS } from "@/server/auth/permissions";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import {
  authCorrelationId,
  authNoStoreHeaders,
} from "@/server/auth/public-errors";
import {
  issueMfaChallenge,
  recordMfaSecurityEvent,
  sendEmailOtpForChallenge,
  validateTrustedDevice,
} from "@/server/auth/mfa-challenge";
import {
  SocialIdentityError,
  verifySocialIdentity,
} from "@/server/auth/social-identity";
import { prisma } from "@/server/db";
import { createMobileSession, parseMobilePlatform } from "@/server/mobile/auth";
import { clientIp, enforceMobileRateLimit } from "@/server/mobile/rate-limit";
import { readMobileJson } from "@/server/mobile/request-json";
import {
  mobileError,
  mobileSafeError,
  mobileSuccess,
  mobileValidationError,
} from "@/server/mobile/response";
import { keyedIdentifierHash } from "@/server/observability/privacy";
import { logger } from "@/server/observability/logger";
import { createAndStoreMfaEnrollment } from "@/server/security/mfa";
import { resolveMfaLoginDecision } from "@/server/security/mfa-policy";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { writeAuditLog } from "@/server/security/audit";
import { tryRecordSecurityEvent } from "@/server/security/events";
import { resolvePreferredLoginMembership } from "@/server/team/login-membership";

const schema = z.object({
  provider: z.enum(["GOOGLE", "APPLE"]),
  identityToken: z.string().min(100).max(20_000),
  nonce: z.string().min(32).max(160).optional(),
  deviceId: z.string().min(3).max(160),
  platform: z.string().optional(),
  appVersion: z.string().max(40).optional(),
  trustedDeviceToken: z.string().min(32).max(256).optional(),
}).superRefine((value, context) => {
  if (value.provider === "APPLE" && !value.nonce) {
    context.addIssue({ code: "custom", path: ["nonce"], message: "Apple nonce is required." });
  }
});

export async function POST(request: Request) {
  const correlationId = authCorrelationId(request);
  const withAuthHeaders = <T extends Response>(response: T) => {
    for (const [name, value] of Object.entries(authNoStoreHeaders(correlationId))) {
      response.headers.set(name, value);
    }
    return response;
  };

  try {
    const body = await readMobileJson(request);
    if (!body.ok) return withAuthHeaders(body.response);

    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return withAuthHeaders(await mobileValidationError(parsed.error));

    const ip = clientIp(request);
    enforceMobileRateLimit(`mobile-social-login:${parsed.data.provider}:${ip}`, 20, 60 * 60_000);

    const identity = await verifySocialIdentity(
      parsed.data.provider,
      parsed.data.identityToken,
      parsed.data.nonce,
    );
    await enforceOperationRateLimit({
      scope: "mobile-social-login-identity",
      subject: `${identity.provider}:${identity.subject}`,
      maxAttempts: 30,
      windowMs: 15 * 60_000,
      request,
    });

    const user = await prisma.user.findFirst({ where: { email: identity.email } });
    if (!user || user.status !== "ACTIVE") {
      await prisma.loginAttempt.create({
        data: {
          userId: user?.id,
          email: identity.email,
          ipAddress: ip,
          userAgent: request.headers.get("user-agent"),
          success: false,
          failureReason: user ? "MOBILE_SOCIAL_ACCOUNT_DISABLED" : "MOBILE_SOCIAL_ACCOUNT_NOT_FOUND",
        },
      });
      await tryRecordSecurityEvent({
        request,
        userId: user?.id,
        severity: "MEDIUM",
        type: "AUTH_LOGIN_FAILED",
        message: "Mobile social authentication was rejected.",
        result: "DENIED",
        source: "mobile-social-login",
        errorCode: user ? "AUTH_ACCOUNT_DISABLED" : "SOCIAL_ACCOUNT_NOT_FOUND",
        clientPlatform: parsed.data.platform,
        appVersion: parsed.data.appVersion,
        metadata: {
          provider: identity.provider,
          identityHash: keyedIdentifierHash(`${identity.provider}:${identity.subject}`),
          knownUser: Boolean(user),
        },
      });
      if (user) {
        return withAuthHeaders(await mobileError("FORBIDDEN", "api.error.forbidden", { status: 403 }));
      }
      return withAuthHeaders(await mobileError(
        "SOCIAL_ACCOUNT_NOT_FOUND",
        "api.error.socialAccountNotFound",
        { status: 404 },
      ));
    }

    const membership = await resolvePreferredLoginMembership(user.id, parsed.data.deviceId);
    if (!membership) {
      return withAuthHeaders(await mobileError("FORBIDDEN", "api.error.workspaceNotFound", { status: 403 }));
    }

    if (user.mustChangePassword) {
      return withAuthHeaders(await mobileError(
        "SOCIAL_PASSWORD_REQUIRED",
        "api.error.socialPasswordRequired",
        { status: 409 },
      ));
    }

    const mfa = await resolveMfaLoginDecision({
      userId: user.id,
      companyPolicy: membership.company.mfaPolicy,
      role: membership.role,
      legacyRequired: user.mfaRequired,
      preferredMethod: user.preferredMfaMethod,
    });
    const trustedDevice = mfa.enabledMethods.length
      ? await validateTrustedDevice(user.id, parsed.data.trustedDeviceToken, parsed.data.deviceId)
      : null;

    if (mfa.mfaRequired && !trustedDevice) {
      const purpose = mfa.setupRequired ? "SETUP" as const : "LOGIN" as const;
      const selectedMethod = purpose === "SETUP"
        ? (mfa.requiredEnrollmentMethods.length === 1 ? mfa.requiredEnrollmentMethods[0] : null)
        : mfa.selectedMethod;
      const challenge = await issueMfaChallenge({
        userId: user.id,
        companyId: membership.companyId,
        channel: "MOBILE",
        purpose,
        request,
        deviceId: parsed.data.deviceId,
        platform: parsed.data.platform,
        appVersion: parsed.data.appVersion,
        selectedMethod,
      });
      const enrollment = purpose === "SETUP" && selectedMethod === "TOTP"
        ? await createAndStoreMfaEnrollment(user.id, user.email, { replacePending: true })
        : null;
      const email = purpose === "LOGIN" && selectedMethod === "EMAIL_OTP"
        ? await sendEmailOtpForChallenge({ token: challenge.token, channel: "MOBILE", force: true })
        : null;
      await recordMfaSecurityEvent({
        request,
        userId: user.id,
        companyId: membership.companyId,
        type: purpose === "SETUP" ? "MFA_SETUP_REQUIRED" : "MFA_CHALLENGE_ISSUED",
        message: purpose === "SETUP" ? "Mobil MFA kurulumu istendi." : "Mobil MFA kodu istendi.",
      });
      return withAuthHeaders(await mobileSuccess({
        mfaRequired: true as const,
        mfaSetupRequired: purpose === "SETUP",
        availableMethods: purpose === "SETUP" ? mfa.requiredEnrollmentMethods : mfa.enabledMethods,
        selectedMethod,
        preferredMethod: mfa.selectedMethod,
        recoveryAvailable: mfa.enabledMethods.includes("TOTP"),
        emailMasked: email?.emailMasked,
        organizationPolicy: mfa.policy,
        challengeToken: challenge.token,
        expiresAt: challenge.expiresAt.toISOString(),
        ...(enrollment ?? {}),
      }));
    }

    const tokens = await createMobileSession({
      userId: user.id,
      companyId: membership.companyId,
      role: membership.role,
      deviceId: parsed.data.deviceId,
      platform: parseMobilePlatform(parsed.data.platform),
      appVersion: parsed.data.appVersion,
      userAgent: request.headers.get("user-agent"),
      mfaVerified: mfa.enabledMethods.length > 0,
    });
    await prisma.loginAttempt.create({
      data: {
        userId: user.id,
        email: user.email,
        ipAddress: ip,
        userAgent: request.headers.get("user-agent"),
        success: true,
      },
    });
    await writeAuditLog(request, {
      companyId: membership.companyId,
      userId: user.id,
      actorType: "USER",
      actorEmail: user.email,
      action: "AUTH_LOGIN_SUCCEEDED",
      result: "SUCCESS",
      entityType: "MobileDeviceSession",
      after: {
        deviceId: parsed.data.deviceId,
        platform: parsed.data.platform,
        provider: identity.provider,
      },
    });
    await tryRecordSecurityEvent({
      request,
      companyId: membership.companyId,
      userId: user.id,
      severity: "INFO",
      type: "AUTH_LOGIN_SUCCEEDED",
      message: "Mobile social authentication succeeded.",
      result: "SUCCESS",
      status: "RESOLVED",
      source: "mobile-social-login",
      clientPlatform: parsed.data.platform,
      appVersion: parsed.data.appVersion,
      metadata: {
        provider: identity.provider,
        identityHash: keyedIdentifierHash(`${identity.provider}:${identity.subject}`),
        privateEmail: identity.privateEmail,
      },
    });

    const isPlatformAdmin = isAuthorizedLogivyaPlatformAdmin({ email: user.email });
    return withAuthHeaders(await mobileSuccess({
      tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        locale: user.locale,
        role: membership.role,
        isPlatformAdmin,
      },
      company: { id: membership.company.id, name: membership.company.name },
      role: membership.role,
      isAdmin: isPlatformAdmin,
      isPlatformAdmin,
      permissions: PERMISSIONS.filter((permission) => hasPermission(membership.role, permission)),
    }));
  } catch (error) {
    if (error instanceof SocialIdentityError) {
      const unavailable = error.code === "SOCIAL_LOGIN_NOT_CONFIGURED";
      return withAuthHeaders(await mobileError(
        error.code,
        unavailable ? "api.error.socialLoginNotConfigured" : "api.error.socialTokenInvalid",
        { status: unavailable ? 503 : 401, details: { correlationId } },
      ));
    }
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return withAuthHeaders(await mobileError("RATE_LIMITED", "api.error.rateLimited", { status: 429 }));
    }
    if (error instanceof Error && error.message === "MOBILE_AUTH_SECRET_MISSING") {
      return withAuthHeaders(await mobileError(
        "CONFIGURATION_ERROR",
        "api.error.mobileAuthConfiguration",
        { status: 503 },
      ));
    }
    logger.error("Mobile social login failed unexpectedly", error);
    return withAuthHeaders(await mobileSafeError(error));
  }
}
