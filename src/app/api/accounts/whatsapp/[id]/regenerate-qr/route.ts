import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { enqueueWhatsAppJob } from "@/server/queues/producer";
import { writeAuditLog } from "@/server/security/audit";
import { assertWhatsAppWorkerReachable, waitForAccountQr } from "@/server/whatsapp/worker-health";
import { whatsappUserMessage } from "@/server/whatsapp/user-errors";
import { AccountStatus } from "@prisma/client";
import { resetAccountForConnection } from "@/lib/whatsapp/account-status-machine";
import { assertSameOrigin, enforceWhatsAppRateLimit } from "@/server/whatsapp/request-guards";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "connect_accounts");
    await assertWhatsAppWorkerReachable();
    const { id } = await params;
    const account = await prisma.whatsAppAccount.findFirst({ where: { id, companyId: company.id, archivedAt: null } });
    if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (account.status === "CONNECTED") {
      return NextResponse.json({ ok: true, alreadyConnected: true, accountId: account.id, status: account.status, message: "WhatsApp hesabınız zaten bağlı." });
    }
    await enforceWhatsAppRateLimit("qr-account", id);
    await resetAccountForConnection(id, AccountStatus.PENDING_QR);
    await enqueueWhatsAppJob("reconnect", { action: "reconnect", accountId: id }, { jobId: `regenerate-${id}-${Date.now()}` });
    const ready = await waitForAccountQr(id);
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "whatsapp.qr.regenerated", entityType: "WhatsAppAccount", entityId: id });
    return NextResponse.json({ ok: true, accountId: id, status: ready.status, qr: ready.qrCode, qrCode: ready.qrCode, expiresAt: ready.qrExpiresAt, qrExpiresAt: ready.qrExpiresAt });
  } catch (error) {
    return NextResponse.json({ error: whatsappUserMessage(error, "qr") }, { status: 503 });
  }
}
