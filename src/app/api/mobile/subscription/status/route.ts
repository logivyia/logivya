import { subscriptionAccess } from "@/server/billing/subscription-access";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { serializeSubscription } from "@/server/mobile/subscription";

export async function GET(request: Request) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    const [subscription, entitlements] = await Promise.all([
      subscriptionAccess.getCurrent(company.id),
      subscriptionAccess.getSummary(company.id, { userId: user.id, role: membership.role }),
    ]);
    return mobileSuccess({
      subscription: serializeSubscription(subscription?.subscription ?? null),
      entitlements: { ...entitlements, emailVerificationRequired: !user.emailVerifiedAt },
    });
  } catch (error) {
    return mobileSafeError(error);
  }
}
