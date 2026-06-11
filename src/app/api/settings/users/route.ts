import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function GET() {
  try {
    const { company, membership } = await requireApiSession();
    if (!["OWNER", "ADMIN"].includes(membership.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const users = await prisma.companyUser.findMany({
      where: { companyId: company.id },
      include: { user: { select: { id: true, name: true, email: true, status: true, sessions: { select: { lastActiveAt: true }, orderBy: { lastActiveAt: "desc" }, take: 1 } } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return NextResponse.json({ users });
  } catch { return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }); }
}
