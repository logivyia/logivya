import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { whatsappQueue } from "@/server/queues/client";
import { writeAuditLog } from "@/server/security/audit";
import { AccountStatus } from "@prisma/client";
import { transitionAccountStatus } from "@/lib/whatsapp/account-status-machine";
import { assertSameOrigin, enforceWhatsAppRateLimit } from "@/server/whatsapp/request-guards";
import { whatsappUserMessage } from "@/server/whatsapp/user-errors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "connect_accounts");
    const { id } = await params;
    const account = await prisma.whatsAppAccount.findFirst({ where: { id, companyId: company.id, archivedAt: null } });
    if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    await enforceWhatsAppRateLimit("reconnect-account", id);
    await transitionAccountStatus(id, AccountStatus.CREATED, { qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null });
    await whatsappQueue().add("reconnect", { action: "reconnect", accountId: id }, { jobId: `reconnect-${id}-${Date.now()}` });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "whatsapp.reconnect.requested", entityType: "WhatsAppAccount", entityId: id });
    return NextResponse.json({ ok: true, accountId: id, status: AccountStatus.CREATED });
  } catch (error) {
    return NextResponse.json({ error: whatsappUserMessage(error) }, { status: 503 });
  }
}
