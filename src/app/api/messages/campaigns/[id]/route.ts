import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getCampaignDeleteState } from "@/server/messages/delete-for-everyone";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, user } = await requireApiSession();
    const campaign = await prisma.messageCampaign.findFirst({
      where: {
        id,
        companyId: company.id,
        createdById: user.id,
        visibilityRecords: { none: { userId: user.id, deletedForMeAt: { not: null } } },
      },
      include: { createdBy: { select: { name: true, email: true } }, _count: { select: { recipients: true } } },
    });
    if (!campaign) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ campaign: { ...campaign, deleteForEveryone: await getCampaignDeleteState(id) } });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
