import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import { requestPhonePairingCode } from "@/server/whatsapp/pairing-code-flow";
import { visiblePhonePairingCode } from "@/server/whatsapp/pairing-code-state";
import { pairingUserMessage } from "@/server/whatsapp/pairing-errors";
import { whatsappLastErrorCode } from "@/server/whatsapp/user-errors";
import { parsePhonePairingRequest, persistPhonePairingMetadata, phonePairingErrorCode } from "@/server/whatsapp/phone-pairing-input";
import { assertWhatsAppWorkerReachable, isWhatsAppWaitTimeout } from "@/server/whatsapp/worker-health";
import { logger } from "@/server/observability/logger";
import { AccountStatus } from "@prisma/client";
import { assertSameOrigin, enforceWhatsAppRateLimit, whatsappRequestErrorStatus } from "@/server/whatsapp/request-guards";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let accountId: string | undefined;
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "connect_accounts");
    const phone = parsePhonePairingRequest(await request.json());
    logger.info("whatsapp.pairing.requested", { companyId: company.id, userId: user.id, accountId: id, countryIso: phone.countryIso, phoneNumber: `${phone.digits.slice(0, 3)}****${phone.digits.slice(-2)}` });
    await enforceWhatsAppRateLimit("pairing-phone", phone.e164);
    await assertWhatsAppWorkerReachable();
    const account = await prisma.whatsAppAccount.findFirst({ where: { id, companyId: company.id, userId: user.id, archivedAt: null } });
    if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (account.status === "CONNECTED") {
      return NextResponse.json({ ok: true, alreadyConnected: true, accountId: account.id, status: account.status, message: "WhatsApp hesabınız zaten bağlı." });
    }
    accountId = id;
    await persistPhonePairingMetadata({ accountId: id, companyId: company.id, userId: user.id, phone, source: "web" });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "whatsapp.pairing.requested", entityType: "WhatsAppAccount", entityId: id, after: { countryIso: phone.countryIso, phoneNumber: `${phone.digits.slice(0, 3)}****${phone.digits.slice(-2)}` } });
    try {
      const { ready } = await requestPhonePairingCode({ accountId: id, phoneNumber: phone.e164, source: "web", companyId: company.id, userId: user.id });
      if (!ready) return NextResponse.json({ ok: true, alreadyConnected: true, accountId: id, status: "CONNECTED", message: "WhatsApp hesabınız zaten bağlı." });
      return NextResponse.json({ ok: true, accountId: id, status: AccountStatus.PAIRING_CODE_READY, pairingCode: ready.pairingCode, expiresAt: ready.pairingCodeExpiresAt, pairingCodeExpiresAt: ready.pairingCodeExpiresAt });
    } catch (waitError) {
      if (!isWhatsAppWaitTimeout(waitError)) throw waitError;
      const pending = await prisma.whatsAppAccount.findUnique({ where: { id } });
      const safePairingCode = pending ? visiblePhonePairingCode(pending) : { pairingCode: null, pairingCodeExpiresAt: null };
      return NextResponse.json({
        ok: true,
        pending: true,
        accountId: id,
        status: safePairingCode.pairingCode ? AccountStatus.PAIRING_CODE_READY : pending?.status || AccountStatus.PENDING_PAIRING,
        pairingCode: safePairingCode.pairingCode,
        expiresAt: safePairingCode.pairingCodeExpiresAt,
        pairingCodeExpiresAt: safePairingCode.pairingCodeExpiresAt,
        message: "Telefon kodu hazırlanıyor. Lütfen birkaç saniye bekleyin.",
      }, { status: 202 });
    }
  } catch (error) {
    const validationCode = phonePairingErrorCode(error);
    const message = pairingUserMessage(error);
    if (accountId) await prisma.whatsAppAccount.updateMany({ where: { id: accountId }, data: { status: "FAILED", lastError: whatsappLastErrorCode(error) } });
    return NextResponse.json(
      { error: message, code: validationCode ?? undefined, accountId },
      { status: whatsappRequestErrorStatus(error, validationCode ? 400 : 503) },
    );
  }
}
