import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import { deleteWhatsAppMessageForEveryone } from "@/lib/whatsapp/delete-message";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "delete_campaigns");
    const campaign = await prisma.messageCampaign.findFirst({
      where: { id, companyId: company.id, deletedAt: null },
      include: { recipients: { where: { status: "SENT" }, select: { accountId: true, recipientExternalId: true } } },
    });
    if (!campaign) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    let deleted = 0;
    let failed = 0;
    for (const recipient of campaign.recipients) {
      const result = await deleteWhatsAppMessageForEveryone({ accountId: recipient.accountId, recipientExternalId: recipient.recipientExternalId });
      if (result.ok) deleted += 1;
      else failed += 1;
    }
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "campaign.delete_for_everyone_requested",
      entityType: "MessageCampaign",
      entityId: id,
      after: { deleted, failed, supported: false },
    });
    return NextResponse.json({ ok: false, notSupported: true, deleted, failed, message: "Bu mesaj için WhatsApp mesaj kimliği bulunamadı." }, { status: 409 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 403 });
  }
}
