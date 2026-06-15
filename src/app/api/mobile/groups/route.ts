import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export async function GET(request: Request) {
  try {
    const { company, membership } = await requireMobileAuth(request);
    requirePermission(membership.role, "manage_groups");
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const q = url.searchParams.get("q") || undefined;
    const take = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") || 50)));
    const rows = await prisma.whatsAppGroup.findMany({
      where: { companyId: company.id, isArchived: false, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
      select: { id: true, accountId: true, name: true, description: true, participantCount: true, canSend: true, lastSyncedAt: true, categories: { select: { category: { select: { id: true, name: true, color: true } } } } },
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const groups = rows.slice(0, take);
    return mobileSuccess({ groups, pageInfo: { nextCursor: hasMore ? groups.at(-1)?.id : null, hasMore } });
  } catch (error) {
    return mobileSafeError(error);
  }
}
