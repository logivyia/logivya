import { z } from "zod";

import { notifyMfaSecurityChange, recordMfaSecurityEvent } from "@/server/auth/mfa-challenge";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { verifyAndConsumeMfaCode } from "@/server/security/mfa";
import { verifyPassword } from "@/server/security/passwords";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

const schema = z.object({ password: z.string().min(1), code: z.string().trim().min(6).max(64) });

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    await enforceOperationRateLimit({ scope: "mobile-mfa-disable", subject: context.user.id, maxAttempts: 5, windowMs: 30 * 60_000, request });
    const passwordValid = await verifyPassword(context.user.passwordHash, parsed.data.password, process.env.PASSWORD_PEPPER ?? "");
    const verification = passwordValid ? await verifyAndConsumeMfaCode({ userId: context.user.id, code: parsed.data.code }) : null;
    if (!passwordValid || !verification?.ok) return mobileError("MFA_CONFIRMATION_INVALID", "Parola veya dogrulama kodu gecersiz.", { status: 401 });
    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({ where: { id: context.user.id }, data: { mfaRequired: false, mfaRequiredAt: null } }),
      prisma.mfaCredential.updateMany({ where: { userId: context.user.id, revokedAt: null }, data: { revokedAt: now, setupKey: null, setupTokenHash: null } }),
      prisma.trustedDevice.updateMany({ where: { userId: context.user.id, revokedAt: null }, data: { revokedAt: now } }),
      prisma.userSession.updateMany({ where: { userId: context.user.id, revokedAt: null }, data: { revokedAt: now } }),
      prisma.mobileDeviceSession.updateMany({ where: { userId: context.user.id, revokedAt: null }, data: { revokedAt: now } }),
      prisma.mfaLoginChallenge.updateMany({ where: { userId: context.user.id, consumedAt: null }, data: { consumedAt: now } }),
    ]);
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_DISABLED", message: "Iki adimli dogrulama mobil uygulamadan kapatildi.", severity: "HIGH" });
    await notifyMfaSecurityChange({ userId: context.user.id, companyId: context.company.id, type: "security.mfa_disabled", title: "Iki adimli dogrulama kapatildi", message: "Bu islemi siz yapmadiysaniz hemen parolanizi degistirin." });
    return mobileSuccess({ ok: true, signedOut: true });
  } catch (error) {
    return mobileSafeError(error);
  }
}
