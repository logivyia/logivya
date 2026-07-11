import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { attachDeleteState } from "@/server/messages/delete-for-everyone";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export async function GET(request: Request) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "view_message_history");
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const take = Math.min(50, Math.max(10, Number(url.searchParams.get("limit") || 20)));
    const rows = await prisma.messageCampaign.findMany({
      where: {
        companyId: company.id,
        createdById: user.id,
        deletedAt: null,
        visibilityRecords: { none: { userId: user.id, deletedForMeAt: { not: null } } },
      },
      select: {
        id: true,
        title: true,
        content: true,
        status: true,
        scheduleType: true,
        scheduledAt: true,
        totalRecipients: true,
        sentCount: true,
        failedCount: true,
        canceledCount: true,
        type: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const visibleRows = rows.slice(0, take);
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
    const campaigns = await attachDeleteState(visibleRows.map((campaign) => ({
      ...campaign,
      groupCount: targetCount(campaign.id, "GROUP"),
      contactCount: targetCount(campaign.id, "CONTACT"),
      pendingCount: statusCount(campaign.id, ["PENDING", "QUEUED", "PROCESSING", "SENDING"]),
      retryingCount: statusCount(campaign.id, ["RETRYING"]),
      completedAt: ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(campaign.status) ? campaign.updatedAt : null,
    })));
    return mobileSuccess({ campaigns, pageInfo: { nextCursor: hasMore ? campaigns.at(-1)?.id : null, hasMore } });
  } catch (error) {
    return mobileSafeError(error);
  }
}
