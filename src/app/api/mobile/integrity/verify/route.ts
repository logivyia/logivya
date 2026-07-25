import { z } from "zod";

import { clientIp, enforceMobileRateLimit } from "@/server/mobile/rate-limit";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { logger } from "@/server/observability/logger";
import { getPlayIntegrityMode, verifyPlayIntegrityToken } from "@/server/security/play-integrity";

export const runtime = "nodejs";

const schema = z.object({
  challengeToken: z.string().min(64).max(4096),
  integrityToken: z.string().min(64).max(50_000),
});

export async function POST(request: Request) {
  try {
    enforceMobileRateLimit(`play-integrity-verify:${clientIp(request)}`, 30, 60 * 60_000);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);

    const result = await verifyPlayIntegrityToken(parsed.data.challengeToken, parsed.data.integrityToken);
    logger.info("play_integrity.verification", {
      configured: result.configured,
      verified: result.verified,
      verdict: result.verdict,
      reasons: result.reasons,
      mode: getPlayIntegrityMode(),
    });
    return mobileSuccess(result);
  } catch (error) {
    if (error instanceof Error && ["PLAY_INTEGRITY_CHALLENGE_INVALID", "PLAY_INTEGRITY_CHALLENGE_REPLAYED"].includes(error.message)) {
      return mobileError("PLAY_INTEGRITY_INVALID", "Play Integrity verification failed.", { status: 400 });
    }
    logger.error("play_integrity.verification_failed", error);
    return mobileSafeError(error, "Play Integrity verification is temporarily unavailable.");
  }
}
