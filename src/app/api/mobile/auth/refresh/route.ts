import { z } from "zod";
import { rotateRefreshToken } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";

const schema = z.object({ refreshToken: z.string().min(20) });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    return mobileSuccess({ tokens: await rotateRefreshToken(parsed.data.refreshToken, request) });
  } catch (error) {
    return mobileSafeError(error, "Oturum yenilenemedi.");
  }
}
