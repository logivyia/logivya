import { z } from "zod";

import {
  manualSubscriptionRequestErrorBody,
  manualSubscriptionRequestStatus,
  submitManualSubscriptionRequest,
} from "@/server/billing/manual-subscription-requests";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { writeAuditLog } from "@/server/security/audit";
import { requestId } from "@/server/security/admin-request";

const schema = z.object({
  acceptedDocuments: z.array(z.object({
    type: z.enum([
      "PRE_INFORMATION_FORM",
      "DISTANCE_SALES_AGREEMENT",
      "REFUND_WITHDRAWAL_POLICY",
    ]),
    version: z.string().trim().min(1).max(80),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
  })).length(3),
  immediatePerformanceConsent: z.literal(true),
  customerNote: z.string().trim().max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const correlationId = requestId(request);
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const { id } = await context.params;
    const { company, user } = await requireMobileAuth(request);
    await enforceOperationRateLimit({
      scope: "subscription-request-submit",
      subject: `${company.id}:${user.id}`,
      maxAttempts: 8,
      windowMs: 60 * 60_000,
      request,
    });
    const submitted = await submitManualSubscriptionRequest({
      requestId: id,
      companyId: company.id,
      userId: user.id,
      acceptedDocuments: parsed.data.acceptedDocuments,
      immediatePerformanceConsent:
        parsed.data.immediatePerformanceConsent,
      customerNote: parsed.data.customerNote,
      correlationId,
      request,
    });
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: submitted.duplicate
        ? "SUBSCRIPTION_REQUEST_DUPLICATE_BLOCKED"
        : "SUBSCRIPTION_REQUEST_CREATED",
      entityType: "SubscriptionRequest",
      entityId: id,
      after: {
        status: submitted.status,
        publicId: submitted.publicId,
        duplicate: submitted.duplicate,
        client: "mobile",
      },
    });
    return mobileSuccess({
      request: submitted,
      duplicate: submitted.duplicate,
      correlationId,
      message: "Abonelik talebiniz oluşturuldu. Ödemeniz kontrol edildikten sonra paketiniz etkinleştirilecektir.",
    });
  } catch (error) {
    const body = manualSubscriptionRequestErrorBody(error);
    return mobileError(body.error, body.error, {
      status: manualSubscriptionRequestStatus(error),
      details: { ...body.details, correlationId },
    });
  }
}
