import { z } from "zod";

import {
  cancelManualSubscriptionRequest,
  manualSubscriptionRequestErrorBody,
  manualSubscriptionRequestStatus,
} from "@/server/billing/manual-subscription-requests";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({ reason: z.string().trim().max(500).optional() });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const { id } = await context.params;
    const { company, user } = await requireMobileAuth(request);
    await enforceOperationRateLimit({
      scope: "subscription-request-cancel",
      subject: `${company.id}:${user.id}`,
      maxAttempts: 8,
      windowMs: 60 * 60_000,
      request,
    });
    await cancelManualSubscriptionRequest({
      requestId: id,
      companyId: company.id,
      userId: user.id,
      reason: parsed.data.reason,
    });
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "mobile.subscription.request_cancelled",
      entityType: "SubscriptionRequest",
      entityId: id,
      after: { status: "CANCELLED" },
    });
    return mobileSuccess({ ok: true });
  } catch (error) {
    const body = manualSubscriptionRequestErrorBody(error);
    return mobileError(body.error, body.error, {
      status: manualSubscriptionRequestStatus(error),
      details: body.details,
    });
  }
}
