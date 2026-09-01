import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import {
  manualSubscriptionRequestErrorBody,
  manualSubscriptionRequestStatus,
  transitionManualSubscriptionRequest,
} from "@/server/billing/manual-subscription-requests";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({
  action: z.enum([
    "UNDER_REVIEW",
    "CLARIFICATION_REQUIRED",
    "REJECTED",
    "CANCELLED",
  ]),
  customerNote: z.string().trim().max(500).optional(),
  internalNote: z.string().trim().max(1000).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const correlationId = requestId(request);
  try {
    const { user } = await requirePlatformAdmin("admin.subscriptions.approve", request);
    const { id } = await context.params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", requestId: correlationId },
        { status: 400 },
      );
    }
    const changed = await transitionManualSubscriptionRequest({
      requestId: id,
      adminUserId: user.id,
      correlationId,
      ...parsed.data,
    });
    await writeAuditLog(request, {
      companyId: changed.companyId,
      userId: user.id,
      actorType: "PLATFORM_ADMIN",
      action: `subscription.request_${parsed.data.action.toLowerCase()}`,
      reason: parsed.data.internalNote || parsed.data.customerNote,
      entityType: "SubscriptionRequest",
      entityId: changed.id,
      correlationId,
      after: { status: changed.status },
    });
    return NextResponse.json({ ok: true, status: changed.status, requestId: correlationId });
  } catch (error) {
    const domainStatus = manualSubscriptionRequestStatus(error);
    if (domainStatus !== 500) {
      return NextResponse.json(
        { ...manualSubscriptionRequestErrorBody(error), requestId: correlationId },
        { status: domainStatus },
      );
    }
    const safe = safeAdminError(error, correlationId);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
