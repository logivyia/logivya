import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { PURCHASABLE_PLAN_CODES } from "@/server/billing/plan-matrix";
import { activateCompanySubscription, SubscriptionActivationError } from "@/server/billing/subscription-activation";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ACTIVATE"), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("SUSPEND"), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("CANCEL"), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("EXTEND"), endsAt: z.coerce.date(), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("CHANGE_PLAN"), planSlug: z.enum(PURCHASABLE_PLAN_CODES), reason: z.string().trim().min(5).max(500) }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = requestId(request);
  try {
    const { user } = await requirePlatformAdmin("admin.subscriptions.approve", request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", requestId: id }, { status: 400 });
    const { id: subscriptionId } = await params;
    const before = await prisma.subscription.findUnique({ where: { id: subscriptionId }, include: { plan: true } });
    if (!before) return NextResponse.json({ error: "NOT_FOUND", requestId: id }, { status: 404 });
    const data = parsed.data;
    if (data.action === "ACTIVATE" || data.action === "CHANGE_PLAN") {
      const now = new Date();
      const currentEnd = before.currentPeriodEndsAt ?? before.endsAt ?? before.trialEndsAt;
      const endsAt = currentEnd && currentEnd > now ? currentEnd : new Date(now.getTime() + 30 * 86_400_000);
      const result = await activateCompanySubscription({
        companyId: before.companyId,
        planSlug: data.action === "CHANGE_PLAN" ? data.planSlug : before.plan.slug,
        billingPeriod: before.billingPeriod === "TRIAL" ? "MONTHLY" : before.billingPeriod,
        startsAt: now,
        endsAt,
        source: "MANUAL_ADMIN",
        actorUserId: user.id,
        reason: data.reason,
        correlationId: id,
      });
      return NextResponse.json({ ok: true, subscription: result.subscription, requestId: id });
    }
    let update: Parameters<typeof prisma.subscription.update>[0]["data"] = {};
    if (data.action === "SUSPEND") update = { status: "SUSPENDED" };
    if (data.action === "CANCEL") update = { status: "CANCELED", cancelledAt: new Date(), cancelAtPeriodEnd: false };
    if (data.action === "EXTEND") update = { status: "ACTIVE", endsAt: data.endsAt, currentPeriodEndsAt: data.endsAt, expiredAt: null };
    const subscription = await prisma.$transaction(async (tx) => {
      const changed = await tx.subscription.update({ where: { id: subscriptionId }, data: update });
      await tx.subscriptionAuditLog.create({
        data: {
          companyId: before.companyId,
          subscriptionId,
          actorUserId: user.id,
          eventType: `ADMIN_${data.action}`,
          previousState: { status: before.status, plan: before.plan.slug, endsAt: before.endsAt?.toISOString() ?? null },
          newState: { status: changed.status, endsAt: changed.endsAt?.toISOString() ?? null, reason: data.reason },
          correlationId: id,
        },
      });
      return changed;
    });
    await writeAuditLog(request, { companyId: before.companyId, userId: user.id, action: `admin.subscription.${data.action.toLowerCase()}`, entityType: "Subscription", entityId: subscriptionId, before: { status: before.status, plan: before.plan.slug, endsAt: before.endsAt }, after: { ...data, status: subscription.status } });
    return NextResponse.json({ ok: true, subscription, requestId: id });
  } catch (error) {
    if (error instanceof SubscriptionActivationError) {
      const status = error.message === "DOWNGRADE_SEAT_RECONCILIATION_REQUIRED" ? 409 : 400;
      return NextResponse.json({ error: error.message, details: error.details, requestId: id }, { status });
    }
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
