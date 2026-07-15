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

const schema = loginSchema.extend({
  deviceFingerprint: z.string().trim().min(8).max(160).optional(),
  deviceName: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  const ipAddress = requestIp(request);
  const userAgent = request.headers.get("user-agent");
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "auth.invalidCredentials" }, { status: 400 });

  const identifier = parsed.data.identifier.trim().toLowerCase();
  const normalizedPhone = identifier.replace(/\D/gu, "");
  const recentFailures = await prisma.loginAttempt.count({
    where: { email: identifier, ipAddress, success: false, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } },
  });
  if (recentFailures >= 5) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, ...(normalizedPhone.length >= 7 ? [{ phone: normalizedPhone }] : [])] },
  });

  if (!user || user.status !== "ACTIVE" || !(await verifyPassword(user.passwordHash, parsed.data.password, process.env.PASSWORD_PEPPER ?? ""))) {
    await prisma.loginAttempt.create({
      data: { userId: user?.id, email: identifier, ipAddress, userAgent, success: false, failureReason: "INVALID_CREDENTIALS" },
    });
    return NextResponse.json({ error: "auth.invalidCredentials" }, { status: 401 });
  }

  const membership = await resolvePreferredLoginMembership(user.id);
  if (!membership) return NextResponse.json({ error: "auth.workspaceUnavailable" }, { status: 403 });

  const activeCredential = await findActiveMfaCredential(user.id);
  const trustedToken = (await cookies()).get(MFA_TRUSTED_DEVICE_COOKIE)?.value;
  const trustedDevice = activeCredential ? await validateTrustedDevice(user.id, trustedToken, parsed.data.deviceFingerprint) : null;

  if ((activeCredential || user.mfaRequired) && !trustedDevice) {
    const purpose = activeCredential ? "LOGIN" as const : "SETUP" as const;
    const challenge = await issueMfaChallenge({
      userId: user.id,
      companyId: membership.companyId,
      channel: "WEB",
      purpose,
      request,
      deviceId: parsed.data.deviceFingerprint,
      platform: "WEB",
    });
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
    }, { status: 202 });
  }

  await createSession(user.id, membership.companyId, request, { mfaVerified: Boolean(activeCredential) });
  await prisma.loginAttempt.create({
    data: { userId: user.id, email: user.email, ipAddress, userAgent, success: true },
  });

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
