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

    const deletedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.messageCampaign.updateMany({
        where: { id, companyId: company.id, createdById: user.id },
        data: { deletedAt, platformDeletedAt: deletedAt, status: "DELETED" },
      });
      if (!updated.count) return updated;
      await tx.messageRecipient.updateMany({
        where: { campaignId: id, campaign: { companyId: company.id, createdById: user.id } },
        data: { platformDeletedAt: deletedAt },
      });
      return updated;
    });

    if (!result.count) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "campaign.deleted",
      entityType: "MessageCampaign",
      entityId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "errors.generic";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 403 });
  }
}
