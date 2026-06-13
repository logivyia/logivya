import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { activateSubscriptionManually } from "@/server/billing/manual-activation";
import { requestId, safeAdminError } from "@/server/security/admin-request";

const schema = z.object({
  companyId: z.string().cuid(),
  planSlug: z.enum(["starter", "professional", "enterprise"]),
  billingPeriod: z.enum(["MONTHLY", "YEARLY"]),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  currency: z.literal("TRY").default("TRY"),
  paymentMethod: z.enum(["MANUAL_BANK_TRANSFER", "MANUAL", "FREE_PROMO", "OTHER"]),
  note: z.string().trim().max(500).optional(),
  customAmount: z.coerce.number().min(0).optional(),
}).refine((value) => value.planSlug === "enterprise" || value.customAmount === undefined, {
  message: "Custom amount is only available for Enterprise.",
  path: ["customAmount"],
});

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const { user } = await requirePlatformAdmin("admin.subscriptions.approve", request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", requestId: id }, { status: 400 });
    if (parsed.data.endsAt <= parsed.data.startsAt) {
      return NextResponse.json({ error: "VALIDATION_ERROR", requestId: id }, { status: 400 });
    }
    const idempotencyKey = request.headers.get("idempotency-key")
      || `${parsed.data.companyId}:${parsed.data.planSlug}:${parsed.data.startsAt.toISOString()}:${parsed.data.endsAt.toISOString()}`;
    const result = await activateSubscriptionManually({ ...parsed.data, adminUserId: user.id, idempotencyKey });
    return NextResponse.json({ ...result, requestId: id }, { status: 201 });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
