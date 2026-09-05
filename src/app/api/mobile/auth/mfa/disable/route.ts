import { z } from "zod";

import { notifyMfaSecurityChange, recordMfaSecurityEvent, revokeUserSecuritySessions } from "@/server/auth/mfa-challenge";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { disableMfaMethod, enabledMfaMethods } from "@/server/security/mfa-policy";
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
    const context = await requireMobileAuth(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    await enforceOperationRateLimit({ scope: "mobile-mfa-disable", subject: context.user.id, maxAttempts: 5, windowMs: 30 * 60_000, request });
    await verifySettingsPassword(context.user.id, context.user.passwordHash, parsed.data.password);
    const methods = await enabledMfaMethods(context.user.id);
    const totpEnabled = methods.some((method) => method.type === "TOTP");
    const emailEnabled = methods.some((method) => method.type === "EMAIL_OTP");
    const verificationMethod = parsed.data.verificationMethod
      ?? (parsed.data.stepUpToken || (parsed.data.method === "EMAIL_OTP" && !totpEnabled)
        ? "EMAIL_OTP"
        : "TOTP");
    if (verificationMethod === "EMAIL_OTP") {
      if (!emailEnabled) throw new Error("MFA_METHOD_NOT_ENABLED");
      if (!parsed.data.stepUpToken) throw new Error("RECENT_AUTHENTICATION_REQUIRED");
      await verifyEmailStepUp({ userId: context.user.id, token: parsed.data.stepUpToken, code: parsed.data.code, channel: "MOBILE", deviceId: context.deviceId });
    } else {
      if (!totpEnabled) throw new Error("MFA_METHOD_NOT_ENABLED");
      await verifyTotpSettingsFactor(context.user.id, parsed.data.code);
    }
    const result = await disableMfaMethod({ userId: context.user.id, method: parsed.data.method, companyPolicy: context.company.mfaPolicy, role: context.membership.role });
    await Promise.all([
      prisma.trustedDevice.updateMany({ where: { userId: context.user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      revokeUserSecuritySessions(context.user.id, { mobileSessionId: context.sessionId }),
    ]);
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_METHOD_DISABLED", message: `${parsed.data.method} doğrulama yöntemi mobil uygulamadan kapatıldı.`, severity: "HIGH", metadata: { method: parsed.data.method } });
    await notifyMfaSecurityChange({ userId: context.user.id, companyId: context.company.id, type: "security.mfa_method_disabled", title: "Güvenlik yöntemi kapatıldı", message: `${parsed.data.method === "TOTP" ? "Authenticator" : "E-posta"} doğrulaması hesabınızda kapatıldı.` });
    return mobileSuccess({ ok: true, signedOut: false, ...result });
  } catch (error) {
    return mobileSafeError(error);
  }
}
