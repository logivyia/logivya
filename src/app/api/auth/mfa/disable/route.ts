import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { MFA_TRUSTED_DEVICE_COOKIE, notifyMfaSecurityChange, recordMfaSecurityEvent, revokeUserSecuritySessions } from "@/server/auth/mfa-challenge";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { enabledMfaMethods, disableMfaMethod } from "@/server/security/mfa-policy";
import { verifyEmailStepUp, verifySettingsPassword, verifyTotpSettingsFactor } from "@/server/security/mfa-settings";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

const schema = z.object({
  method: z.enum(["TOTP", "EMAIL_OTP"]).optional().default("TOTP"),
  verificationMethod: z.enum(["TOTP", "EMAIL_OTP"]).optional(),
  password: z.string().min(1),
  code: z.string().trim().min(6).max(64),
  stepUpToken: z.string().min(32).max(256).optional(),
});

export async function POST(request: Request) {
  try {
    const context = await requireApiSession();
    const body = schema.parse(await request.json());
    await enforceOperationRateLimit({ scope: "mfa-disable", subject: context.user.id, maxAttempts: 5, windowMs: 30 * 60_000, request });
    await verifySettingsPassword(context.user.id, context.user.passwordHash, body.password);
    const methods = await enabledMfaMethods(context.user.id);
    const totpEnabled = methods.some((method) => method.type === "TOTP");
    const emailEnabled = methods.some((method) => method.type === "EMAIL_OTP");
    const verificationMethod = body.verificationMethod
      ?? (body.stepUpToken || (body.method === "EMAIL_OTP" && !totpEnabled)
        ? "EMAIL_OTP"
        : "TOTP");
    if (verificationMethod === "EMAIL_OTP") {
      if (!emailEnabled) throw new Error("MFA_METHOD_NOT_ENABLED");
      if (!body.stepUpToken) throw new Error("RECENT_AUTHENTICATION_REQUIRED");
      await verifyEmailStepUp({ userId: context.user.id, token: body.stepUpToken, code: body.code, channel: "WEB" });
    } else {
      if (!totpEnabled) throw new Error("MFA_METHOD_NOT_ENABLED");
      await verifyTotpSettingsFactor(context.user.id, body.code);
    }
    const result = await disableMfaMethod({ userId: context.user.id, method: body.method, companyPolicy: context.company.mfaPolicy, role: context.membership.role });
    await Promise.all([
      prisma.trustedDevice.updateMany({ where: { userId: context.user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      revokeUserSecuritySessions(context.user.id, { webSessionId: context.session.id }),
    ]);
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_METHOD_DISABLED", message: `${body.method} doğrulama yöntemi kapatıldı.`, severity: "HIGH", metadata: { method: body.method } });
    await notifyMfaSecurityChange({ userId: context.user.id, companyId: context.company.id, type: "security.mfa_method_disabled", title: "Güvenlik yöntemi kapatıldı", message: `${body.method === "TOTP" ? "Authenticator" : "E-posta"} doğrulaması hesabınızda kapatıldı.` });
    (await cookies()).delete(MFA_TRUSTED_DEVICE_COOKIE);
    return NextResponse.json({ ok: true, signedOut: false, ...result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "MFA_ERROR";
    const status = code === "MFA_METHOD_REQUIRED_BY_POLICY" ? 409 : code === "PASSWORD_CONFIRMATION_REQUIRED" || code.includes("INVALID") ? 401 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
