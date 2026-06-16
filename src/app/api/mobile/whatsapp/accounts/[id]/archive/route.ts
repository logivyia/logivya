import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { createNotification, NOTIFICATION_TYPES } from "@/server/notifications/service";
import { writeAuditLog } from "@/server/security/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "archive_accounts");
    const { id } = await params;
    const account = await prisma.whatsAppAccount.updateMany({
      where: { id, companyId: company.id },
      data: { archivedAt: new Date(), status: "ARCHIVED" },
    });
    if (!account.count) return mobileError("NOT_FOUND", "WhatsApp hesabı bulunamadı.", { status: 404 });
    await createNotification({
      companyId: company.id,
      userId: user.id,
      type: NOTIFICATION_TYPES.WHATSAPP_ACCOUNT_ARCHIVED,
      title: "WhatsApp hesabı arşivlendi",
      message: "WhatsApp hesabı arşivlendi ve gönderim listesinden kaldırıldı.",
      payload: { accountId: id }
    });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "mobile.whatsapp.account.archived", entityType: "WhatsAppAccount", entityId: id });
    return mobileSuccess({ accountId: id, status: "ARCHIVED" });
  } catch (error) {
    return mobileSafeError(error, "Hesap arşivlenemedi.");
  }
}
