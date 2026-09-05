import { getGooglePlayPurchaseContext } from "@/server/billing/google-play-subscriptions";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { company, user } = await requireMobileAuth(request);
    return mobileSuccess(
      await getGooglePlayPurchaseContext({
        companyId: company.id,
        userId: user.id,
      }),
    );
  } catch (error) {
    return mobileSafeError(
      error,
      "Google Play subscription information could not be loaded.",
    );
  }
}
