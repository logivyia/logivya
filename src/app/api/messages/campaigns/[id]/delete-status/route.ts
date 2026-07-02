import { NextResponse } from "next/server";

import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getCampaignDeleteState } from "@/server/messages/delete-for-everyone";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "view_message_history");

    const campaign = await prisma.messageCampaign.findFirst({
      where: { id, companyId: company.id, createdById: user.id },
      select: { id: true },
    });
    if (!campaign) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    return NextResponse.json({ ok: true, deleteForEveryone: await getCampaignDeleteState(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "errors.generic";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 403 });
  }
}
