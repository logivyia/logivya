import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/server/auth/session";
import {
  cancelManualSubscriptionRequest,
  manualSubscriptionRequestErrorBody,
  manualSubscriptionRequestStatus,
} from "@/server/billing/manual-subscription-requests";
import { assertSubscriptionRequestCsrf } from "@/server/billing/subscription-request-security";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({ reason: z.string().trim().max(500).optional() });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSubscriptionRequestCsrf(request);
    const { id } = await context.params;
    const { company, user } = await requireApiSession();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }
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
      action: "subscription.request_cancelled",
      entityType: "SubscriptionRequest",
      entityId: id,
      after: { status: "CANCELLED" },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      manualSubscriptionRequestErrorBody(error),
      { status: manualSubscriptionRequestStatus(error) },
    );
  }
}
