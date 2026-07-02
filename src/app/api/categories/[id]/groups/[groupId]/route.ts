import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import { resolveCurrentWhatsAppAccount } from "@/server/whatsapp/account-scope";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; groupId: string }> }) {
  try {
    const { id, groupId } = await params;
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "manage_categories");
    const category = await prisma.category.findFirst({ where: { id, companyId: company.id } });
    if (!category) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const account = await resolveCurrentWhatsAppAccount({ companyId: company.id, userId: user.id });
    if (!account) return NextResponse.json({ error: "WhatsApp hesabınızı bağlayın" }, { status: 409 });
    await prisma.categoryGroup.deleteMany({
      where: {
        categoryId: id,
        groupId,
        group: { companyId: company.id, userId: user.id, accountId: account.id },
      },
    });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "category.group.removed", entityType: "Category", entityId: id, after: { groupId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 403 });
  }
}
