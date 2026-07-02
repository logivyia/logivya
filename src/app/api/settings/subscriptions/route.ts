import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { prisma } from "@/server/db";

export async function GET() {
  try {
    const { company } = await requireApiSession();
    const [subscription, plans, invoices] = await Promise.all([
      subscriptionAccess.getCurrent(company.id),
      prisma.plan.findMany({ where: { isActive: true }, orderBy: { monthlyPrice: "asc" } }),
      prisma.invoice.findMany({ where: { companyId: company.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    return NextResponse.json({ subscription: subscription?.subscription ?? null, plans, invoices });
  } catch { return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }); }
}
