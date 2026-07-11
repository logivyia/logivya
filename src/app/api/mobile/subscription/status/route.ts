import { subscriptionAccess } from "@/server/billing/subscription-access";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { serializeSubscription } from "@/server/mobile/subscription";

export async function GET(request: Request) {
  try {
    const { company } = await requireMobileAuth(request);
    const [subscription, entitlements] = await Promise.all([
      subscriptionAccess.getCurrent(company.id),
      subscriptionAccess.getSummary(company.id),
    ]);
    return mobileSuccess({ subscription: serializeSubscription(subscription?.subscription ?? null), entitlements });
  } catch (error) {
    return mobileSafeError(error);
  }
}
