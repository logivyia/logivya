import { AccountStatus } from "@prisma/client";
import { requirePermission } from "@/server/auth/permissions";
import { resetAccountForConnection } from "@/lib/whatsapp/account-status-machine";
import { hasRestorableWhatsAppCredentials } from "@/lib/whatsapp/session-manager";
import { prisma } from "@/server/db";
import { enqueueWhatsAppJob } from "@/server/queues/producer";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { serializeMobileAccount } from "@/server/mobile/whatsapp";
import { writeAuditLog } from "@/server/security/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "connect_accounts");
    const { id } = await params;
    const account = await prisma.whatsAppAccount.findFirst({ where: { id, companyId: company.id, userId: user.id } });
    if (!account) return mobileError("NOT_FOUND", "WhatsApp hesabı bulunamadı.", { status: 404 });
    if (await hasRestorableWhatsAppCredentials(account.id)) {
      await prisma.whatsAppAccount.update({
        where: { id: account.id },
        data: { status: AccountStatus.CONNECTING, qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null },
      });
    } else {
      await resetAccountForConnection(account.id, AccountStatus.PENDING_QR);
    }
    await enqueueWhatsAppJob("reconnect", { action: "reconnect", accountId: account.id }, { jobId: `mobile-reconnect-${account.id}-${Date.now()}` });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "mobile.whatsapp.reconnect.requested", entityType: "WhatsAppAccount", entityId: account.id });
    const refreshed = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: account.id }, include: { _count: { select: { groups: true, contacts: true } } } });
    return mobileSuccess({ account: serializeMobileAccount(refreshed) });
  } catch (error) {
    return mobileSafeError(error, "Yeniden bağlantı başlatılamadı.");
  }
}
