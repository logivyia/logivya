import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { serializeSubscription } from "@/server/billing/subscription-state";
import { prisma } from "@/server/db";

export async function GET() {
  try {
    const { company } = await requireApiSession();
    const current = await subscriptionAccess.getCurrent(company.id);
    const subscription = current?.subscription
      ? await prisma.subscription.findUnique({
          where: { id: current.subscription.id },
          include: { plan: true, events: { orderBy: { createdAt: "desc" }, take: 50 } },
        })
      : null;
    return NextResponse.json({
      subscription: subscription ? { ...subscription, ...serializeSubscription(subscription) } : null,
    });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
