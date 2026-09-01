import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/server/auth/session";
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
import { assertSubscriptionRequestCsrf } from "@/server/billing/subscription-request-security";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { requestId } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";
import { resolveMembershipAccess } from "@/server/team/membership-lifecycle";

export const dynamic = "force-dynamic";

const draftSchema = z.object({
  planSlug: z.enum(PURCHASABLE_PLAN_CODES),
  billingPeriod: z.enum(["MONTHLY", "YEARLY"]),
});

export async function GET() {
  try {
    const { company, membership, user } = await requireApiSession();
    const [requests, checkout] = await Promise.all([
      membership.role === "OWNER"
        ? listManualSubscriptionRequestsForCompany(company.id)
        : listManualSubscriptionRequestsForUser(user.id),
      getBillingCheckoutConfiguration(),
    ]);
    return NextResponse.json(
      { requests, checkout },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      manualSubscriptionRequestErrorBody(error),
      { status: manualSubscriptionRequestStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  const correlationId = requestId(request);
  try {
    assertSubscriptionRequestCsrf(request);
    const { company, user } = await requireApiSession();
    const parsed = draftSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }
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
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
    }
    const draft = await createManualSubscriptionDraft({
      ...parsed.data,
      idempotencyKey,
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
      },
    });
    return NextResponse.json(
      { draft, correlationId },
      {
        status: draft.duplicate ? 200 : 201,
        headers: { "X-Correlation-Id": correlationId },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { ...manualSubscriptionRequestErrorBody(error), correlationId },
      {
        status: manualSubscriptionRequestStatus(error),
        headers: { "X-Correlation-Id": correlationId },
      },
    );
  }
}
