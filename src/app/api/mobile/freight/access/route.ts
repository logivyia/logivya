import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { resolveFreightMarketplaceAccess } from "@/server/freight/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { user } = await requireMobileAuth(request);
    const access = await resolveFreightMarketplaceAccess(user.id);
    return mobileSuccess({ enabled: access.enabled, audience: access.audience });
  } catch (error) {
    return mobileSafeError(error);
  }
}
