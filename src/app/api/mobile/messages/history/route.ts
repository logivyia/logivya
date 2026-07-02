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
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const campaigns = await attachDeleteState(rows.slice(0, take));
    return mobileSuccess({ campaigns, pageInfo: { nextCursor: hasMore ? campaigns.at(-1)?.id : null, hasMore } });
  } catch (error) {
    return mobileSafeError(error);
  }
}
