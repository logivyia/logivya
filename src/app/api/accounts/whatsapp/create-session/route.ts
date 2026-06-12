import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { prisma } from "@/server/db";
import { whatsappQueue } from "@/server/queues/client";
import { writeAuditLog } from "@/server/security/audit";
import { assertWhatsAppWorkerReachable, waitForAccountQr } from "@/server/whatsapp/worker-health";
import { cleanupStuckWhatsAppAccounts } from "@/server/whatsapp/cleanup";

export async function POST(request: Request) {
  let accountId: string | undefined;
  try {
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "connect_accounts");
    await cleanupStuckWhatsAppAccounts(company.id);
    await assertWhatsAppWorkerReachable();
    const access = await subscriptionAccess.canConnectWhatsAppAccount(company.id);
    if (!access.allowed) return NextResponse.json({ error: access.reason, limit: access.limit }, { status: 403 });
    const account = await prisma.whatsAppAccount.create({
      data: { companyId: company.id, label: null, provider: process.env.WHATSAPP_PROVIDER || "baileys", status: "CONNECTING" },
    });
    accountId = account.id;
    await whatsappQueue().add("connect", { action: "connect", accountId: account.id }, { jobId: `connect-${account.id}` });
    const ready = await waitForAccountQr(account.id);
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "whatsapp.session.created", entityType: "WhatsAppAccount", entityId: account.id });
    return NextResponse.json({ accountId: ready.id, status: ready.status, qrCode: ready.qrCode, qrExpiresAt: ready.qrExpiresAt }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WhatsApp QR generation failed.";
    if (accountId) await prisma.whatsAppAccount.updateMany({ where: { id: accountId }, data: { status: "ERROR", lastError: message } });
    return NextResponse.json({ error: message, accountId }, { status: message === "WhatsApp worker is not reachable." ? 503 : 500 });
  }
}
