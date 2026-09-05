import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { PURCHASABLE_PLAN_CODES } from "@/server/billing/plan-matrix";
import { activateSubscriptionManually } from "@/server/billing/manual-activation";
import {
  activateCompanySubscription,
  SubscriptionActivationError,
} from "@/server/billing/subscription-activation";
import { requestId, safeAdminError } from "@/server/security/admin-request";

const absoluteDateTime = z.iso.datetime({ offset: true }).transform(
  (value) => new Date(value),
);

const schema = z.object({
  companyId: z.string().cuid(),
  planSlug: z.enum(PURCHASABLE_PLAN_CODES),
  billingPeriod: z.enum(["MONTHLY", "YEARLY"]),
  startsAt: absoluteDateTime,
  endsAt: absoluteDateTime,
  currency: z.literal("TRY").default("TRY"),
  paymentMethod: z
    .enum(["MANUAL_BANK_TRANSFER", "MANUAL", "FREE_PROMO", "OTHER"])
    .default("MANUAL"),
  note: z.string().trim().min(5).max(500),
  createPayment: z.boolean().default(true),
});

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "VALIDATION_ERROR", requestId: id },
        { status: 400 },
      );
    const { user } = await requireCriticalAdminAction(
      request,
      "admin.subscriptions.approve",
      parsed.data.note,
    );
    if (parsed.data.endsAt <= parsed.data.startsAt) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", requestId: id },
        { status: 400 },
      );
    }
    const idempotencyKey =
      request.headers.get("idempotency-key") ||
      `${parsed.data.companyId}:${parsed.data.planSlug}:${parsed.data.startsAt.toISOString()}:${parsed.data.endsAt.toISOString()}`;
    const createPayment =
      parsed.data.paymentMethod === "FREE_PROMO" || parsed.data.createPayment;
    const result = createPayment
      ? await activateSubscriptionManually({
          ...parsed.data,
          adminUserId: user.id,
          idempotencyKey,
        })
      : await activateCompanySubscription({
          companyId: parsed.data.companyId,
          planSlug: parsed.data.planSlug,
          billingPeriod: parsed.data.billingPeriod,
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
          source: "MANUAL_ADMIN",
          actorUserId: user.id,
          reason: parsed.data.note,
          correlationId: idempotencyKey,
        });
    return NextResponse.json({ ...result, requestId: id }, { status: 201 });
  } catch (error) {
    if (error instanceof SubscriptionActivationError) {
      const status =
        error.message === "DOWNGRADE_SEAT_RECONCILIATION_REQUIRED" ? 409 : 400;
      return NextResponse.json(
        { error: error.message, details: error.details, requestId: id },
        { status },
      );
    }
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
