import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import {
  AdminSubscriptionActionError,
  performAdminSubscriptionAction,
} from "@/server/billing/admin-subscription-actions";
import { SubscriptionActivationError } from "@/server/billing/subscription-activation";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";

const schema = z.object({ reason: z.string().trim().min(5).max(500) });

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
    const current = await prisma.subscription.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!current) {
      return NextResponse.json(
        { error: "NOT_FOUND", requestId: correlationId },
        { status: 404 },
      );
    }
    if (["ACTIVE", "TRIALING"].includes(current.status)) {
      return NextResponse.json({
        ok: true,
        idempotent: true,
        requestId: correlationId,
      });
    }
    const result = await performAdminSubscriptionAction({
      subscriptionId: id,
      actorUserId: user.id,
      correlationId,
      data: { action: "ACTIVATE", reason: parsed.data.reason },
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
    if (error instanceof SubscriptionActivationError) {
      return NextResponse.json(
        {
          error: error.message,
          details: error.details,
          requestId: correlationId,
        },
        {
          status:
            error.message === "DOWNGRADE_SEAT_RECONCILIATION_REQUIRED"
              ? 409
              : 400,
        },
      );
    }
    const safe = safeAdminError(error, correlationId);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
