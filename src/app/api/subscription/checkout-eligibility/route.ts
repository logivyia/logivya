import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { getSubscriptionCheckoutEligibility } from "@/server/billing/checkout-eligibility";
import {
  manualSubscriptionRequestErrorBody,
  manualSubscriptionRequestStatus,
} from "@/server/billing/manual-subscription-requests";
import { requestId } from "@/server/security/admin-request";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const correlationId = requestId(request);
  try {
    const { company, user } = await requireApiSession();
    const eligibility = await getSubscriptionCheckoutEligibility({
      companyId: company.id,
      userId: user.id,
      correlationId,
    });
    return NextResponse.json(
      { ...eligibility, correlationId },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Correlation-Id": correlationId,
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ...manualSubscriptionRequestErrorBody(error),
        correlationId,
      },
      {
        status: manualSubscriptionRequestStatus(error),
        headers: {
          "Cache-Control": "private, no-store",
          "X-Correlation-Id": correlationId,
        },
      },
    );
  }
}
