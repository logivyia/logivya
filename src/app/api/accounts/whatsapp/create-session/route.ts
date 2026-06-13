import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { prisma } from "@/server/db";
import { whatsappQueue } from "@/server/queues/client";
import { writeAuditLog } from "@/server/security/audit";
import { cleanupStuckWhatsAppAccounts } from "@/server/whatsapp/cleanup";
import { findReusableWhatsAppAccount, findSingleSlotWhatsAppAccount } from "@/server/whatsapp/reusable-account";
import { assertWhatsAppWorkerReachable, waitForAccountQr } from "@/server/whatsapp/worker-health";
import { whatsappUserMessage } from "@/server/whatsapp/user-errors";
import { AccountStatus } from "@prisma/client";
import { resetAccountForConnection } from "@/lib/whatsapp/account-status-machine";
import { assertSameOrigin, enforceWhatsAppRateLimit } from "@/server/whatsapp/request-guards";

export async function POST(request: Request) {
  let accountId: string | undefined;
  try {
    assertSameOrigin(request);
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "connect_accounts");
    await cleanupStuckWhatsAppAccounts(company.id);
    await assertWhatsAppWorkerReachable();

    let account = await findReusableWhatsAppAccount(company.id);
    if (!account) {
      const access = await subscriptionAccess.canConnectWhatsAppAccount(company.id);
      if (!access.allowed) account = await findSingleSlotWhatsAppAccount(company.id, access.limit);
      if (!account && !access.allowed) return NextResponse.json({ error: access.reason, limit: access.limit }, { status: 403 });
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
    await whatsappQueue().add("reconnect", { action: "reconnect", accountId }, { jobId: `qr-${accountId}-${Date.now()}` });
    const ready = await waitForAccountQr(accountId);
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "whatsapp.qr.requested", entityType: "WhatsAppAccount", entityId: accountId });
    return NextResponse.json({ ok: true, accountId, status: ready.status, qr: ready.qrCode, qrCode: ready.qrCode, expiresAt: ready.qrExpiresAt, qrExpiresAt: ready.qrExpiresAt }, { status: 201 });
  } catch (error) {
    const message = whatsappUserMessage(error, "qr");
    if (accountId) await prisma.whatsAppAccount.updateMany({ where: { id: accountId }, data: { status: "FAILED", lastError: message } });
    return NextResponse.json({ error: message, accountId }, { status: 503 });
  }
}
