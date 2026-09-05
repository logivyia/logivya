import { z } from "zod";

import {
  googlePlaySubscriptionErrorStatus,
  verifyAndActivateGooglePlayPurchase,
} from "@/server/billing/google-play-subscriptions";
import { requireMobileAuth } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import {
  mobileError,
  mobileSafeError,
  mobileSuccess,
  mobileValidationError,
} from "@/server/mobile/response";
import { requestCorrelationId } from "@/server/observability/request-id";

export const runtime = "nodejs";

const schema = z.object({
  purchaseToken: z.string().min(10).max(10_000),
  productId: z.string().min(3).max(200),
  basePlanId: z.string().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  try {
    const { company, user } = await requireMobileAuth(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);

    return mobileSuccess(
      await verifyAndActivateGooglePlayPurchase({
        ...parsed.data,
        companyId: company.id,
        userId: user.id,
        correlationId,
      }),
    );
  } catch (error) {
    const status = googlePlaySubscriptionErrorStatus(error);
    if (status < 500) {
      return mobileError(
        error instanceof Error
          ? error.message
          : "GOOGLE_PLAY_PURCHASE_REJECTED",
        "Google Play purchase could not be verified.",
        { status },
      );
    }
    return mobileSafeError(
      error,
      "Google Play purchase could not be verified.",
    );
  }
}
