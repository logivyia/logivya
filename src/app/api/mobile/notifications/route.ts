import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { serializeNotification } from "@/server/notifications/service";

export async function GET(request: Request) {
  try {
    const { company, user } = await requireMobileAuth(request);
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";
    const type = url.searchParams.get("type") || undefined;
    const take = Math.min(50, Math.max(10, Number(url.searchParams.get("limit") || 20)));

    const rows = await prisma.notification.findMany({
      where: {
        companyId: company.id,
        userId: user.id,
        archivedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        ...(unreadOnly ? { isRead: false } : {}),
        ...(type ? { type } : {})
      },
      orderBy: { createdAt: "desc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: take + 1
    });

    const hasMore = rows.length > take;
    const notifications = rows.slice(0, take);
    return mobileSuccess({
      notifications: notifications.map(serializeNotification),
      pageInfo: { nextCursor: hasMore ? notifications.at(-1)?.id ?? null : null, hasMore }
    });
  } catch (error) {
    return mobileSafeError(error, "Bildirimler alınamadı.");
  }
}
