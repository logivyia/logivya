import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { enqueueWhatsAppJob } from "@/server/queues/producer";
import { writeAuditLog } from "@/server/security/audit";
import { assertWhatsAppWorkerReachable, isWhatsAppWaitTimeout, waitForAccountQr } from "@/server/whatsapp/worker-health";
import { whatsappLastErrorCode, whatsappUserMessage } from "@/server/whatsapp/user-errors";
import { logger } from "@/server/observability/logger";
import { AccountStatus } from "@prisma/client";
import { resetAccountForConnection } from "@/lib/whatsapp/account-status-machine";
import { assertSameOrigin, enforceWhatsAppRateLimit, whatsappRequestErrorStatus } from "@/server/whatsapp/request-guards";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let accountId: string | undefined;
  try {
    assertSameOrigin(request);
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "connect_accounts");
    await assertWhatsAppWorkerReachable();
    const { id } = await params;
    accountId = id;
    const account = await prisma.whatsAppAccount.findFirst({ where: { id, companyId: company.id, userId: user.id, archivedAt: null } });
    if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (account.status === "CONNECTED") {
      return NextResponse.json({ ok: true, alreadyConnected: true, accountId: account.id, status: account.status, message: "WhatsApp hesabınız zaten bağlı." });
    }
    await enforceWhatsAppRateLimit("qr-account", id);
    await resetAccountForConnection(id, AccountStatus.PENDING_QR);
    logger.info("whatsapp.connect.requested", { companyId: company.id, userId: user.id, accountId: id, mode: "QR_REGENERATE" });
    const job = await enqueueWhatsAppJob("connect", { action: "connect", accountId: id }, { jobId: `regenerate-${id}-${Date.now()}` });
    logger.info("whatsapp.connect.job.enqueued", { accountId: id, jobId: job.id, action: "connect", mode: "QR_REGENERATE" });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "whatsapp.qr.regenerated", entityType: "WhatsAppAccount", entityId: id });
    try {
      const ready = await waitForAccountQr(id);
      return NextResponse.json({ ok: true, accountId: id, status: ready.status, qr: ready.qrCode, qrCode: ready.qrCode, expiresAt: ready.qrExpiresAt, qrExpiresAt: ready.qrExpiresAt });
    } catch (waitError) {
      if (!isWhatsAppWaitTimeout(waitError)) throw waitError;
      const pending = await prisma.whatsAppAccount.findUnique({ where: { id } });
      return NextResponse.json({
        ok: true,
        pending: true,
        accountId: id,
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
    logger.error("whatsapp.regenerate_qr.request_failed", error, { accountId, status, message });
    if (accountId && status >= 500) {
      await prisma.whatsAppAccount.updateMany({
        where: { id: accountId, status: { in: ["PENDING_QR", "QR_READY", "CONNECTING"] } },
        data: { lastError: whatsappLastErrorCode(error) },
      });
    }
    return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : message, accountId }, { status });
  }
}
