import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
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
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "mobile.whatsapp.account.archived", entityType: "WhatsAppAccount", entityId: id });
    return mobileSuccess({ accountId: id, status: "ARCHIVED" });
  } catch (error) {
    return mobileSafeError(error, "Hesap arşivlenemedi.");
  }
}
