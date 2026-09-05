import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import {
  AdminSubscriptionActionError,
  performAdminSubscriptionAction,
} from "@/server/billing/admin-subscription-actions";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({
  endsAt: z.coerce.date(),
  reason: z.string().trim().min(5).max(500),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = requestId(request);
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", requestId: correlationId },
        { status: 400 },
      );
    }
    const { user } = await requireCriticalAdminAction(
      request,
      "admin.subscriptions.approve",
      parsed.data.reason,
    );
    const { id } = await params;
    const result = await performAdminSubscriptionAction({
      subscriptionId: id,
      actorUserId: user.id,
      correlationId,
      data: {
        action: "EXTEND",
        endsAt: parsed.data.endsAt,
        reason: parsed.data.reason,
      },
    });
    await writeAuditLog(request, {
      companyId: result.before.companyId,
      userId: user.id,
      actorType: "PLATFORM_ADMIN",
      action: "admin.subscription.extend",
      reason: parsed.data.reason,
      entityType: "Subscription",
      entityId: id,
      correlationId,
      before: { status: result.before.status, endsAt: result.before.endsAt },
      after: {
        status: result.subscription.status,
        endsAt: result.subscription.endsAt,
      },
    });
    return NextResponse.json({
      ok: true,
      subscription: result.subscription,
      requestId: correlationId,
    });
  } catch (error) {
    if (error instanceof AdminSubscriptionActionError) {
      return NextResponse.json(
        { error: error.code, requestId: correlationId },
        {
          status:
            error.code === "NOT_FOUND"
              ? 404
              : error.code === "STATE_CHANGED"
                ? 409
                : 400,
        },
      );
    }
    const safe = safeAdminError(error, correlationId);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
