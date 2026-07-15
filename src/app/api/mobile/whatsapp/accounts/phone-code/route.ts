import { AccountStatus } from "@prisma/client";
import { z } from "zod";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { enforceMobileRateLimit } from "@/server/mobile/rate-limit";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { serializeMobileAccount } from "@/server/mobile/whatsapp";
import { writeAuditLog } from "@/server/security/audit";
import { cleanupStuckWhatsAppAccounts } from "@/server/whatsapp/cleanup";
import { requestPhonePairingCode } from "@/server/whatsapp/pairing-code-flow";
import { normalizeWhatsAppPhoneNumber } from "@/server/whatsapp/phone";
import { findReusableWhatsAppAccount, findSingleSlotWhatsAppAccount } from "@/server/whatsapp/reusable-account";
import { assertWhatsAppWorkerReachable, isWhatsAppWaitTimeout } from "@/server/whatsapp/worker-health";

const schema = z.object({ phoneNumber: z.string().min(7).max(30) });

export async function POST(request: Request) {
  let accountId: string | undefined;
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const { company, user } = await requireMobileAuth(request);
    const phoneNumber = normalizeWhatsAppPhoneNumber(parsed.data.phoneNumber);
    enforceMobileRateLimit(`mobile-wa-phone:${company.id}:${phoneNumber}`, 8, 60 * 60_000);
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
      : await prisma.whatsAppAccount.create({ data: { companyId: company.id, userId: user.id, phoneNumber, provider: process.env.WHATSAPP_PROVIDER || "baileys", status: AccountStatus.CREATED } });
    accountId = account.id;
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "mobile.whatsapp.pairing.requested", entityType: "WhatsAppAccount", entityId: accountId, after: { phoneNumber } });
    const { ready } = await requestPhonePairingCode({ accountId, phoneNumber, source: "mobile", companyId: company.id, userId: user.id });
    if (!ready) {
      const refreshedConnected = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId }, include: { _count: { select: { groups: true, contacts: true } } } });
      return mobileSuccess({ account: serializeMobileAccount(refreshedConnected) });
    }
    const refreshed = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId }, include: { _count: { select: { groups: true, contacts: true } } } });
    return mobileSuccess({ account: serializeMobileAccount({ ...refreshed, pairingCode: ready.pairingCode, pairingCodeExpiresAt: ready.pairingCodeExpiresAt }) }, { status: 201 });
  } catch (error) {
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
