import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  consumeMfaChallenge,
  MFA_CHALLENGE_COOKIE,
  MFA_TRUSTED_DEVICE_COOKIE,
  readMfaChallenge,
  recordMfaSecurityEvent,
  registerMfaChallengeFailure,
  requestIp,
  trustDevice,
} from "@/server/auth/mfa-challenge";
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
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "MFA_CODE_INVALID" }, { status: 400 });
    const cookieStore = await cookies();
    const challengeToken = cookieStore.get(MFA_CHALLENGE_COOKIE)?.value;
    if (!challengeToken) return NextResponse.json({ error: "MFA_CHALLENGE_INVALID" }, { status: 401 });

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

    const verification = await verifyAndConsumeMfaCode({
      userId: challenge.userId,
      code: parsed.data.code,
      allowUnverifiedCredential: challenge.purpose === "SETUP",
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
        message: "Iki adimli dogrulama basarisiz oldu.",
        severity: failure.locked ? "HIGH" : "MEDIUM",
        metadata: { attempts: failure.attempts, reason: verification.reason },
      });
      return NextResponse.json(
        { error: failure.locked ? "MFA_CHALLENGE_LOCKED" : verification.reason, attemptsRemaining: Math.max(0, 5 - failure.attempts) },
        { status: failure.locked ? 429 : 401 },
      );
    }

    if (challenge.purpose === "SETUP") {
      await activateMfaCredential(challenge.userId, verification.credentialId);
    }
    await consumeMfaChallenge(challenge.id);
    await createSession(challenge.userId, challenge.companyId, request, { mfaVerified: true });
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
    return NextResponse.json({ ok: true, isAdmin: isPlatformAdmin, isPlatformAdmin });
  } catch (error) {
    const code = error instanceof Error ? error.message : "MFA_ERROR";
    const status = code === "RATE_LIMITED" || code === "MFA_CHALLENGE_LOCKED" ? 429 : 401;
    return NextResponse.json({ error: code }, { status });
  }
}
