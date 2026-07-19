import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { MFA_TRUSTED_DEVICE_COOKIE, notifyMfaSecurityChange, recordMfaSecurityEvent } from "@/server/auth/mfa-challenge";
import { requireApiSession, SESSION_COOKIE } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { verifyAndConsumeMfaCode } from "@/server/security/mfa";
import { verifyPassword } from "@/server/security/passwords";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

const schema = z.object({ password: z.string().min(1), code: z.string().trim().min(6).max(64) });

export async function POST(request: Request) {
  try {
    const context = await requireApiSession();
    const body = schema.parse(await request.json());
    await enforceOperationRateLimit({ scope: "mfa-disable", subject: context.user.id, maxAttempts: 5, windowMs: 30 * 60_000, request });
    const passwordValid = await verifyPassword(context.user.passwordHash, body.password, process.env.PASSWORD_PEPPER ?? "");
    const verification = passwordValid ? await verifyAndConsumeMfaCode({ userId: context.user.id, code: body.code }) : null;
    if (!passwordValid || !verification?.ok) {
      await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_DISABLE_FAILED", message: "MFA kapatma dogrulamasi basarisiz oldu.", severity: "HIGH" });
      return NextResponse.json({ error: "MFA_CONFIRMATION_INVALID" }, { status: 401 });
    }
    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({ where: { id: context.user.id }, data: { mfaRequired: false, mfaRequiredAt: null } }),
      prisma.mfaCredential.updateMany({ where: { userId: context.user.id, revokedAt: null }, data: { revokedAt: now, setupKey: null, setupTokenHash: null } }),
      prisma.trustedDevice.updateMany({ where: { userId: context.user.id, revokedAt: null }, data: { revokedAt: now } }),
      prisma.userSession.updateMany({ where: { userId: context.user.id, revokedAt: null }, data: { revokedAt: now } }),
      prisma.mobileDeviceSession.updateMany({ where: { userId: context.user.id, revokedAt: null }, data: { revokedAt: now } }),
      prisma.mfaLoginChallenge.updateMany({ where: { userId: context.user.id, consumedAt: null }, data: { consumedAt: now } }),
    ]);
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_DISABLED", message: "Iki adimli dogrulama kapatildi.", severity: "HIGH" });
    await notifyMfaSecurityChange({ userId: context.user.id, companyId: context.company.id, type: "security.mfa_disabled", title: "Iki adimli dogrulama kapatildi", message: "Bu islemi siz yapmadiysaniz hemen parolanizi degistirin." });
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);
    cookieStore.delete(MFA_TRUSTED_DEVICE_COOKIE);
    return NextResponse.json({ ok: true, signedOut: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "MFA_ERROR" }, { status: 400 });
  }
}
