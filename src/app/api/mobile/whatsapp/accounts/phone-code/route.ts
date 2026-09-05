import { AccountStatus } from "@prisma/client";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { enforceMobileRateLimit } from "@/server/mobile/rate-limit";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { serializeMobileAccount } from "@/server/mobile/whatsapp";
import { writeAuditLog } from "@/server/security/audit";
import { cleanupStuckWhatsAppAccounts } from "@/server/whatsapp/cleanup";
import { requestPhonePairingCode } from "@/server/whatsapp/pairing-code-flow";
import { parsePhonePairingRequest, persistPhonePairingMetadata, phonePairingErrorCode } from "@/server/whatsapp/phone-pairing-input";
import { findReusableWhatsAppAccount, findSingleSlotWhatsAppAccount } from "@/server/whatsapp/reusable-account";
import { assertWhatsAppWorkerReachable, isWhatsAppWaitTimeout } from "@/server/whatsapp/worker-health";

export async function POST(request: Request) {
  let accountId: string | undefined;
  try {
    const { company, user } = await requireMobileAuth(request);
    const phone = parsePhonePairingRequest(await request.json());
    enforceMobileRateLimit(`mobile-wa-phone:${company.id}:${phone.e164}`, 8, 60 * 60_000);
    await cleanupStuckWhatsAppAccounts(company.id);
    const connected = await prisma.whatsAppAccount.findFirst({
      where: { companyId: company.id, userId: user.id, archivedAt: null, status: "CONNECTED" },
      include: { _count: { select: { groups: true, contacts: true } } },
    });
    if (connected) {
      return mobileSuccess({ account: serializeMobileAccount(connected) });
    }
    await assertWhatsAppWorkerReachable();
    let account = await findReusableWhatsAppAccount(company.id, user.id);
    if (!account) {
      const access = await subscriptionAccess.canConnectWhatsAppAccount(company.id, user.id);
      if (!access.allowed) account = await findSingleSlotWhatsAppAccount(company.id, user.id, access.limit);
      if (!account && !access.allowed) return mobileError("SUBSCRIPTION_LOCKED", "Aboneliğiniz aktif değil. WhatsApp hesabı bağlamak için aboneliğinizi yenileyin.", { status: 403, details: { reason: access.reason, limit: access.limit } });
    }
    account = account
      ? account
      : await prisma.whatsAppAccount.create({ data: { companyId: company.id, userId: user.id, phoneNumber: phone.e164, countryIso: phone.countryIso, messageLocale: phone.locale, connectionMethod: "PHONE_CODE", provider: process.env.WHATSAPP_PROVIDER || "baileys", status: AccountStatus.CREATED } });
    accountId = account.id;
    await persistPhonePairingMetadata({ accountId, companyId: company.id, userId: user.id, phone, source: "mobile" });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "mobile.whatsapp.pairing.requested", entityType: "WhatsAppAccount", entityId: accountId, after: { countryIso: phone.countryIso, phoneNumber: `${phone.digits.slice(0, 3)}****${phone.digits.slice(-2)}` } });
    const { ready } = await requestPhonePairingCode({ accountId, phoneNumber: phone.e164, source: "mobile", companyId: company.id, userId: user.id });
    if (!ready) {
      const refreshedConnected = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId }, include: { _count: { select: { groups: true, contacts: true } } } });
      return mobileSuccess({ account: serializeMobileAccount(refreshedConnected) });
    }
    const refreshed = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId }, include: { _count: { select: { groups: true, contacts: true } } } });
    return mobileSuccess({ account: serializeMobileAccount({ ...refreshed, pairingCode: ready.pairingCode, pairingCodeExpiresAt: ready.pairingCodeExpiresAt }) }, { status: 201 });
  } catch (error) {
    const validationCode = phonePairingErrorCode(error);
    if (validationCode) return mobileError(validationCode, validationCode, { status: 400 });
    if (accountId && isWhatsAppWaitTimeout(error)) {
      const pending = await prisma.whatsAppAccount.findUniqueOrThrow({
        where: { id: accountId },
        include: { _count: { select: { groups: true, contacts: true } } },
      });
      return mobileSuccess({ account: serializeMobileAccount(pending) }, { status: 202 });
    }
    if (accountId) await prisma.whatsAppAccount.updateMany({ where: { id: accountId, status: { in: ["PENDING_PAIRING", "PAIRING_CODE_READY", "CONNECTING"] } }, data: { lastError: "MOBILE_PAIRING_FAILED" } });
    return mobileSafeError(error, "Telefon kodu oluşturulamadı.");
  }
}
