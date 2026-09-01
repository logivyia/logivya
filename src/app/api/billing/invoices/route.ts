import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function GET() {
  try {
    const { company, membership } = await requireApiSession();
    if (membership.role !== "OWNER") {
      return NextResponse.json({ invoices: [] });
    }
    const invoices = await prisma.invoice.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ invoices });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
