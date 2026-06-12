import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { prisma } from "@/server/db";
import { whatsappQueue } from "@/server/queues/client";
import { writeAuditLog } from "@/server/security/audit";
import { cleanupStuckWhatsAppAccounts } from "@/server/whatsapp/cleanup";
import { assertWhatsAppWorkerReachable, waitForPairingCode } from "@/server/whatsapp/worker-health";

const schema = z.object({ phoneNumber: z.string().regex(/^\+?[0-9]{7,15}$/) });

export async function POST(request: Request) {
  let accountId: string | undefined;
  try {
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "connect_accounts");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Geçerli bir telefon numarası girin." }, { status: 400 });
    await cleanupStuckWhatsAppAccounts(company.id);
    await assertWhatsAppWorkerReachable();
    const access = await subscriptionAccess.canConnectWhatsAppAccount(company.id);
    if (!access.allowed) return NextResponse.json({ error: access.reason, limit: access.limit }, { status: 403 });
    const account = await prisma.whatsAppAccount.create({
      data: { companyId: company.id, label: null, phoneNumber: parsed.data.phoneNumber.replace(/\D/g, ""), provider: process.env.WHATSAPP_PROVIDER || "baileys", status: "CONNECTING" },
    });
    accountId = account.id;
    await whatsappQueue().add("pairing", { action: "pairing", accountId: account.id, phoneNumber: parsed.data.phoneNumber }, { jobId: `pairing-${account.id}` });
    const ready = await waitForPairingCode(account.id);
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "whatsapp.pairing.created", entityType: "WhatsAppAccount", entityId: account.id });
    return NextResponse.json({ accountId: ready.id, status: ready.status, pairingCode: ready.pairingCode, pairingCodeExpiresAt: ready.pairingCodeExpiresAt }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WhatsApp pairing code generation failed.";
    if (accountId) await prisma.whatsAppAccount.updateMany({ where: { id: accountId }, data: { status: "ERROR", lastError: message } });
    return NextResponse.json({ error: message, accountId }, { status: message === "WhatsApp worker is not reachable." ? 503 : 500 });
  }
}
