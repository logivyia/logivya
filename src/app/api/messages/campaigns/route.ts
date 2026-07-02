export { POST } from "@/app/api/campaigns/route";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { attachDeleteState } from "@/server/messages/delete-for-everyone";

export async function GET(request: Request) {
  try {
    const { company, user } = await requireApiSession();
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const showDeleted = url.searchParams.get("showDeleted") === "true";
    const status = url.searchParams.get("status");
    const rows = await prisma.messageCampaign.findMany({
      where: {
        companyId: company.id,
        createdById: user.id,
        visibilityRecords: { none: { userId: user.id, deletedForMeAt: { not: null } } },
        ...(!showDeleted ? { deletedAt: null } : {}),
        ...(status ? { status: status as never } : {}),
      },
      include: { createdBy: { select: { name: true } }, _count: { select: { recipients: true } } },
      orderBy: { createdAt: "desc" },
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > 50;
    const campaigns = await attachDeleteState(rows.slice(0, 50));
    return NextResponse.json({ campaigns, nextCursor: hasMore ? rows[49]?.id : null });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
