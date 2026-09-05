import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
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
    const [current, entitlements, access, occupiedAccounts] = await Promise.all([
      subscriptionAccess.getCurrent(company.id),
      subscriptionAccess.getSummary(company.id, { userId: user.id, role: membership.role }),
      resolveMembershipAccess(company.id, user.id),
      prisma.companyUser.count({
        where: { companyId: company.id, status: { in: ["ACTIVE", "SUSPENDED", "INVITED"] } },
      }),
    ]);
    const subscription = current?.subscription
      ? await prisma.subscription.findUnique({
          where: { id: current.subscription.id },
          include: { plan: true, events: { orderBy: { createdAt: "desc" }, take: 50 } },
        })
      : null;
    return NextResponse.json({
      subscription: subscription ? { ...subscription, ...serializeSubscription(subscription) } : null,
      entitlements: { ...entitlements, emailVerificationRequired: !user.emailVerifiedAt },
      membershipAccess: serializeMembershipAccess(access),
      seatUsage: {
        used: occupiedAccounts,
        limit: access.plan?.accountLimit ?? 0,
      },
    });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
