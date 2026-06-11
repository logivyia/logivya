import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

export async function POST(request: Request) {
  try {
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "manage_billing");
    const subscription = await prisma.subscription.findFirst({ where: { companyId: company.id }, orderBy: { createdAt: "desc" } });
    if (!subscription) return NextResponse.json({ error: "subscription.inactive" }, { status: 404 });
    await prisma.subscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: false, cancelledAt:null,status: subscription.status === "CANCELED" ? "ACTIVE" : subscription.status } });
    await prisma.subscriptionEvent.create({data:{companyId:company.id,subscriptionId:subscription.id,actorUserId:user.id,type:"SUBSCRIPTION_REACTIVATED",message:"Abonelik yeniden etkinleştirildi."}});
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "subscription.reactivated", entityType: "Subscription", entityId: subscription.id });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 403 }); }
}
