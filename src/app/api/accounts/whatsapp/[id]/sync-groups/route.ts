import { NextResponse } from "next/server";
import { isRecoverableWhatsAppStatus } from "@/lib/whatsapp/account-status-machine";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { enqueueWhatsAppJob } from "@/server/queues/producer";
import { writeAuditLog } from "@/server/security/audit";
import { requestWhatsAppSessionRestoreIfNeeded } from "@/server/whatsapp/session-restore";
import { whatsappUserMessage } from "@/server/whatsapp/user-errors";
import { assertWhatsAppWorkerReachable } from "@/server/whatsapp/worker-health";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, membership, user } = await requireApiSession();
    const { id } = await params;
    const disconnect = new URL(request.url).pathname.endsWith("/disconnect");
    requirePermission(membership.role, disconnect ? "disconnect_accounts" : "manage_accounts");
    await assertWhatsAppWorkerReachable();
    const account = await prisma.whatsAppAccount.findFirst({ where: { id, companyId: company.id, userId: user.id, archivedAt: null } });
    if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (!disconnect && !isRecoverableWhatsAppStatus(account.status, account.lastError)) {
      const restoreRequested = await requestWhatsAppSessionRestoreIfNeeded(account, { companyId: company.id, userId: user.id }, "web-sync-groups");
      if (!restoreRequested) return NextResponse.json({ error: "WhatsApp hesabi bagli degil. Lutfen hesabi yeniden baglayin." }, { status: 409 });
    }
    const action = disconnect ? "disconnect" : "sync";
    await enqueueWhatsAppJob(action, { action, accountId: id }, { jobId: `${action}-${id}-${Date.now()}` });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: `whatsapp.${action}.requested`, entityType: "WhatsAppAccount", entityId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: whatsappUserMessage(error, "sync") }, { status: 503 });
  }
}
