import { AccountStatus } from "@prisma/client";
import { requirePermission } from "@/server/auth/permissions";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { resetAccountForConnection } from "@/lib/whatsapp/account-status-machine";
import { prisma } from "@/server/db";
import { enqueueWhatsAppJob } from "@/server/queues/producer";
import { requireMobileAuth } from "@/server/mobile/auth";
import { enforceMobileRateLimit } from "@/server/mobile/rate-limit";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { serializeMobileAccount } from "@/server/mobile/whatsapp";
import { writeAuditLog } from "@/server/security/audit";
import { cleanupStuckWhatsAppAccounts } from "@/server/whatsapp/cleanup";
import { findReusableWhatsAppAccount, findSingleSlotWhatsAppAccount } from "@/server/whatsapp/reusable-account";
import { assertWhatsAppWorkerReachable, isWhatsAppWaitTimeout, waitForAccountQr } from "@/server/whatsapp/worker-health";

export async function POST(request: Request) {
  let accountId: string | undefined;
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "connect_accounts");
    enforceMobileRateLimit(`mobile-wa-qr:${company.id}`, 12, 60 * 60_000);
    await cleanupStuckWhatsAppAccounts(company.id);
    await assertWhatsAppWorkerReachable();
    let account = await findReusableWhatsAppAccount(company.id);
    if (!account) {
      const access = await subscriptionAccess.canConnectWhatsAppAccount(company.id);
      if (!access.allowed) account = await findSingleSlotWhatsAppAccount(company.id, access.limit);
      if (!account && !access.allowed) return mobileError("SUBSCRIPTION_LOCKED", "WhatsApp hesap limitinize ulaştınız.", { status: 403, details: { reason: access.reason, limit: access.limit } });
    }
    account = account
      ? await resetAccountForConnection(account.id, AccountStatus.PENDING_QR)
      : await prisma.whatsAppAccount.create({ data: { companyId: company.id, provider: process.env.WHATSAPP_PROVIDER || "baileys", status: AccountStatus.PENDING_QR } });
    accountId = account.id;
    await enqueueWhatsAppJob("connect", { action: "connect", accountId }, { jobId: `mobile-qr-${accountId}-${Date.now()}` });
    const ready = await waitForAccountQr(accountId);
    const refreshed = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId }, include: { _count: { select: { groups: true, contacts: true } } } });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "mobile.whatsapp.qr.requested", entityType: "WhatsAppAccount", entityId: accountId });
    return mobileSuccess({ account: serializeMobileAccount({ ...refreshed, qrCode: ready.qrCode, qrExpiresAt: ready.qrExpiresAt }) }, { status: 201 });
  } catch (error) {
    if (accountId && isWhatsAppWaitTimeout(error)) {
      const pending = await prisma.whatsAppAccount.findUniqueOrThrow({
        where: { id: accountId },
        include: { _count: { select: { groups: true, contacts: true } } },
      });
      return mobileSuccess({ account: serializeMobileAccount(pending) }, { status: 202 });
    }
    if (accountId) await prisma.whatsAppAccount.updateMany({ where: { id: accountId, status: { in: ["PENDING_QR", "QR_READY", "CONNECTING"] } }, data: { lastError: "MOBILE_QR_FAILED" } });
    return mobileSafeError(error, "QR kod oluşturulamadı.");
  }
}
