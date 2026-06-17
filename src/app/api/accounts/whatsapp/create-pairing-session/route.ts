import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { prisma } from "@/server/db";
import { enqueueWhatsAppJob } from "@/server/queues/producer";
import { writeAuditLog } from "@/server/security/audit";
import { cleanupStuckWhatsAppAccounts } from "@/server/whatsapp/cleanup";
import { pairingUserMessage } from "@/server/whatsapp/pairing-errors";
import { whatsappLastErrorCode, whatsappUserMessage } from "@/server/whatsapp/user-errors";
import { normalizeWhatsAppPhoneNumber } from "@/server/whatsapp/phone";
import { findReusableWhatsAppAccount, findSingleSlotWhatsAppAccount } from "@/server/whatsapp/reusable-account";
import { assertWhatsAppWorkerReachable, isWhatsAppWaitTimeout, waitForPairingCode } from "@/server/whatsapp/worker-health";
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
    const body = await request.json() as { phoneNumber?: unknown };
    if (typeof body.phoneNumber !== "string") throw new Error("INVALID_WHATSAPP_PHONE");
    const phoneNumber = normalizeWhatsAppPhoneNumber(body.phoneNumber);
    logger.info("whatsapp.pairing.requested", { companyId: company.id, userId: user.id, phoneNumber: `${phoneNumber.slice(0, 3)}****${phoneNumber.slice(-2)}` });
    await enforceWhatsAppRateLimit("pairing-phone", phoneNumber);
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
      if (!account && !access.allowed) return NextResponse.json({ error: whatsappUserMessage(new Error(access.reason || "accounts.planLimit"), "pairing"), reason: access.reason, limit: access.limit }, { status: 403 });
    }
    if (account) {
      account = await resetAccountForConnection(account.id, AccountStatus.PENDING_PAIRING, { phoneNumber });
    } else {
      account = await prisma.whatsAppAccount.create({
        data: { companyId: company.id, label: null, phoneNumber, provider: process.env.WHATSAPP_PROVIDER || "baileys", status: AccountStatus.CREATED },
      });
      account = await resetAccountForConnection(account.id, AccountStatus.PENDING_PAIRING, { phoneNumber });
    }

    accountId = account.id;
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "whatsapp.pairing.requested", entityType: "WhatsAppAccount", entityId: accountId, after: { phoneNumber: `${phoneNumber.slice(0, 3)}****${phoneNumber.slice(-2)}` } });
    const job = await enqueueWhatsAppJob("pairing", { action: "pairing", accountId, phoneNumber }, { jobId: `pairing-${accountId}-${Date.now()}` });
    logger.info("whatsapp.connect.job.enqueued", { accountId, jobId: job.id, action: "pairing", mode: "PHONE_CODE" });
    try {
      const ready = await waitForPairingCode(accountId);
      return NextResponse.json({ ok: true, accountId, status: ready.status, pairingCode: ready.pairingCode, expiresAt: ready.pairingCodeExpiresAt, pairingCodeExpiresAt: ready.pairingCodeExpiresAt }, { status: 201 });
    } catch (waitError) {
      if (!isWhatsAppWaitTimeout(waitError)) throw waitError;
      const pending = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
      return NextResponse.json({
        ok: true,
        pending: true,
        accountId,
        status: pending?.status || AccountStatus.PENDING_PAIRING,
        pairingCode: pending?.pairingCode || null,
        expiresAt: pending?.pairingCodeExpiresAt || null,
        pairingCodeExpiresAt: pending?.pairingCodeExpiresAt || null,
        message: "Telefon kodu hazırlanıyor. Lütfen birkaç saniye bekleyin.",
      }, { status: 202 });
    }
  } catch (error) {
    const status = whatsappRequestErrorStatus(error, error instanceof Error && error.message === "INVALID_WHATSAPP_PHONE" ? 400 : 503);
    const message = pairingUserMessage(error);
    logger.error("whatsapp.pairing.request_failed", error, { accountId, status, message });
    if (accountId) await prisma.whatsAppAccount.updateMany({ where: { id: accountId }, data: { status: "FAILED", lastError: whatsappLastErrorCode(error) } });
    return NextResponse.json({ error: status === 401 ? "UNAUTHORIZED" : message, accountId }, { status });
  }
}
