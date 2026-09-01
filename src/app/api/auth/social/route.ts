import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  issueMfaChallenge,
  MFA_CHALLENGE_COOKIE,
  MFA_CHALLENGE_TTL_MS,
  MFA_TRUSTED_DEVICE_COOKIE,
  recordMfaSecurityEvent,
  requestIp,
  sendEmailOtpForChallenge,
  validateTrustedDevice,
} from "@/server/auth/mfa-challenge";
import { authCorrelationId, authNoStoreHeaders } from "@/server/auth/public-errors";
import { createSession } from "@/server/auth/session";
import { SocialIdentityError, verifySocialIdentity } from "@/server/auth/social-identity";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import { prisma } from "@/server/db";
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
  nonce: z.string().min(16).max(160).optional(),
  deviceFingerprint: z.string().trim().min(8).max(160),
  deviceName: z.string().trim().max(120).optional(),
}).superRefine((value, context) => {
  if (value.provider === "APPLE" && !value.nonce) {
    context.addIssue({ code: "custom", path: ["nonce"], message: "Apple nonce is required." });
  }
});

function responseWithAuthHeaders(response: NextResponse, correlationId: string) {
  for (const [name, value] of Object.entries(authNoStoreHeaders(correlationId))) {
    response.headers.set(name, value);
  }
  return response;
}

export async function POST(request: Request) {
  const correlationId = authCorrelationId(request);
  const respond = (body: Record<string, unknown>, status = 200) => responseWithAuthHeaders(
    NextResponse.json(body, { status }),
    correlationId,
  );

  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return respond({ error: "VALIDATION_INVALID", correlationId }, 400);

    const ipAddress = requestIp(request);
    const userAgent = request.headers.get("user-agent");
    await enforceOperationRateLimit({
      scope: `web-social-login-${parsed.data.provider.toLowerCase()}`,
      subject: ipAddress,
      maxAttempts: 30,
      windowMs: 60 * 60_000,
      request,
    });

    const identity = await verifySocialIdentity(
      parsed.data.provider,
      parsed.data.identityToken,
      parsed.data.nonce,
    );
    await enforceOperationRateLimit({
      scope: "web-social-login-identity",
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
          ipAddress,
          userAgent,
          success: false,
          failureReason: user ? "WEB_SOCIAL_ACCOUNT_DISABLED" : "WEB_SOCIAL_ACCOUNT_NOT_FOUND",
        },
      });
      await tryRecordSecurityEvent({
        request,
        userId: user?.id,
        severity: "MEDIUM",
        type: "AUTH_LOGIN_FAILED",
        message: "Web social authentication was rejected.",
        result: "DENIED",
        source: "web-social-login",
        errorCode: user ? "AUTH_ACCOUNT_DISABLED" : "SOCIAL_ACCOUNT_NOT_FOUND",
        metadata: {
          provider: identity.provider,
          identityHash: keyedIdentifierHash(`${identity.provider}:${identity.subject}`),
          knownUser: Boolean(user),
        },
      });
      return respond({ error: user ? "FORBIDDEN" : "SOCIAL_ACCOUNT_NOT_FOUND", correlationId }, user ? 403 : 404);
    }

    const membership = await resolvePreferredLoginMembership(user.id, parsed.data.deviceFingerprint);
    if (!membership) return respond({ error: "auth.workspaceUnavailable", correlationId }, 403);
    if (user.mustChangePassword) return respond({ error: "SOCIAL_PASSWORD_REQUIRED", correlationId }, 409);

    const mfa = await resolveMfaLoginDecision({
      userId: user.id,
      companyPolicy: membership.company.mfaPolicy,
      role: membership.role,
      legacyRequired: user.mfaRequired,
      preferredMethod: user.preferredMfaMethod,
    });
    const trustedToken = (await cookies()).get(MFA_TRUSTED_DEVICE_COOKIE)?.value;
    const trustedDevice = mfa.enabledMethods.length
      ? await validateTrustedDevice(user.id, trustedToken, parsed.data.deviceFingerprint)
      : null;

    if (mfa.mfaRequired && !trustedDevice) {
      const purpose = mfa.setupRequired ? "SETUP" as const : "LOGIN" as const;
      const selectedMethod = purpose === "SETUP"
        ? (mfa.requiredEnrollmentMethods.length === 1 ? mfa.requiredEnrollmentMethods[0] : null)
        : mfa.selectedMethod;
      const challenge = await issueMfaChallenge({
        userId: user.id,
        companyId: membership.companyId,
        channel: "WEB",
        purpose,
        request,
        deviceId: parsed.data.deviceFingerprint,
        platform: "WEB",
        selectedMethod,
      });
      const enrollment = purpose === "SETUP" && selectedMethod === "TOTP"
        ? await createAndStoreMfaEnrollment(user.id, user.email, { replacePending: true })
        : null;
      const email = purpose === "LOGIN" && selectedMethod === "EMAIL_OTP"
        ? await sendEmailOtpForChallenge({ token: challenge.token, channel: "WEB", force: true })
        : null;
      (await cookies()).set(MFA_CHALLENGE_COOKIE, challenge.token, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/api/auth/mfa/login",
        maxAge: Math.floor(MFA_CHALLENGE_TTL_MS / 1000),
      });
      await recordMfaSecurityEvent({
        request,
        userId: user.id,
        companyId: membership.companyId,
        type: purpose === "SETUP" ? "MFA_SETUP_REQUIRED" : "MFA_CHALLENGE_ISSUED",
        message: purpose === "SETUP" ? "Web MFA kurulumu istendi." : "Web MFA kodu istendi.",
      });
      return respond({
        ok: false,
        mfaRequired: true,
        mfaSetupRequired: purpose === "SETUP",
        availableMethods: purpose === "SETUP" ? mfa.requiredEnrollmentMethods : mfa.enabledMethods,
        selectedMethod,
        preferredMethod: mfa.selectedMethod,
        recoveryAvailable: mfa.enabledMethods.includes("TOTP"),
        emailMasked: email?.emailMasked,
        organizationPolicy: mfa.policy,
        expiresAt: challenge.expiresAt.toISOString(),
        ...(enrollment ?? {}),
      }, 202);
    }

    await createSession(user.id, membership.companyId, request, {
      mfaVerified: mfa.enabledMethods.length > 0,
      deviceName: parsed.data.deviceName,
      deviceFingerprint: parsed.data.deviceFingerprint,
    });
    await prisma.loginAttempt.create({
      data: { userId: user.id, email: user.email, ipAddress, userAgent, success: true },
    });
    await Promise.all([
      writeAuditLog(request, {
        companyId: membership.companyId,
        userId: user.id,
        actorType: "USER",
        actorEmail: user.email,
        action: "AUTH_LOGIN_SUCCEEDED",
        result: "SUCCESS",
        entityType: "UserSession",
        after: { platform: "web", provider: identity.provider, mfaVerified: mfa.enabledMethods.length > 0 },
      }),
      tryRecordSecurityEvent({
        request,
        companyId: membership.companyId,
        userId: user.id,
        severity: "INFO",
        type: "AUTH_LOGIN_SUCCEEDED",
        message: "Web social authentication succeeded.",
        result: "SUCCESS",
        status: "RESOLVED",
        source: "web-social-login",
        metadata: {
          provider: identity.provider,
          identityHash: keyedIdentifierHash(`${identity.provider}:${identity.subject}`),
          privateEmail: identity.privateEmail,
        },
      }),
    ]);

    const isPlatformAdmin = isAuthorizedLogivyaPlatformAdmin({ email: user.email });
    return respond({ ok: true, isAdmin: isPlatformAdmin, isPlatformAdmin });
  } catch (error) {
    if (error instanceof SocialIdentityError) {
      const unavailable = error.code === "SOCIAL_LOGIN_NOT_CONFIGURED";
      return respond({ error: error.code, correlationId }, unavailable ? 503 : 401);
    }
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return respond({ error: "RATE_LIMITED", correlationId }, 429);
    }
    logger.error("auth.web_social_login_failed_unexpectedly", error, { correlationId });
    return respond({ error: "AUTH_INTERNAL_ERROR", correlationId }, 500);
  }
}
