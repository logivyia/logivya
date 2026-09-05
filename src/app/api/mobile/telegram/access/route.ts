import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { resolveTelegramAccessAudience } from "@/server/telegram/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    const audience = await resolveTelegramAccessAudience(auth.user.id, auth.platform);
    return mobileSuccess({ enabled: audience !== null, audience });
  } catch (error) {
    return mobileSafeError(error);
  }
}
