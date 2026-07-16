import { z } from "zod";
import { rotateRefreshToken } from "@/server/mobile/auth";
import { clientIp } from "@/server/mobile/rate-limit";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { hashOpaqueToken } from "@/server/security/authentication";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

const schema = z.object({ refreshToken: z.string().min(20) });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    await enforceOperationRateLimit({
      scope: "mobile-refresh",
      subject: `${clientIp(request)}:${hashOpaqueToken(parsed.data.refreshToken).slice(0, 16)}`,
      maxAttempts: 90,
      windowMs: 60 * 60_000,
      request,
    });
    return mobileSuccess({ tokens: await rotateRefreshToken(parsed.data.refreshToken, request) });
  } catch (error) {
    return mobileSafeError(error, "Oturum yenilenemedi.");
  }
}
