import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "archive_accounts");
    const { id } = await params;
    const account = await prisma.whatsAppAccount.findFirst({ where: { id, companyId: company.id }, include: { _count: { select: { recipients: true } } } });
    if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (account._count.recipients) await prisma.whatsAppAccount.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date(), qrCode: null, qrExpiresAt: null } });
    else await prisma.whatsAppAccount.delete({ where: { id } });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "whatsapp.connection.canceled", entityType: "WhatsAppAccount", entityId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 403 });
  }
}
