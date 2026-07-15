import { z } from "zod";

import { requireMobileAuth } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { replaceRecoveryCodes, verifyAndConsumeMfaCode } from "@/server/security/mfa";

const schema = z.object({ code: z.string().trim().min(6).max(64) });

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    const verification = await verifyAndConsumeMfaCode({ userId: context.user.id, code: parsed.data.code });
    if (!verification.ok) return mobileError(verification.reason, "Dogrulama kodu gecersiz.", { status: 401 });
    return mobileSuccess({ recoveryCodes: await replaceRecoveryCodes(context.user.id) });
  } catch (error) {
    return mobileSafeError(error);
  }
}
