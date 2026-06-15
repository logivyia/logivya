import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "disconnect_accounts");
    const { id } = await params;
    const account = await prisma.whatsAppAccount.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
    if (!account) return mobileError("NOT_FOUND", "WhatsApp hesabı bulunamadı.", { status: 404 });
    await prisma.whatsAppAccount.delete({ where: { id: account.id } });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "mobile.whatsapp.account.deleted", entityType: "WhatsAppAccount", entityId: account.id });
    return mobileSuccess({ deleted: true });
  } catch (error) {
    return mobileSafeError(error, "Hesap silinemedi.");
  }
}
