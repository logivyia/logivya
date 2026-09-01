import { z } from "zod";

import { notifyMfaSecurityChange, recordMfaSecurityEvent } from "@/server/auth/mfa-challenge";
import { requireMobileAuth } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { confirmEmailMfaEnrollment } from "@/server/security/mfa-email";

const schema = z.object({ setupToken: z.string().min(32).max(256), code: z.string().regex(/^\d{6}$/u) });

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    const result = await confirmEmailMfaEnrollment({ userId: context.user.id, setupToken: parsed.data.setupToken, code: parsed.data.code, channel: "MOBILE" });
    if (!result.ok) {
      const isLocked = "locked" in result && result.locked;
      return mobileError(result.reason, "Doğrulama kodu geçersiz.", { status: isLocked ? 429 : 401 });
    }
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_EMAIL_ENABLED", message: "E-posta ile doğrulama etkinleştirildi." });
    await notifyMfaSecurityChange({ userId: context.user.id, companyId: context.company.id, type: "security.mfa_email_enabled", title: "E-posta doğrulaması etkin", message: "E-posta ile doğrulama hesabınızda etkinleştirildi." });
    return mobileSuccess({ ok: true });
  } catch (error) {
    return mobileSafeError(error);
  }
}
