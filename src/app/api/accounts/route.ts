import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { whatsappQueue } from "@/server/queues/client";
import { requirePermission } from "@/server/auth/permissions";
import { writeAuditLog } from "@/server/security/audit";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { assertWhatsAppWorkerReachable } from "@/server/whatsapp/worker-health";
import { cleanupStuckWhatsAppAccounts } from "@/server/whatsapp/cleanup";
import { whatsappUserMessage } from "@/server/whatsapp/user-errors";

const schema = z.object({ label: z.string().min(2).max(80).optional() });
export async function GET() {
  try {
    const { company } = await requireApiSession();
    await cleanupStuckWhatsAppAccounts(company.id);
    const accounts = await prisma.whatsAppAccount.findMany({ where: { companyId: company.id }, include: { _count: { select: { groups: true, contacts: true, recipients: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
    return NextResponse.json({ accounts });
  } catch { return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }); }
}
export async function POST(request: Request) {
  try {
    const { company, membership, user } = await requireApiSession();
    await cleanupStuckWhatsAppAccounts(company.id);
    requirePermission(membership.role, "connect_accounts");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    await assertWhatsAppWorkerReachable();
    const access=await subscriptionAccess.canConnectWhatsAppAccount(company.id);
    if(!access.allowed)return NextResponse.json({error:access.reason,limit:access.limit},{status:403});
    const account = await prisma.whatsAppAccount.create({ data: { companyId: company.id, label: parsed.data.label || null, provider: "baileys", status: "PENDING_QR" } });
    try {
      await whatsappQueue().add("connect", { action: "connect", accountId: account.id }, { jobId: `connect-${account.id}` });
    } catch (error) {
      await prisma.whatsAppAccount.update({where:{id:account.id},data:{status:"FAILED",lastError:whatsappUserMessage(error,"qr")}});
      throw error;
    }
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "whatsapp.account.created", entityType: "WhatsAppAccount", entityId: account.id, after: { label: account.label } });
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: whatsappUserMessage(error, "qr") }, { status: 503 }); }
}
