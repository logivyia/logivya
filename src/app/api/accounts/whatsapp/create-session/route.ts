import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { prisma } from "@/server/db";
import { enqueueWhatsAppJob } from "@/server/queues/producer";
import { writeAuditLog } from "@/server/security/audit";
import { cleanupStuckWhatsAppAccounts } from "@/server/whatsapp/cleanup";
import { findReusableWhatsAppAccount, findSingleSlotWhatsAppAccount } from "@/server/whatsapp/reusable-account";
import { assertWhatsAppWorkerReachable, isWhatsAppWaitTimeout, waitForAccountQr } from "@/server/whatsapp/worker-health";
import { whatsappUserMessage } from "@/server/whatsapp/user-errors";
import { logger } from "@/server/observability/logger";
import { AccountStatus } from "@prisma/client";
import { resetAccountForConnection } from "@/lib/whatsapp/account-status-machine";
import { assertSameOrigin, enforceWhatsAppRateLimit, whatsappRequestErrorStatus } from "@/server/whatsapp/request-guards";

export async function POST(request: Request) {
  let accountId: string | undefined;
  try {
    assertSameOrigin(request);
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "connect_accounts");
    logger.info("whatsapp.connect.requested", { companyId: company.id, userId: user.id, mode: "QR" });
    await cleanupStuckWhatsAppAccounts(company.id);
    const connected = await prisma.whatsAppAccount.findFirst({ where: { companyId: company.id, archivedAt: null, status: "CONNECTED" } });
    if (connected) {
      return NextResponse.json({ ok: true, alreadyConnected: true, accountId: connected.id, status: connected.status, message: "WhatsApp hesabınız zaten bağlı." });
    }
    await assertWhatsAppWorkerReachable();

    let account = await findReusableWhatsAppAccount(company.id);
    if (!account) {
      const access = await subscriptionAccess.canConnectWhatsAppAccount(company.id);
      if (!access.allowed) account = await findSingleSlotWhatsAppAccount(company.id, access.limit);
      if (!account && !access.allowed) return NextResponse.json({ error: whatsappUserMessage(new Error(access.reason || "accounts.planLimit"), "qr"), reason: access.reason, limit: access.limit }, { status: 403 });
    }
    if (account) {
      await enforceWhatsAppRateLimit("qr-account", account.id);
      account = await resetAccountForConnection(account.id, AccountStatus.PENDING_QR);
    } else {
      account = await prisma.whatsAppAccount.create({
        data: { companyId: company.id, label: null, provider: process.env.WHATSAPP_PROVIDER || "baileys", status: AccountStatus.CREATED },
      });
      await enforceWhatsAppRateLimit("qr-account", account.id);
      account = await resetAccountForConnection(account.id, AccountStatus.PENDING_QR);
    }

    accountId = account.id;
    const job = await enqueueWhatsAppJob("reconnect", { action: "reconnect", accountId }, { jobId: `qr-${accountId}-${Date.now()}` });
    logger.info("whatsapp.connect.job.enqueued", { accountId, jobId: job.id, action: "reconnect", mode: "QR" });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "whatsapp.qr.requested", entityType: "WhatsAppAccount", entityId: accountId });
    try {
      const ready = await waitForAccountQr(accountId);
      return NextResponse.json({ ok: true, accountId, status: ready.status, qr: ready.qrCode, qrCode: ready.qrCode, expiresAt: ready.qrExpiresAt, qrExpiresAt: ready.qrExpiresAt }, { status: 201 });
    } catch (waitError) {
      if (!isWhatsAppWaitTimeout(waitError)) throw waitError;
      const pending = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
      return NextResponse.json({
        ok: true,
        pending: true,
        accountId,
        status: pending?.status || AccountStatus.PENDING_QR,
        qr: pending?.qrCode || null,
        qrCode: pending?.qrCode || null,
        expiresAt: pending?.qrExpiresAt || null,
        qrExpiresAt: pending?.qrExpiresAt || null,
        message: "QR kod hazırlanıyor. Lütfen birkaç saniye bekleyin.",
      }, { status: 202 });
    }
  } catch (error) {
    const status = whatsappRequestErrorStatus(error);
    const message = whatsappUserMessage(error, "qr");
    logger.error("whatsapp.connect.request_failed", error, { accountId, status, message });
    if (accountId) await prisma.whatsAppAccount.updateMany({ where: { id: accountId }, data: { status: "FAILED", lastError: message } });
    return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : message, accountId }, { status });
  }
}
