import { z } from "zod";

import {
  appleSubscriptionErrorStatus,
  verifyAndActivateApplePurchase,
} from "@/server/billing/apple-subscriptions";
import { requireMobileAuth } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { requestCorrelationId } from "@/server/observability/request-id";

export const runtime = "nodejs";

const schema = z.object({ signedTransactionInfo: z.string().min(100).max(50_000) });

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  try {
    const { company, user } = await requireMobileAuth(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    return mobileSuccess(await verifyAndActivateApplePurchase({
      signedTransactionInfo: parsed.data.signedTransactionInfo,
      companyId: company.id,
      userId: user.id,
      correlationId,
    }));
  } catch (error) {
    const status = appleSubscriptionErrorStatus(error);
    if (status < 500) {
      return mobileError(
        error instanceof Error ? error.message : "APPLE_PURCHASE_REJECTED",
        "Apple satın alma işlemi doğrulanamadı.",
        { status },
      );
    }
    return mobileSafeError(error, "Apple satın alma işlemi doğrulanamadı.");
  }
}
