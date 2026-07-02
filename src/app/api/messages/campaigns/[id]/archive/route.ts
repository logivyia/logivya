import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "delete_campaigns");
    const result = await prisma.messageCampaign.updateMany({
      where: { id, companyId: company.id, createdById: user.id, deletedAt: null, status: { notIn: ["SENDING", "QUEUED"] } },
      data: { status: "CANCELED" },
    });
    if (!result.count) return NextResponse.json({ error: "campaign.archiveUnavailable" }, { status: 409 });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "campaign.archived", entityType: "MessageCampaign", entityId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 403 });
  }
}
