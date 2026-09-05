import { z } from "zod";

import { readMobileJson } from "@/server/mobile/request-json";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { chooseMfaChallengeMethod } from "@/server/security/mfa-login-method";

const schema = z.object({ challengeToken: z.string().min(32).max(256), method: z.enum(["TOTP", "EMAIL_OTP"]), deviceId: z.string().min(3).max(160) });

export async function POST(request: Request) {
  try {
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    return mobileSuccess(await chooseMfaChallengeMethod({ token: parsed.data.challengeToken, channel: "MOBILE", method: parsed.data.method, deviceId: parsed.data.deviceId }));
  } catch (error) {
    return mobileSafeError(error);
  }
}
