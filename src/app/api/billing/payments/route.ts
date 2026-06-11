import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function GET() {
  try {
    const { company } = await requireApiSession();
    const payments = await prisma.payment.findMany({
      where: { companyId: company.id },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ payments });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
