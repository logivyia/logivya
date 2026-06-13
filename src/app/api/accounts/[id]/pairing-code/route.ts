import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { whatsappQueue } from "@/server/queues/client";
import { writeAuditLog } from "@/server/security/audit";
import { pairingUserMessage } from "@/server/whatsapp/pairing-errors";
import { normalizeWhatsAppPhoneNumber } from "@/server/whatsapp/phone";
import { assertWhatsAppWorkerReachable, waitForPairingCode } from "@/server/whatsapp/worker-health";
import { AccountStatus } from "@prisma/client";
import { resetAccountForConnection } from "@/lib/whatsapp/account-status-machine";
import { assertSameOrigin, enforceWhatsAppRateLimit } from "@/server/whatsapp/request-guards";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let accountId: string | undefined;
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "connect_accounts");
    const body = await request.json() as { phoneNumber?: unknown };
    if (typeof body.phoneNumber !== "string") throw new Error("INVALID_WHATSAPP_PHONE");
    const phoneNumber = normalizeWhatsAppPhoneNumber(body.phoneNumber);
    await enforceWhatsAppRateLimit("pairing-phone", phoneNumber);
    await assertWhatsAppWorkerReachable();
    const account = await prisma.whatsAppAccount.findFirst({ where: { id, companyId: company.id, archivedAt: null } });
    if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (account.status === "CONNECTED") {
      return NextResponse.json({ ok: true, alreadyConnected: true, accountId: account.id, status: account.status, message: "WhatsApp hesabınız zaten bağlı." });
    }
    accountId = id;
    await resetAccountForConnection(id, AccountStatus.PENDING_PAIRING, { phoneNumber });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "whatsapp.pairing.requested", entityType: "WhatsAppAccount", entityId: id, after: { phoneNumber } });
    await whatsappQueue().add("pairing", { action: "pairing", accountId: id, phoneNumber }, { jobId: `pairing-${id}-${Date.now()}` });
    const ready = await waitForPairingCode(id);
    return NextResponse.json({ ok: true, accountId: id, status: ready.status, pairingCode: ready.pairingCode, expiresAt: ready.pairingCodeExpiresAt, pairingCodeExpiresAt: ready.pairingCodeExpiresAt });
  } catch (error) {
    const message = pairingUserMessage(error);
    if (accountId) await prisma.whatsAppAccount.updateMany({ where: { id: accountId }, data: { status: "FAILED", lastError: message } });
    return NextResponse.json({ error: message, accountId }, { status: error instanceof Error && error.message === "INVALID_WHATSAPP_PHONE" ? 400 : 503 });
  }
}
