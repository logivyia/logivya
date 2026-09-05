export { POST } from "@/app/api/campaigns/route";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { attachDeleteState } from "@/server/messages/delete-for-everyone";
import { campaignSendSafetyNotices } from "@/server/messages/send-safety-notices";

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
      include: {
        createdBy: { select: { name: true } },
        _count: { select: { recipients: true } },
        recipients: {
          where: { renderedContent: { not: null } },
          orderBy: { renderedAt: "desc" },
          take: 1,
          select: {
            renderedContent: true,
            attributionApplied: true,
            attributionLocale: true,
            effectivePlanCode: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > 50;
    const visibleRows = rows.slice(0, 50);
    const safetyNotices = await campaignSendSafetyNotices(company.id, user.id, visibleRows.map((campaign) => campaign.id));
    const targetCounts = visibleRows.length ? await prisma.messageRecipient.groupBy({
      by: ["campaignId", "targetType", "status"],
      where: { campaignId: { in: visibleRows.map((campaign) => campaign.id) } },
      _count: { _all: true },
    }) : [];
    const targetCount = (campaignId: string, targetType: "GROUP" | "CONTACT") => targetCounts
      .filter((item) => item.campaignId === campaignId && item.targetType === targetType)
      .reduce((total, item) => total + item._count._all, 0);
    const statusCount = (campaignId: string, statuses: string[]) => targetCounts
      .filter((item) => item.campaignId === campaignId && statuses.includes(item.status))
      .reduce((total, item) => total + item._count._all, 0);
    const campaigns = await attachDeleteState(visibleRows.map((row) => {
      const { recipients, ...campaign } = row;
      const rendered = recipients[0] ?? null;
      return {
        ...campaign,
        sendSafetyCode: safetyNotices.get(campaign.id) ?? null,
        originalContent: campaign.content,
        content: rendered?.renderedContent ?? campaign.content,
        brandingApplied: rendered?.attributionApplied === true,
        brandingLocale: rendered?.attributionLocale ?? null,
        brandingPlanCode: rendered?.effectivePlanCode ?? null,
        groupCount: targetCount(campaign.id, "GROUP"),
        contactCount: targetCount(campaign.id, "CONTACT"),
        pendingCount: statusCount(campaign.id, ["PENDING", "QUEUED", "PROCESSING", "SENDING"]),
        retryingCount: statusCount(campaign.id, ["RETRYING"]),
        completedAt: ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(campaign.status) ? campaign.updatedAt : null,
      };
    }));
    return NextResponse.json({ campaigns, nextCursor: hasMore ? rows[49]?.id : null });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
