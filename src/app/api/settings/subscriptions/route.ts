import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function GET() {
  try {
    const { company } = await requireApiSession();
    const [subscription, plans, invoices] = await Promise.all([
      prisma.subscription.findFirst({ where: { companyId: company.id }, include: { plan: true }, orderBy: { createdAt: "desc" } }),
      prisma.plan.findMany({ where: { isActive: true }, orderBy: { monthlyPrice: "asc" } }),
      prisma.invoice.findMany({ where: { companyId: company.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    return NextResponse.json({ subscription, plans, invoices });
  } catch { return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }); }
}
