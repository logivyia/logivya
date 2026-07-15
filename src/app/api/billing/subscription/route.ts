import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { serializeSubscription } from "@/server/billing/subscription-state";
import { prisma } from "@/server/db";

export async function GET() {
  try {
    const { company, membership, user } = await requireApiSession();
    const [current, entitlements] = await Promise.all([
      subscriptionAccess.getCurrent(company.id),
      subscriptionAccess.getSummary(company.id, { userId: user.id, role: membership.role }),
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
    });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
