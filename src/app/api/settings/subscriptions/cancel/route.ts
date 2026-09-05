import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import {
  assertTenantCapability,
  resolveMembershipAccess,
} from "@/server/team/membership-lifecycle";

export async function POST(request: Request) {
  try {
    const { company, user } = await requireApiSession();
    const access = await resolveMembershipAccess(company.id, user.id);
    assertTenantCapability(
      access,
      "tenant.subscription.manage",
      "SHARED_SUBSCRIPTION_READ_ONLY",
    );
    const subscription = await prisma.subscription.findFirst({ where: { companyId: company.id }, orderBy: { createdAt: "desc" } });
    if (!subscription) return NextResponse.json({ error: "subscription.inactive" }, { status: 404 });
    await prisma.subscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: true, cancelledAt: new Date() } });
    await prisma.subscriptionEvent.create({data:{companyId:company.id,subscriptionId:subscription.id,actorUserId:user.id,type:"SUBSCRIPTION_CANCELED",message:"Abonelik dönem sonunda iptal edilmek üzere işaretlendi."}});
    await prisma.notification.create({data:{companyId:company.id,userId:user.id,type:"SUBSCRIPTION_CANCELED",title:"Abonelik iptal talebi",message:"Aboneliğiniz dönem sonunda sona erecek."}});
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "subscription.cancel_requested", entityType: "Subscription", entityId: subscription.id });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 403 }); }
}
