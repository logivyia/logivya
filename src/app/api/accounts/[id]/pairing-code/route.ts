import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { enqueueWhatsAppJob } from "@/server/queues/producer";
import { writeAuditLog } from "@/server/security/audit";
import { pairingUserMessage } from "@/server/whatsapp/pairing-errors";
import { normalizeWhatsAppPhoneNumber } from "@/server/whatsapp/phone";
import { assertWhatsAppWorkerReachable, isWhatsAppWaitTimeout, waitForPairingCode } from "@/server/whatsapp/worker-health";
import { logger } from "@/server/observability/logger";
import { AccountStatus } from "@prisma/client";
import { resetAccountForConnection } from "@/lib/whatsapp/account-status-machine";
import { assertSameOrigin, enforceWhatsAppRateLimit } from "@/server/whatsapp/request-guards";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let accountId: string | undefined;
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "connect_accounts");
    const body = await request.json() as { phoneNumber?: unknown };
    if (typeof body.phoneNumber !== "string") throw new Error("INVALID_WHATSAPP_PHONE");
    const phoneNumber = normalizeWhatsAppPhoneNumber(body.phoneNumber);
    logger.info("whatsapp.pairing.requested", { companyId: company.id, userId: user.id, accountId: id, phoneNumber: `${phoneNumber.slice(0, 3)}****${phoneNumber.slice(-2)}` });
    await enforceWhatsAppRateLimit("pairing-phone", phoneNumber);
    await assertWhatsAppWorkerReachable();
    const account = await prisma.whatsAppAccount.findFirst({ where: { id, companyId: company.id, archivedAt: null } });
    if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (account.status === "CONNECTED") {
      return NextResponse.json({ ok: true, alreadyConnected: true, accountId: account.id, status: account.status, message: "WhatsApp hesabınız zaten bağlı." });
    }
    accountId = id;
    await resetAccountForConnection(id, AccountStatus.PENDING_PAIRING, { phoneNumber });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "whatsapp.pairing.requested", entityType: "WhatsAppAccount", entityId: id, after: { phoneNumber: `${phoneNumber.slice(0, 3)}****${phoneNumber.slice(-2)}` } });
    const job = await enqueueWhatsAppJob("pairing", { action: "pairing", accountId: id, phoneNumber }, { jobId: `pairing-${id}-${Date.now()}` });
    logger.info("whatsapp.connect.job.enqueued", { accountId: id, jobId: job.id, action: "pairing", mode: "PHONE_CODE" });
    try {
      const ready = await waitForPairingCode(id);
      return NextResponse.json({ ok: true, accountId: id, status: ready.status, pairingCode: ready.pairingCode, expiresAt: ready.pairingCodeExpiresAt, pairingCodeExpiresAt: ready.pairingCodeExpiresAt });
    } catch (waitError) {
      if (!isWhatsAppWaitTimeout(waitError)) throw waitError;
      const pending = await prisma.whatsAppAccount.findUnique({ where: { id } });
      return NextResponse.json({
        ok: true,
        pending: true,
        accountId: id,
        status: pending?.status || AccountStatus.PENDING_PAIRING,
        pairingCode: pending?.pairingCode || null,
        expiresAt: pending?.pairingCodeExpiresAt || null,
        pairingCodeExpiresAt: pending?.pairingCodeExpiresAt || null,
        message: "Telefon kodu hazırlanıyor. Lütfen birkaç saniye bekleyin.",
      }, { status: 202 });
    }
  } catch (error) {
    const message = pairingUserMessage(error);
    if (accountId) await prisma.whatsAppAccount.updateMany({ where: { id: accountId }, data: { status: "FAILED", lastError: message } });
    return NextResponse.json({ error: message, accountId }, { status: error instanceof Error && error.message === "INVALID_WHATSAPP_PHONE" ? 400 : 503 });
  }
}
