import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { whatsappQueue } from "@/server/queues/client";
import { writeAuditLog } from "@/server/security/audit";
import { assertWhatsAppWorkerReachable, waitForPairingCode } from "@/server/whatsapp/worker-health";

const schema = z.object({ phoneNumber: z.string().regex(/^\+?[0-9]{7,15}$/) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "connect_accounts");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Geçerli bir telefon numarası girin." }, { status: 400 });
    await assertWhatsAppWorkerReachable();
    const account = await prisma.whatsAppAccount.findFirst({ where: { id, companyId: company.id, archivedAt: null } });
    if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    await prisma.whatsAppAccount.update({
      where: { id },
      data: { phoneNumber: parsed.data.phoneNumber.replace(/\D/g, ""), status: "CONNECTING", qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null },
    });
    await whatsappQueue().add("pairing", { action: "pairing", accountId: id, phoneNumber: parsed.data.phoneNumber }, { jobId: `pairing-${id}-${Date.now()}` });
    const ready = await waitForPairingCode(id);
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "whatsapp.pairing.created", entityType: "WhatsAppAccount", entityId: id });
    return NextResponse.json({ accountId: id, status: ready.status, pairingCode: ready.pairingCode, pairingCodeExpiresAt: ready.pairingCodeExpiresAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "WhatsApp pairing code generation failed." }, { status: 503 });
  }
}
