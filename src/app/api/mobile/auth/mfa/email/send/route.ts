import { z } from "zod";

import { readMfaChallenge, sendEmailOtpForChallenge } from "@/server/auth/mfa-challenge";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";

const schema = z.object({ challengeToken: z.string().min(32).max(256), deviceId: z.string().min(3).max(160) });

export async function POST(request: Request) {
  try {
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    const challenge = await readMfaChallenge(parsed.data.challengeToken, "MOBILE");
    if (challenge.deviceId && challenge.deviceId !== parsed.data.deviceId) throw new Error("MFA_DEVICE_MISMATCH");
    const result = await sendEmailOtpForChallenge({ token: parsed.data.challengeToken, channel: "MOBILE" });
    return mobileSuccess({ ...result, expiresAt: result.expiresAt.toISOString() });
  } catch (error) {
    return mobileSafeError(error);
  }
}
