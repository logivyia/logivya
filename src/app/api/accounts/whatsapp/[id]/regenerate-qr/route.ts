import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { whatsappQueue } from "@/server/queues/client";
import { writeAuditLog } from "@/server/security/audit";
import { assertWhatsAppWorkerReachable, waitForAccountQr } from "@/server/whatsapp/worker-health";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "connect_accounts");
    await assertWhatsAppWorkerReachable();
    const { id } = await params;
    const account = await prisma.whatsAppAccount.findFirst({ where: { id, companyId: company.id, archivedAt: null } });
    if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    await prisma.whatsAppAccount.update({ where: { id }, data: { status: "CONNECTING", qrCode: null, qrExpiresAt: null, lastError: null } });
    await whatsappQueue().add("reconnect", { action: "reconnect", accountId: id }, { jobId: `regenerate-${id}-${Date.now()}` });
    const ready = await waitForAccountQr(id);
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "whatsapp.qr.regenerated", entityType: "WhatsAppAccount", entityId: id });
    return NextResponse.json({ accountId: id, status: ready.status, qrCode: ready.qrCode, qrExpiresAt: ready.qrExpiresAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "WhatsApp QR generation failed." }, { status: 503 });
  }
}
