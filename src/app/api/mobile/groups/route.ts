import { requirePermission } from "@/server/auth/permissions";
import { isRecoverableWhatsAppStatus } from "@/lib/whatsapp/account-status-machine";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { logger } from "@/server/observability/logger";
import { requestGroupSyncIfStale, resolveCurrentWhatsAppAccount } from "@/server/whatsapp/account-scope";

export async function GET(request: Request) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "manage_groups");
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const q = url.searchParams.get("q") || undefined;
    const take = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") || 50)));
    const scope = { companyId: company.id, userId: user.id };
    const account = await resolveCurrentWhatsAppAccount(scope);

    if (!account) {
      logger.info("whatsapp.group_listing.mobile", {
        userId: user.id,
        companyId: company.id,
        whatsappAccountId: null,
        returnedGroupCount: 0,
      });
      return mobileSuccess({ groups: [], pageInfo: { nextCursor: null, hasMore: false }, message: "WhatsApp hesabınızı bağlayın" });
    }

    void requestGroupSyncIfStale(scope, account, "mobile-groups");
    const rows = await prisma.whatsAppGroup.findMany({
      where: {
        companyId: company.id,
        userId: user.id,
        accountId: account.id,
        isArchived: false,
        account: { id: account.id, companyId: company.id, userId: user.id, archivedAt: null },
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      select: {
        id: true,
        accountId: true,
        externalGroupId: true,
        name: true,
        description: true,
        participantCount: true,
        canSend: true,
        lastSyncedAt: true,
        updatedAt: true,
        createdAt: true,
        account: { select: { status: true, archivedAt: true, lastError: true } },
        categories: {
          where: { category: { companyId: company.id, archivedAt: null } },
          select: { category: { select: { id: true, name: true, color: true } } },
        },
      },
      orderBy: [{ name: "asc" }, { updatedAt: "desc" }],
      take: 1000,
    });
    const visibleRows = rows
      .filter((group) => isRecoverableWhatsAppStatus(group.account.status, group.account.lastError))
      .map((group) => ({ ...group, canSend: true }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
    const start = cursor ? Math.max(0, visibleRows.findIndex((group) => group.id === cursor) + 1) : 0;
    const groups = visibleRows.slice(start, start + take).map((group) => ({
      id: group.id,
      accountId: group.accountId,
      externalGroupId: group.externalGroupId,
      name: group.name,
      description: group.description,
      participantCount: group.participantCount,
      canSend: group.canSend,
      lastSyncedAt: group.lastSyncedAt,
      updatedAt: group.updatedAt,
      createdAt: group.createdAt,
      categories: group.categories,
    }));
    const hasMore = start + take < visibleRows.length;
    logger.info("whatsapp.group_listing.mobile", {
      userId: user.id,
      companyId: company.id,
      whatsappAccountId: account.id,
      returnedGroupCount: groups.length,
    });
    return mobileSuccess({ groups, pageInfo: { nextCursor: hasMore ? groups.at(-1)?.id : null, hasMore } });
  } catch (error) {
    return mobileSafeError(error);
  }
}
