import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { loginSchema } from "@/features/auth/schemas";
import {
  findActiveMfaCredential,
  issueMfaChallenge,
  MFA_CHALLENGE_COOKIE,
  MFA_CHALLENGE_TTL_MS,
  MFA_TRUSTED_DEVICE_COOKIE,
  recordMfaSecurityEvent,
  requestIp,
  validateTrustedDevice,
} from "@/server/auth/mfa-challenge";
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
import { authenticationDiagnostics, authenticationResponseHeaders } from "@/server/auth/diagnostics";

const schema = loginSchema.extend({
  deviceFingerprint: z.string().trim().min(8).max(160).optional(),
  deviceName: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  const diagnostics = authenticationDiagnostics(request, "web");
  const responseHeaders = authenticationResponseHeaders(diagnostics.correlationId);
  diagnostics.started("CREDENTIAL_VERIFICATION");
  const ipAddress = requestIp(request);
  const userAgent = request.headers.get("user-agent");
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    diagnostics.rejected("CREDENTIAL_VERIFICATION", "INVALID_CREDENTIALS", 400);
    return NextResponse.json(
      { error: "auth.invalidCredentials", correlationId: diagnostics.correlationId },
      { status: 400, headers: responseHeaders },
    );
  }

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
    diagnostics.rejected("CREDENTIAL_VERIFICATION", "INVALID_CREDENTIALS", 401, { userId: user?.id });
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
    return NextResponse.json(
      { error: "auth.invalidCredentials", correlationId: diagnostics.correlationId },
      { status: 401, headers: responseHeaders },
    );
  }
  diagnostics.succeeded("CREDENTIAL_VERIFICATION", { userId: user.id });

  const membership = await resolvePreferredLoginMembership(user.id);
  if (!membership) return NextResponse.json({ error: "auth.workspaceUnavailable" }, { status: 403 });

  const activeCredential = await findActiveMfaCredential(user.id);
  const trustedToken = (await cookies()).get(MFA_TRUSTED_DEVICE_COOKIE)?.value;
  const trustedDevice = activeCredential ? await validateTrustedDevice(user.id, trustedToken, parsed.data.deviceFingerprint) : null;

  if ((activeCredential || user.mfaRequired) && !trustedDevice) {
    const purpose = activeCredential ? "LOGIN" as const : "SETUP" as const;
    diagnostics.started("CHALLENGE_CREATION", { userId: user.id });
    const challenge = await issueMfaChallenge({
      userId: user.id,
      companyId: membership.companyId,
      channel: "WEB",
      purpose,
      request,
      deviceId: parsed.data.deviceFingerprint,
      platform: "WEB",
    });
    diagnostics.succeeded("CHALLENGE_CREATION", { userId: user.id });
    const enrollment = purpose === "SETUP" ? await createAndStoreMfaEnrollment(user.id, user.email) : null;
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
      message: purpose === "SETUP" ? "Iki adimli dogrulama kurulumu istendi." : "Iki adimli dogrulama kodu istendi.",
    });
    return NextResponse.json({
      ok: false,
      mfaRequired: true,
      mfaSetupRequired: purpose === "SETUP",
      expiresAt: challenge.expiresAt.toISOString(),
      ...(enrollment ?? {}),
      correlationId: diagnostics.correlationId,
    }, { status: 202, headers: responseHeaders });
  }

  diagnostics.started("SESSION_CREATION", { userId: user.id });
  await createSession(user.id, membership.companyId, request, {
    mfaVerified: Boolean(activeCredential),
    deviceName: parsed.data.deviceName,
    deviceFingerprint: parsed.data.deviceFingerprint,
  });
  diagnostics.succeeded("SESSION_CREATION", { userId: user.id });
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
      after: { platform: "web", mfaVerified: Boolean(activeCredential) },
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

  diagnostics.succeeded("TOKEN_OR_COOKIE_DELIVERY", { userId: user.id, statusCode: 200 });
  return NextResponse.json(
    { ok: true, isAdmin: isPlatformAdmin, isPlatformAdmin, correlationId: diagnostics.correlationId },
    { headers: responseHeaders },
  );
}
