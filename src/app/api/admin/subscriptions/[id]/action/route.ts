import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { AdminSubscriptionActionError, performAdminSubscriptionAction } from "@/server/billing/admin-subscription-actions";
import { PURCHASABLE_PLAN_CODES } from "@/server/billing/plan-matrix";
import { SubscriptionActivationError } from "@/server/billing/subscription-activation";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ACTIVATE"), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("SUSPEND"), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("CANCEL"), reason: z.string().trim().min(5).max(500) }),
  z.object({
    action: z.literal("EXTEND"),
    endsAt: z.coerce.date().optional(),
    extensionDays: z.coerce.number().int().min(1).max(3650).optional(),
    reason: z.string().trim().min(5).max(500),
  }),
  z.object({ action: z.literal("CHANGE_PLAN"), planSlug: z.enum(PURCHASABLE_PLAN_CODES), reason: z.string().trim().min(5).max(500) }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = requestId(request);
  try {
    const { user } = await requirePlatformAdmin("admin.subscriptions.approve", request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", requestId: id }, { status: 400 });
    const { id: subscriptionId } = await params;
    const data = parsed.data;
    const result = await performAdminSubscriptionAction({
      subscriptionId,
      actorUserId: user.id,
      correlationId: id,
      data,
    });
    if (!result.activationManagedAudit) {
      await writeAuditLog(request, {
        companyId: result.before.companyId,
        userId: user.id,
        action: `admin.subscription.${data.action.toLowerCase()}`,
        entityType: "Subscription",
        entityId: subscriptionId,
        before: { status: result.before.status, plan: result.before.plan.slug, endsAt: result.before.endsAt },
        after: { ...data, status: result.subscription.status },
      });
    }
    return NextResponse.json({ ok: true, subscription: result.subscription, requestId: id });
  } catch (error) {
    if (error instanceof AdminSubscriptionActionError) {
      const status = error.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.code, requestId: id }, { status });
    }
    if (error instanceof SubscriptionActivationError) {
      const status = error.message === "DOWNGRADE_SEAT_RECONCILIATION_REQUIRED" ? 409 : 400;
      return NextResponse.json({ error: error.message, details: error.details, requestId: id }, { status });
    }
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
