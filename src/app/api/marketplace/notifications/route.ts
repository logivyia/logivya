import { NextResponse } from "next/server";

import { prisma } from "@/server/db";
import {
  boundedWebLimit,
  marketplaceSegmentFromKind,
  requireWebMarketplaceAccess,
  type WebMarketplaceKind,
  webListingHref,
  webMarketplaceError,
} from "@/server/freight/web-marketplace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await requireWebMarketplaceAccess();
    const url = new URL(request.url);
    const limit = Math.min(50, boundedWebLimit(url.searchParams.get("limit"), 20));
    const now = new Date();
    const rows = await prisma.notification.findMany({
      where: {
        companyId: context.company.id,
        userId: context.user.id,
        category: "MARKETPLACE",
        archivedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        title: true,
        message: true,
        payload: true,
        isRead: true,
        createdAt: true,
        event: { select: { payload: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    const candidates = rows.map((row) => ({ row, context: notificationContext(row.payload ?? row.event?.payload) }));
    const requestIds = [...new Set(candidates.map((item) => item.context?.requestId).filter((id): id is string => Boolean(id)))];
    const ownedDemands = requestIds.length ? await prisma.marketplaceDemandRequest.findMany({
      where: { id: { in: requestIds }, ownerUserId: context.user.id, companyId: context.company.id },
      select: { id: true },
    }) : [];
    const ownedDemandIds = new Set(ownedDemands.map((item) => item.id));
    const matches = requestIds.length ? await prisma.marketplaceDemandMatch.findMany({
      where: { requestId: { in: requestIds }, status: { not: "DISMISSED" } },
      select: { requestId: true, listingKind: true, listingId: true },
    }) : [];
    const matchKeys = new Set(matches.map((item) => `${item.requestId}:${item.listingKind}:${item.listingId}`));
    const notifications = candidates.map(({ row, context: itemContext }) => {
      const validContext = itemContext
        && ownedDemandIds.has(itemContext.requestId)
        && matchKeys.has(`${itemContext.requestId}:${itemContext.listingKind}:${itemContext.listingId}`)
        ? itemContext
        : null;
      return {
        id: row.id,
        title: row.title,
        message: row.message,
        isRead: row.isRead,
        createdAt: row.createdAt.toISOString(),
        listingKind: validContext?.listingKind ?? null,
        requestId: validContext?.requestId ?? null,
        href: validContext
          ? webListingHref(marketplaceSegmentFromKind(validContext.listingKind), validContext.listingId, validContext.requestId)
          : null,
      };
    });
    return NextResponse.json({ notifications }, {
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
  } catch (error) {
    return webMarketplaceError(error);
  }
}

function notificationContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const requestId = typeof payload.requestId === "string" ? payload.requestId : null;
  const listingId = typeof payload.listingId === "string" ? payload.listingId : null;
  const listingKind = payload.listingKind === "LOAD" || payload.listingKind === "VEHICLE" || payload.listingKind === "DRIVER"
    ? payload.listingKind as WebMarketplaceKind
    : null;
  if (!requestId || !listingId || !listingKind || requestId.length > 100 || listingId.length > 100) return null;
  return { requestId, listingId, listingKind };
}
