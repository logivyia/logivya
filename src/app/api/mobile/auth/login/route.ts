import { z } from "zod";
import { hasPermission, PERMISSIONS } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/security/passwords";
import { createMobileSession, parseMobilePlatform } from "@/server/mobile/auth";
import { clientIp, enforceMobileRateLimit } from "@/server/mobile/rate-limit";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { logger } from "@/server/observability/logger";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import { writeAuditLog } from "@/server/security/audit";
import { resolvePreferredLoginMembership } from "@/server/team/login-membership";
import { createAndStoreMfaEnrollment } from "@/server/security/mfa";
import {
  findActiveTotpCredential,
  issueMfaChallenge,
  recordMfaSecurityEvent,
  validateTrustedDevice,
} from "@/server/auth/mfa-challenge";
import { keyedIdentifierHash } from "@/server/observability/privacy";
import { tryRecordSecurityEvent } from "@/server/security/events";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { authenticationDiagnostics } from "@/server/auth/diagnostics";

const schema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1),
  deviceId: z.string().min(3).max(160),
  platform: z.string().optional(),
  appVersion: z.string().max(40).optional(),
  trustedDeviceToken: z.string().min(32).max(256).optional(),
});

export async function POST(request: Request) {
  const diagnostics = authenticationDiagnostics(
    request,
    request.headers.get("x-client-platform"),
    request.headers.get("x-logivya-app-version"),
  );
  try {
    diagnostics.started("CREDENTIAL_VERIFICATION");
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;

    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);

    const ip = clientIp(request);
    enforceMobileRateLimit(`mobile-login:${ip}`, 20, 60 * 60_000);

    const identifier = parsed.data.identifier.toLowerCase();
    const phone = identifier.replace(/\D/g, "");
    await enforceOperationRateLimit({
      scope: "mobile-login-identifier",
      subject: identifier,
      maxAttempts: 20,
      windowMs: 15 * 60_000,
      request,
    });
    const recentFailures = await prisma.loginAttempt.count({
      where: { email: identifier, ipAddress: ip, success: false, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } },
    });
    if (recentFailures >= 5) {
      await tryRecordSecurityEvent({
        request,
        severity: "HIGH",
        type: "AUTH_RATE_LIMITED",
        message: "Mobile authentication attempt was rate limited.",
        result: "DENIED",
        source: "mobile-login",
        clientPlatform: parsed.data.platform,
        appVersion: parsed.data.appVersion,
        metadata: { identifierType: identifier.includes("@") ? "email" : "phone", identifierHash: keyedIdentifierHash(identifier) },
      });
      return mobileError("RATE_LIMITED", "Cok fazla basarisiz giris denemesi yapildi.", { status: 429 });
    }
    logger.info("Mobile login request received", {
      identifierType: identifier.includes("@") ? "email" : "phone",
      platform: parsed.data.platform,
      appVersion: parsed.data.appVersion,
    });

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier }, ...(phone.length >= 7 ? [{ phone }] : [])] },
    });
    const validPassword = user ? await verifyPassword(user.passwordHash, parsed.data.password, process.env.PASSWORD_PEPPER ?? "") : false;

    if (!user || user.status !== "ACTIVE" || !validPassword) {
      diagnostics.rejected("CREDENTIAL_VERIFICATION", "INVALID_CREDENTIALS", 401, { userId: user?.id });
      await prisma.loginAttempt.create({
        data: {
          userId: user?.id,
          email: identifier,
          ipAddress: ip,
          userAgent: request.headers.get("user-agent"),
          success: false,
          failureReason: "MOBILE_INVALID_CREDENTIALS",
        },
      });
      logger.warn("Mobile login rejected", {
        userFound: Boolean(user),
        userStatus: user?.status,
        reason: !user ? "USER_NOT_FOUND" : user.status !== "ACTIVE" ? "USER_NOT_ACTIVE" : "INVALID_PASSWORD",
      });
      await tryRecordSecurityEvent({
        request,
        userId: user?.id,
        severity: "MEDIUM",
        type: "AUTH_LOGIN_FAILED",
        message: "Mobile authentication credentials were rejected.",
        result: "DENIED",
        source: "mobile-login",
        errorCode: "INVALID_CREDENTIALS",
        clientPlatform: parsed.data.platform,
        appVersion: parsed.data.appVersion,
        metadata: { identifierType: identifier.includes("@") ? "email" : "phone", identifierHash: keyedIdentifierHash(identifier), knownUser: Boolean(user) },
      });
      return mobileError("UNAUTHORIZED", "E-posta/telefon veya parola hatalı.", { status: 401 });
    }

    diagnostics.succeeded("CREDENTIAL_VERIFICATION", { userId: user.id });
    const membership = await resolvePreferredLoginMembership(user.id, parsed.data.deviceId);
    if (!membership) {
      logger.warn("Mobile login rejected: active membership missing", { userId: user.id });
      return mobileError("FORBIDDEN", "Çalışma alanı bulunamadı.", { status: 403 });
    }

    const activeCredential = await findActiveTotpCredential(user.id);
    const trustedDevice = activeCredential
      ? await validateTrustedDevice(user.id, parsed.data.trustedDeviceToken, parsed.data.deviceId)
      : null;
    if ((activeCredential || user.mfaRequired) && !trustedDevice) {
      const purpose = activeCredential ? "LOGIN" as const : "SETUP" as const;
      diagnostics.started("CHALLENGE_CREATION", { userId: user.id });
      const challenge = await issueMfaChallenge({
        userId: user.id,
        companyId: membership.companyId,
        channel: "MOBILE",
        purpose,
        request,
        deviceId: parsed.data.deviceId,
        platform: parsed.data.platform,
        appVersion: parsed.data.appVersion,
      });
      diagnostics.succeeded("CHALLENGE_CREATION", { userId: user.id });
      const enrollment = purpose === "SETUP" ? await createAndStoreMfaEnrollment(user.id, user.email) : null;
      await recordMfaSecurityEvent({
        request,
        userId: user.id,
        companyId: membership.companyId,
        type: purpose === "SETUP" ? "MFA_SETUP_REQUIRED" : "MFA_CHALLENGE_ISSUED",
        message: purpose === "SETUP" ? "Mobil MFA kurulumu istendi." : "Mobil MFA kodu istendi.",
      });
      return mobileSuccess({
        mfaRequired: true as const,
        mfaSetupRequired: purpose === "SETUP",
        challengeToken: challenge.token,
        expiresAt: challenge.expiresAt.toISOString(),
        // Android v151 renders the MFA screen from this additive method contract.
        // Keep these fields present even while TOTP is the only login method.
        availableMethods: ["TOTP"] as const,
        selectedMethod: "TOTP" as const,
        preferredMethod: "TOTP" as const,
        recoveryAvailable: Boolean(activeCredential),
        ...(enrollment ?? {}),
        correlationId: diagnostics.correlationId,
      });
    }

    diagnostics.started("SESSION_CREATION", { userId: user.id });
    const tokens = await createMobileSession({
      userId: user.id,
      companyId: membership.companyId,
      role: membership.role,
      deviceId: parsed.data.deviceId,
      platform: parseMobilePlatform(parsed.data.platform),
      appVersion: parsed.data.appVersion,
      userAgent: request.headers.get("user-agent"),
      mfaVerified: Boolean(activeCredential),
    });
    diagnostics.succeeded("SESSION_CREATION", { userId: user.id });
    await prisma.loginAttempt.create({
      data: { userId: user.id, email: user.email, ipAddress: ip, userAgent: request.headers.get("user-agent"), success: true },
    });
    await writeAuditLog(request, {
      companyId: membership.companyId,
      userId: user.id,
      actorType: "USER",
      actorEmail: user.email,
      action: "AUTH_LOGIN_SUCCEEDED",
      result: "SUCCESS",
      entityType: "MobileDeviceSession",
      after: { deviceId: parsed.data.deviceId, platform: parsed.data.platform },
    });
    await tryRecordSecurityEvent({
      request,
      companyId: membership.companyId,
      userId: user.id,
      severity: "INFO",
      type: "AUTH_LOGIN_SUCCEEDED",
      message: "Mobile authentication succeeded.",
      result: "SUCCESS",
      status: "RESOLVED",
      source: "mobile-login",
      clientPlatform: parsed.data.platform,
      appVersion: parsed.data.appVersion,
    });

    const isPlatformAdmin = isAuthorizedLogivyaPlatformAdmin({ email: user.email });

    diagnostics.succeeded("TOKEN_OR_COOKIE_DELIVERY", { userId: user.id, statusCode: 200 });
    return mobileSuccess({
      tokens,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, locale: user.locale, role: membership.role, isPlatformAdmin },
      company: { id: membership.company.id, name: membership.company.name },
      role: membership.role,
      isAdmin: isPlatformAdmin,
      isPlatformAdmin,
      permissions: PERMISSIONS.filter((permission) => hasPermission(membership.role, permission)),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MOBILE_AUTH_SECRET_MISSING") {
      diagnostics.failed("SESSION_CREATION", error);
      return mobileError("CONFIGURATION_ERROR", "Mobil kimlik doğrulama yapılandırılmamış.", { status: 503 });
    }
    diagnostics.failed("CREDENTIAL_VERIFICATION", error);
    logger.error("Mobile login failed unexpectedly", error);
    return mobileSafeError(error);
  }
}
