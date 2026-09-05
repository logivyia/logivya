import { z } from "zod";

import {
  createManualSubscriptionDraft,
  getBillingCheckoutConfiguration,
  listManualSubscriptionRequestsForCompany,
  listManualSubscriptionRequestsForUser,
  manualSubscriptionRequestErrorBody,
  manualSubscriptionRequestStatus,
  ManualSubscriptionRequestError,
} from "@/server/billing/manual-subscription-requests";
import { PURCHASABLE_PLAN_CODES } from "@/server/billing/plan-matrix";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { writeAuditLog } from "@/server/security/audit";
import { requestId } from "@/server/security/admin-request";
import { resolveMembershipAccess } from "@/server/team/membership-lifecycle";

export const dynamic = "force-dynamic";

const draftSchema = z.object({
  planSlug: z.enum(PURCHASABLE_PLAN_CODES),
  billingPeriod: z.enum(["MONTHLY", "YEARLY"]),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export async function GET(request: Request) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    const [requests, checkout] = await Promise.all([
      membership.role === "OWNER"
        ? listManualSubscriptionRequestsForCompany(company.id)
        : listManualSubscriptionRequestsForUser(user.id),
      getBillingCheckoutConfiguration(),
    ]);
    return mobileSuccess({ requests, checkout });
  } catch (error) {
    const body = manualSubscriptionRequestErrorBody(error);
    return mobileError(body.error, body.error, {
      status: manualSubscriptionRequestStatus(error),
      details: body.details,
    });
  }
}

export async function POST(request: Request) {
  const correlationId = requestId(request);
  try {
    const parsed = draftSchema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const { company, user } = await requireMobileAuth(request);
    const access = await resolveMembershipAccess(company.id, user.id);
    if (access.sharedAccess) {
      throw new ManualSubscriptionRequestError("ACTIVE_SHARED_MEMBERSHIP_EXISTS", 409);
    }
    if (
      !access.capabilities["tenant.subscription.manage"]
      && !access.capabilities["personal.subscription.request"]
    ) throw new ManualSubscriptionRequestError("INDEPENDENT_CONVERSION_NOT_ALLOWED", 403);
    await enforceOperationRateLimit({
      scope: "subscription-request-draft",
      subject: `${company.id}:${user.id}`,
      maxAttempts: 12,
      windowMs: 60 * 60_000,
      request,
    });
    const draft = await createManualSubscriptionDraft({
      planSlug: parsed.data.planSlug,
      billingPeriod: parsed.data.billingPeriod,
      idempotencyKey: parsed.data.idempotencyKey,
      correlationId,
      context: { company, user },
    });
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: draft.duplicate
        ? "SUBSCRIPTION_REQUEST_DUPLICATE_BLOCKED"
        : "SUBSCRIPTION_PLAN_SELECTED",
      entityType: "SubscriptionRequest",
      entityId: draft.id,
      after: {
        publicId: draft.publicId,
        planCode: draft.planCode,
        billingPeriod: draft.billingPeriod,
        status: draft.status,
        duplicate: draft.duplicate,
        client: "mobile",
      },
    });
    return mobileSuccess(
      { draft, correlationId },
      { status: draft.duplicate ? 200 : 201 },
    );
  } catch (error) {
    const body = manualSubscriptionRequestErrorBody(error);
    return mobileError(body.error, body.error, {
      status: manualSubscriptionRequestStatus(error),
      details: { ...body.details, correlationId },
    });
  }
}
