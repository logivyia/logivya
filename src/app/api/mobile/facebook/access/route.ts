import { facebookProviderHealthSummary } from "@/server/facebook/constants";
import { resolveFacebookPagesAccess } from "@/server/facebook/access";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    const enabled = await resolveFacebookPagesAccess(auth.user.id, auth.platform);
    const provider = facebookProviderHealthSummary();
    return mobileSuccess({ enabled, configured: provider.configured, provider });
  } catch (error) {
    return mobileSafeError(error);
  }
}
