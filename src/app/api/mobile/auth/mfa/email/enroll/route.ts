import { z } from "zod";

import { recordMfaSecurityEvent } from "@/server/auth/mfa-challenge";
import { requireMobileAuth } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { startEmailMfaEnrollment } from "@/server/security/mfa-email";
import { verifySettingsPassword, verifyTotpSettingsFactor } from "@/server/security/mfa-settings";

const schema = z.object({ password: z.string().min(1), currentCode: z.string().trim().min(6).max(64).optional() });

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    await verifySettingsPassword(context.user.id, context.user.passwordHash, parsed.data.password);
    await verifyTotpSettingsFactor(context.user.id, parsed.data.currentCode, true);
    const enrollment = await startEmailMfaEnrollment({ userId: context.user.id, companyId: context.company.id, channel: "MOBILE", request, deviceId: context.deviceId, platform: context.platform });
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_EMAIL_ENROLLMENT_STARTED", message: "Mobil e-posta doğrulama kurulumu başlatıldı." });
    return mobileSuccess(enrollment);
  } catch (error) {
    return mobileSafeError(error);
  }
}
