import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { getNormalizedPlanCatalog } from "@/server/billing/plan-catalog";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { serializeSubscription } from "@/server/billing/subscription-state";
import { prisma } from "@/server/db";
import {
  resolveMembershipAccess,
  serializeMembershipAccess,
} from "@/server/team/membership-lifecycle";

export async function GET() {
  try {
    const { company, membership, user } = await requireApiSession();
    const [subscription, plans, access] = await Promise.all([
      subscriptionAccess.getCurrent(company.id),
      getNormalizedPlanCatalog(),
      resolveMembershipAccess(company.id, user.id),
    ]);
    const invoices = membership.role === "OWNER"
      ? await prisma.invoice.findMany({
          where: { companyId: company.id },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [];
    const currentSubscription = subscription?.subscription;
    return NextResponse.json({
      subscription: currentSubscription ? { ...currentSubscription, ...serializeSubscription(currentSubscription) } : null,
      plans,
      invoices,
      membershipAccess: serializeMembershipAccess(access),
    });
  } catch { return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }); }
}
