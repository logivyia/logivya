import { z } from "zod";

import { requireMobileAuth } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { setPreferredMfaMethod } from "@/server/security/mfa-policy";
import { verifySettingsPassword, verifyTotpSettingsFactor } from "@/server/security/mfa-settings";

const schema = z.object({ method: z.enum(["TOTP", "EMAIL_OTP"]), password: z.string().min(1), currentCode: z.string().trim().min(6).max(64) });

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    await verifySettingsPassword(context.user.id, context.user.passwordHash, parsed.data.password);
    await verifyTotpSettingsFactor(context.user.id, parsed.data.currentCode);
    return mobileSuccess({ ok: true, preferredMethod: await setPreferredMfaMethod(context.user.id, parsed.data.method) });
  } catch (error) {
    return mobileSafeError(error);
  }
}
