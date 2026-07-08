import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { enqueueWhatsAppJob } from "@/server/queues/producer";
import { requirePermission } from "@/server/auth/permissions";
import { writeAuditLog } from "@/server/security/audit";
import { whatsappUserMessage } from "@/server/whatsapp/user-errors";
import { AccountStatus } from "@prisma/client";
import { assertSameOrigin, enforceWhatsAppRateLimit } from "@/server/whatsapp/request-guards";
import { hasRestorableWhatsAppCredentials } from "@/lib/whatsapp/session-manager";
import { transitionAccountStatus } from "@/lib/whatsapp/account-status-machine";
import { hasActivePhonePairing } from "@/server/whatsapp/pairing-guard";

const schema = z.object({ action: z.enum(["sync", "disconnect", "reconnect", "archive", "restore"]) });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { company, membership, user } = await requireApiSession();
    const { id } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    const account = await prisma.whatsAppAccount.findFirst({ where: { id, companyId: company.id, userId: user.id } });
    if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const permission = ["archive", "restore"].includes(parsed.data.action) ? "archive_accounts" : parsed.data.action === "disconnect" ? "disconnect_accounts" : "manage_accounts";
    requirePermission(membership.role, permission);
    if (parsed.data.action === "archive") {
      await transitionAccountStatus(id, AccountStatus.ARCHIVED, { archivedAt: new Date() });
      await prisma.whatsAppGroup.updateMany({ where: { accountId: id }, data: { isArchived: true } });
      await prisma.notification.create({ data: { companyId: company.id, userId: user.id, type: "ACCOUNT_ARCHIVED", title: "WhatsApp hesabı arşivlendi", message: `${account.label} arşivlendi.` } });
    } else if (parsed.data.action === "restore") {
      await transitionAccountStatus(id, AccountStatus.DISCONNECTED, { archivedAt: null, lastError: null });
    } else {
      let queuedAction: "sync" | "disconnect" | "reconnect" | "connect" = parsed.data.action;
      if (parsed.data.action === "reconnect") {
        await enforceWhatsAppRateLimit("reconnect-account", id);
        if (hasActivePhonePairing(account)) {
          await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "whatsapp.reconnect.skipped_active_pairing", entityType: "WhatsAppAccount", entityId: id, before: { status: account.status }, after: { requestedAction: parsed.data.action } });
          return NextResponse.json({ ok: true, skipped: "active_phone_pairing" });
        }
        if (await hasRestorableWhatsAppCredentials(id)) {
          await prisma.whatsAppAccount.update({
            where: { id },
            data: { status: AccountStatus.CONNECTING, qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null },
          });
        } else {
          await transitionAccountStatus(id, AccountStatus.CREATED, { qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null });
          queuedAction = "connect";
        }
      }
      await enqueueWhatsAppJob(queuedAction, { action: queuedAction, accountId: id }, { jobId: `${queuedAction}-${id}-${Date.now()}` });
    }
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: parsed.data.action === "reconnect" ? "whatsapp.reconnect.requested" : `whatsapp.account.${parsed.data.action}`, entityType: "WhatsAppAccount", entityId: id, before: { status: account.status }, after: { requestedAction: parsed.data.action } });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: whatsappUserMessage(error) }, { status: 503 }); }
}
