import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { resolveTelegramInternalAccess } from "@/server/telegram/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    const enabled = await resolveTelegramInternalAccess(auth.user.id, auth.platform);
    return mobileSuccess({ enabled, audience: enabled ? "internal" : null });
  } catch (error) {
    return mobileSafeError(error);
  }
}

