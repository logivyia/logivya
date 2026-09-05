import { mobileSuccess } from "@/server/mobile/response";
import { requireTelegramInternalAccess } from "@/server/telegram/access";
import { telegramSafeError } from "@/server/telegram/response";
import { prisma } from "@/server/db";

export async function GET(request: Request) {
  try {
    const { user, company } = await requireTelegramInternalAccess(request);
    const query = new URL(request.url).searchParams;
    const accountId = query.get("accountId") || undefined;
    const search = query.get("search")?.trim().slice(0, 100);
    const chats = await prisma.telegramChat.findMany({
      where: {
        companyId: company.id,
        isActive: true,
        account: { ownerUserId: user.id, archivedAt: null },
        ...(accountId ? { accountId } : {}),
        ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { username: { contains: search, mode: "insensitive" } }] } : {}),
      },
      select: {
        id: true,
        accountId: true,
        title: true,
        username: true,
        type: true,
        participantCount: true,
        canSend: true,
        isActive: true,
        isArchived: true,
        freightPublicationEnabled: true,
        rawPermissions: true,
        lastSyncedAt: true,
        categoryAssignments: { select: { category: { select: { id: true, name: true, color: true } } } },
      },
      orderBy: [{ canSend: "desc" }, { title: "asc" }],
      take: 1000,
    });
    return mobileSuccess({ chats });
  } catch (error) {
    return telegramSafeError(error);
  }
}
