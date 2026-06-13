import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ACTIVATE"), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("SUSPEND"), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("CANCEL"), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("EXTEND"), endsAt: z.coerce.date(), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("CHANGE_PLAN"), planSlug: z.enum(["starter", "professional", "enterprise"]), reason: z.string().trim().min(5).max(500) }),
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
    let update: Parameters<typeof prisma.subscription.update>[0]["data"] = {};
    if (data.action === "ACTIVATE") update = { status: "ACTIVE", expiredAt: null, cancelledAt: null, pastDueAt: null };
    if (data.action === "SUSPEND") update = { status: "SUSPENDED" };
    if (data.action === "CANCEL") update = { status: "CANCELED", cancelledAt: new Date(), cancelAtPeriodEnd: false };
    if (data.action === "EXTEND") update = { status: "ACTIVE", endsAt: data.endsAt, currentPeriodEndsAt: data.endsAt, expiredAt: null };
    if (data.action === "CHANGE_PLAN") {
      const plan = await prisma.plan.findUnique({ where: { slug: data.planSlug } });
      if (!plan) return NextResponse.json({ error: "NOT_FOUND", requestId: id }, { status: 404 });
      update = { planId: plan.id, status: "ACTIVE", expiredAt: null };
    }
    const subscription = await prisma.subscription.update({ where: { id: subscriptionId }, data: update });
    await writeAuditLog(request, { companyId: before.companyId, userId: user.id, action: `admin.subscription.${data.action.toLowerCase()}`, entityType: "Subscription", entityId: subscriptionId, before: { status: before.status, plan: before.plan.slug, endsAt: before.endsAt }, after: { ...data, status: subscription.status } });
    return NextResponse.json({ ok: true, subscription, requestId: id });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
