import { AccountStatus } from "@prisma/client";
import { requirePermission } from "@/server/auth/permissions";
import { resetAccountForConnection } from "@/lib/whatsapp/account-status-machine";
import { prisma } from "@/server/db";
import { whatsappQueue } from "@/server/queues/client";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "connect_accounts");
    const { id } = await params;
    const account = await prisma.whatsAppAccount.findFirst({ where: { id, companyId: company.id } });
    if (!account) return mobileError("NOT_FOUND", "WhatsApp hesabı bulunamadı.", { status: 404 });
    await resetAccountForConnection(account.id, AccountStatus.PENDING_QR);
    await whatsappQueue().add("reconnect", { action: "reconnect", accountId: account.id }, { jobId: `mobile-reconnect-${account.id}-${Date.now()}` });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "mobile.whatsapp.reconnect.requested", entityType: "WhatsAppAccount", entityId: account.id });
    return mobileSuccess({ accountId: account.id, status: "PENDING_QR" });
  } catch (error) {
    return mobileSafeError(error, "Yeniden bağlantı başlatılamadı.");
  }
}
