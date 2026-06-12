import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "manage_categories");
    const { id } = await params;
    const result = await prisma.category.updateMany({ where: { id, companyId: company.id }, data: { archivedAt: new Date() } });
    if (!result.count) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "category.archived", entityType: "Category", entityId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 403 });
  }
}
