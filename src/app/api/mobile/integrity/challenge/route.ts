import { z } from "zod";

import { clientIp, enforceMobileRateLimit } from "@/server/mobile/rate-limit";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { getPlayIntegrityMode, issuePlayIntegrityChallenge } from "@/server/security/play-integrity";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["APP_START", "ACCOUNT_SECURITY", "BILLING"]),
});

export async function POST(request: Request) {
  try {
    enforceMobileRateLimit(`play-integrity-challenge:${clientIp(request)}`, 30, 60 * 60_000);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);

    const mode = getPlayIntegrityMode();
    if (mode === "off") return mobileSuccess({ available: false, mode });
    return mobileSuccess({ available: true, mode, ...issuePlayIntegrityChallenge(parsed.data.action) });
  } catch (error) {
    return mobileSafeError(error, "Play Integrity challenge could not be created.");
  }
}
