import { NextResponse } from "next/server";

import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "view_message_history");

    const campaign = await prisma.messageCampaign.findFirst({
      where: { id, companyId: company.id, createdById: user.id },
      select: { id: true },
    });
    if (!campaign) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    await prisma.userMessageVisibility.upsert({
      where: { userId_campaignId: { userId: user.id, campaignId: id } },
      create: { userId: user.id, campaignId: id, deletedForMeAt: new Date() },
      update: { deletedForMeAt: new Date() },
    });

    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "campaign.deleted_for_me",
      entityType: "MessageCampaign",
      entityId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "errors.generic";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 403 });
  }
}
