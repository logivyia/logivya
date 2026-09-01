import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { loginSchema } from "@/features/auth/schemas";
import {
  issueMfaChallenge,
  MFA_CHALLENGE_COOKIE,
  MFA_CHALLENGE_TTL_MS,
  MFA_TRUSTED_DEVICE_COOKIE,
  recordMfaSecurityEvent,
  requestIp,
  validateTrustedDevice,
  sendEmailOtpForChallenge,
} from "@/server/auth/mfa-challenge";
import {
  authCorrelationId,
  authNoStoreHeaders,
  publicAuthErrorBody,
  publicAuthFailure,
} from "@/server/auth/public-errors";
import { createSession } from "@/server/auth/session";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/security/passwords";
import { createAndStoreMfaEnrollment } from "@/server/security/mfa";
import { resolvePreferredLoginMembership } from "@/server/team/login-membership";
import { keyedIdentifierHash } from "@/server/observability/privacy";
import { tryRecordSecurityEvent } from "@/server/security/events";
import { writeAuditLog } from "@/server/security/audit";
import { logger } from "@/server/observability/logger";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { assertWebMutationOrigin } from "@/server/security/request-origin";
import { resolveMfaLoginDecision } from "@/server/security/mfa-policy";
import {
  assertTemporaryPasswordTenantAccess,
  issueTemporaryPasswordChangeChallenge,
} from "@/server/auth/temporary-password";

const schema = loginSchema.extend({
  deviceFingerprint: z.string().trim().min(8).max(160).optional(),
  deviceName: z.string().trim().max(120).optional(),
});

async function handleLogin(request: Request, correlationId: string) {
  const ipAddress = requestIp(request);
  const userAgent = request.headers.get("user-agent");
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "auth.invalidCredentials" }, { status: 400 });

  const identifier = parsed.data.identifier.trim().toLowerCase();
  const normalizedPhone = identifier.replace(/\D/gu, "");
  try {
    await Promise.all([
      enforceOperationRateLimit({ scope: "web-login-ip", subject: ipAddress, maxAttempts: 60, windowMs: 15 * 60_000, request }),
      enforceOperationRateLimit({ scope: "web-login-identifier", subject: identifier, maxAttempts: 20, windowMs: 15 * 60_000, request }),
    ]);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "RATE_LIMITED") throw error;
    await tryRecordSecurityEvent({
      request,
      severity: "HIGH",
      type: "AUTH_RATE_LIMITED",
      message: "Authentication traffic was rate limited.",
      result: "DENIED",
      source: "web-login",
      metadata: { identifierType: identifier.includes("@") ? "email" : "phone", identifierHash: keyedIdentifierHash(identifier) },
    });
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }
  const recentFailures = await prisma.loginAttempt.count({
    where: { email: identifier, ipAddress, success: false, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } },
  });
  if (recentFailures >= 5) {
    await tryRecordSecurityEvent({
      request,
      severity: "HIGH",
      type: "AUTH_RATE_LIMITED",
      message: "Authentication attempt was rate limited.",
      result: "DENIED",
      source: "web-login",
      metadata: { identifierType: identifier.includes("@") ? "email" : "phone", identifierHash: keyedIdentifierHash(identifier) },
    });
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, ...(normalizedPhone.length >= 7 ? [{ phone: normalizedPhone }] : [])] },
  });

  if (!user || user.status !== "ACTIVE" || !(await verifyPassword(user.passwordHash, parsed.data.password, process.env.PASSWORD_PEPPER ?? ""))) {
    await prisma.loginAttempt.create({
      data: { userId: user?.id, email: identifier, ipAddress, userAgent, success: false, failureReason: "INVALID_CREDENTIALS" },
    });
    await tryRecordSecurityEvent({
      request,
      userId: user?.id,
      severity: "MEDIUM",
      type: "AUTH_LOGIN_FAILED",
      message: "Authentication credentials were rejected.",
      result: "DENIED",
      source: "web-login",
      errorCode: "INVALID_CREDENTIALS",
      metadata: { identifierType: identifier.includes("@") ? "email" : "phone", identifierHash: keyedIdentifierHash(identifier), knownUser: Boolean(user) },
    });
    const failure = publicAuthFailure("INVALID_CREDENTIALS");
    return NextResponse.json(
      publicAuthErrorBody(failure.code, correlationId),
      { status: failure.status },
    );
  }

  const membership = await resolvePreferredLoginMembership(user.id);
  if (!membership) return NextResponse.json({ error: "auth.workspaceUnavailable" }, { status: 403 });

  if (user.mustChangePassword) {
    await assertTemporaryPasswordTenantAccess(user.id, membership.companyId);
    const challenge = await issueTemporaryPasswordChangeChallenge({
      userId: user.id,
      companyId: membership.companyId,
      channel: "WEB",
      deviceId: parsed.data.deviceFingerprint,
      platform: "WEB",
    });
    await writeAuditLog(request, {
      companyId: membership.companyId,
      userId: user.id,
      actorType: "USER",
      actorEmail: user.email,
      action: "USER_FIRST_LOGIN",
      result: "SUCCESS",
      entityType: "User",
      entityId: user.id,
      after: { passwordChangeRequired: true, channel: "WEB" },
    });
    return NextResponse.json({
      ok: false,
      passwordChangeRequired: true,
      challengeToken: challenge.token,
      expiresAt: challenge.expiresAt.toISOString(),
    }, { status: 202, headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" } });
  }

  const mfa = await resolveMfaLoginDecision({
    userId: user.id,
    companyPolicy: membership.company.mfaPolicy,
    role: membership.role,
    legacyRequired: user.mfaRequired,
    preferredMethod: user.preferredMfaMethod,
  });
  const trustedToken = (await cookies()).get(MFA_TRUSTED_DEVICE_COOKIE)?.value;
  const trustedDevice = mfa.enabledMethods.length ? await validateTrustedDevice(user.id, trustedToken, parsed.data.deviceFingerprint) : null;

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
    const cookieStore = await cookies();
    cookieStore.set(MFA_CHALLENGE_COOKIE, challenge.token, {
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
      message: purpose === "SETUP" ? "İki adımlı doğrulama kurulumu istendi." : "İki adımlı doğrulama kodu istendi.",
    });
    return NextResponse.json(
      {
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
      },
      { status: 202, headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" } },
    );
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
    tryRecordSecurityEvent({
      request,
      companyId: membership.companyId,
      userId: user.id,
      severity: "INFO",
      type: "AUTH_LOGIN_SUCCEEDED",
      message: "Authentication succeeded.",
      result: "SUCCESS",
      status: "RESOLVED",
      source: "web-login",
    }),
    writeAuditLog(request, {
      companyId: membership.companyId,
      userId: user.id,
      actorType: "USER",
      actorEmail: user.email,
      action: "AUTH_LOGIN_SUCCEEDED",
      entityType: "UserSession",
      result: "SUCCESS",
      after: { platform: "web", mfaVerified: mfa.enabledMethods.length > 0 },
    }).catch((error) => logger.error("audit.auth_login_succeeded.write_failed", error, { companyId: membership.companyId, userId: user.id })),
  ]);

  const isPlatformAdmin = isAuthorizedLogivyaPlatformAdmin({ email: user.email });
  if (isPlatformAdmin) {
    const admin = await prisma.platformAdmin.findUnique({ where: { userId: user.id } });
    await prisma.adminAccessLog.create({
      data: { userId: user.id, path: "/login", method: "POST", purpose: "ADMIN_LOGIN", permission: "platform:read", sensitive: true, ipAddress, userAgent },
    });
    if (admin) await prisma.platformAdmin.update({ where: { userId: user.id }, data: { lastElevatedAt: new Date() } });
    await prisma.adminSessionEvent.create({ data: { userId: user.id, type: "ADMIN_LOGIN", ipAddress, userAgent } });
  }

  return NextResponse.json({ ok: true, isAdmin: isPlatformAdmin, isPlatformAdmin });
}

export async function POST(request: Request) {
  const correlationId = authCorrelationId(request);
  // Login CSRF matters before a session exists too. Reject before DB/password work.
  try { assertWebMutationOrigin(request); }
  catch {
    return NextResponse.json({ error: "CSRF_REJECTED" }, { status: 403, headers: authNoStoreHeaders(correlationId) });
  }
  try {
    const response = await handleLogin(request, correlationId);
    for (const [name, value] of Object.entries(authNoStoreHeaders(correlationId))) {
      response.headers.set(name, value);
    }
    return response;
  } catch (error) {
    logger.error("auth.web_login_failed_unexpectedly", error, { correlationId });
    const failure = publicAuthFailure(
      error instanceof Error ? error.message : "AUTH_INTERNAL_ERROR",
    );
    return NextResponse.json(
      publicAuthErrorBody(failure.code, correlationId),
      {
        status: failure.status,
        headers: authNoStoreHeaders(correlationId),
      },
    );
  }
}
