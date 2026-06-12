import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { prisma } from "@/server/db";
import { whatsappQueue } from "@/server/queues/client";
import { writeAuditLog } from "@/server/security/audit";
import { cleanupStuckWhatsAppAccounts } from "@/server/whatsapp/cleanup";
import { findReusableWhatsAppAccount } from "@/server/whatsapp/reusable-account";
import { assertWhatsAppWorkerReachable, waitForAccountQr } from "@/server/whatsapp/worker-health";

export async function POST(request: Request) {
  let accountId: string | undefined;
  try {
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "connect_accounts");
    await cleanupStuckWhatsAppAccounts(company.id);
    await assertWhatsAppWorkerReachable();

    let account = await findReusableWhatsAppAccount(company.id);
    if (account) {
      account = await prisma.whatsAppAccount.update({
        where: { id: account.id },
        data: { status: "CONNECTING", qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null },
      });
    } else {
      const access = await subscriptionAccess.canConnectWhatsAppAccount(company.id);
      if (!access.allowed) return NextResponse.json({ error: access.reason, limit: access.limit }, { status: 403 });
      account = await prisma.whatsAppAccount.create({
        data: { companyId: company.id, label: null, provider: process.env.WHATSAPP_PROVIDER || "baileys", status: "CONNECTING" },
      });
    }

    accountId = account.id;
    await whatsappQueue().add("reconnect", { action: "reconnect", accountId }, { jobId: `qr-${accountId}-${Date.now()}` });
    const ready = await waitForAccountQr(accountId);
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "whatsapp.session.created", entityType: "WhatsAppAccount", entityId: accountId });
    return NextResponse.json({ accountId, status: ready.status, qrCode: ready.qrCode, qrExpiresAt: ready.qrExpiresAt }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WhatsApp QR generation failed.";
    if (accountId) await prisma.whatsAppAccount.updateMany({ where: { id: accountId }, data: { status: "ERROR", lastError: message } });
    return NextResponse.json({ error: message, accountId }, { status: message === "WhatsApp worker is not reachable." ? 503 : 500 });
  }
}
