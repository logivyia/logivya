import { getSubscriptionCheckoutEligibility } from "@/server/billing/checkout-eligibility";
import {
  manualSubscriptionRequestErrorBody,
  manualSubscriptionRequestStatus,
} from "@/server/billing/manual-subscription-requests";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSuccess } from "@/server/mobile/response";
import { requestId } from "@/server/security/admin-request";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const correlationId = requestId(request);
  try {
    const { company, user } = await requireMobileAuth(request);
    const eligibility = await getSubscriptionCheckoutEligibility({
      companyId: company.id,
      userId: user.id,
      correlationId,
    });
    return mobileSuccess({ ...eligibility, correlationId });
  } catch (error) {
    const body = manualSubscriptionRequestErrorBody(error);
    return mobileError(body.error, body.error, {
      status: manualSubscriptionRequestStatus(error),
      details: { ...body.details, correlationId },
    });
  }
}
