import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { requirePermission } from "@/server/auth/permissions";
import { writeAuditLog } from "@/server/security/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role,"cancel_campaigns");
    const { id } = await params;
    const campaign = await prisma.messageCampaign.findFirst({ where: { id, companyId: company.id } });
    if (!campaign) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    await prisma.$transaction([
      prisma.messageCampaign.update({ where: { id }, data: { status: "CANCELED" } }),
      prisma.messageRecipient.updateMany({ where: { campaignId: id, status: "PENDING" }, data: { status: "CANCELED" } }),
    ]);
    await writeAuditLog(request,{companyId:company.id,userId:user.id,action:"campaign.canceled",entityType:"MessageCampaign",entityId:id});
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }); }
}
