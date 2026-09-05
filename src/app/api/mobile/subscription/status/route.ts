import { subscriptionAccess } from "@/server/billing/subscription-access";
import { getNormalizedPlanCatalog } from "@/server/billing/plan-catalog";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { serializeSubscription } from "@/server/mobile/subscription";
import {
  resolveMembershipAccess,
  serializeMembershipAccess,
} from "@/server/team/membership-lifecycle";

export async function GET(request: Request) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    const [subscription, entitlements, plans, access] = await Promise.all([
      subscriptionAccess.getCurrent(company.id),
      subscriptionAccess.getSummary(company.id, { userId: user.id, role: membership.role }),
      getNormalizedPlanCatalog(),
      resolveMembershipAccess(company.id, user.id),
    ]);
    return mobileSuccess({
      subscription: serializeSubscription(subscription?.subscription ?? null),
      entitlements: { ...entitlements, emailVerificationRequired: !user.emailVerifiedAt },
      plans,
      membershipAccess: serializeMembershipAccess(access),
    });
  } catch (error) {
    return mobileSafeError(error);
  }
}
