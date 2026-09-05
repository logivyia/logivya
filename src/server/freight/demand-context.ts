import "server-only";

import { prisma } from "@/server/db";

type MarketplaceListingKind = "LOAD" | "VEHICLE" | "DRIVER";

export function demandContextIdFromRequest(request: Request) {
  const values = new URL(request.url).searchParams.getAll("requestId");
  if (values.length === 0) return null;
  if (values.length !== 1) throw new Error("MARKETPLACE_MATCH_NOT_FOUND");
  const value = values[0]?.trim() ?? "";
  if (!value || value.length > 100 || /\p{C}/u.test(value)) {
    throw new Error("MARKETPLACE_MATCH_NOT_FOUND");
  }
  return value;
}

export function requireMarketplaceListingId(value: string) {
  const id = value.trim();
  if (!id || id.length > 100 || /\p{C}/u.test(id)) {
    throw new Error("MARKETPLACE_MATCH_NOT_FOUND");
  }
  return id;
}

export async function validateOwnedDemandContext(
  requestId: string | null | undefined,
  listingKind: MarketplaceListingKind,
  listingId: string,
  ownerUserId: string,
  companyId: string,
) {
  if (!requestId) return null;
  const demand = await prisma.marketplaceDemandRequest.findFirst({
    where: { id: requestId, ownerUserId, companyId },
    select: { id: true },
  });
  if (!demand) throw new Error("MARKETPLACE_REQUEST_NOT_FOUND");
  const match = await prisma.marketplaceDemandMatch.findFirst({
    where: { requestId, listingKind, listingId, status: { not: "DISMISSED" } },
    select: { id: true },
  });
  if (!match) throw new Error("MARKETPLACE_MATCH_NOT_FOUND");
  return demand.id;
}
