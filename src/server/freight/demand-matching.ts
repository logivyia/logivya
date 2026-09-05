import { Prisma, type MarketplaceRequestKind, type MarketplaceScope } from "@prisma/client";

import { translateForLocale } from "@/i18n/server";
import { prisma } from "@/server/db";
import { buildPublicListingSummary } from "@/server/freight/public-listing-summary";
import { readPublicSourceMetadata } from "@/server/freight/public-source-metadata";
import { emitNotificationEvent } from "@/server/notifications/engine";
import { logger } from "@/server/observability/logger";
import { specializedMarketplaceScope } from "@/server/freight/sector-classification";

export const MARKETPLACE_MATCH_EVENT = "marketplace.request_match_found";

function normalizeMatchSearchText(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("tr-TR");
}

function todayMatchDate(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const demandMatchSelect = {
  id: true,
  kind: true,
  primarySector: true,
  marketplaceScopes: true,
  title: true,
  keywordsNormalized: true,
  originNormalized: true,
  destinationNormalized: true,
  locationNormalized: true,
  availableFrom: true,
  availableUntil: true,
  trailerType: true,
  minWeight: true,
  maxWeight: true,
  driverListingType: true,
  licenseClasses: true,
  employmentType: true,
  internationalRequired: true,
  adrRequired: true,
  notificationsEnabled: true,
  status: true,
  ownerUserId: true,
  companyId: true,
  expiresAt: true,
} satisfies Prisma.MarketplaceDemandRequestSelect;

type Demand = Prisma.MarketplaceDemandRequestGetPayload<{ select: typeof demandMatchSelect }>;

type MatchCandidate = {
  kind: MarketplaceRequestKind;
  id: string;
  ownerUserId: string;
  searchText: string;
  originNormalized?: string | null;
  destinationNormalized?: string | null;
  locationNormalized?: string | null;
  dateFrom: Date;
  dateUntil?: Date | null;
  trailerType?: Demand["trailerType"];
  weight?: number | null;
  driverListingType?: Demand["driverListingType"];
  licenseClasses?: string[];
  employmentType?: Demand["employmentType"];
  international?: boolean;
  adr?: boolean;
  marketplaceScopes: MarketplaceScope[];
};

type MatchResult = { score: number; reasons: string[] };

export async function matchListingAgainstDemandRequests(kind: MarketplaceRequestKind, listingId: string) {
  const candidate = await readListingCandidate(kind, listingId);
  if (!candidate) return { matched: 0, notified: 0 };
  const requests = await readActiveRequests(kind);
  let matched = 0;
  let notified = 0;
  for (const request of requests) {
    if (request.ownerUserId === candidate.ownerUserId) continue;
    const result = calculateMatch(request, candidate);
    if (!result) continue;
    const persisted = await persistMatch(request, candidate, result);
    if (persisted.created) matched += 1;
    if (request.notificationsEnabled && await dispatchMarketplaceMatchNotification(persisted.matchId).catch((error) => {
      logger.error("marketplace.match_notification_failed", error, { matchId: persisted.matchId, requestId: request.id });
      return false;
    })) notified += 1;
  }
  return { matched, notified };
}

export async function matchDemandRequestAgainstExistingListings(
  requestId: string,
  options: { notify?: boolean } = {},
) {
  const request = await prisma.marketplaceDemandRequest.findUnique({ where: { id: requestId }, select: demandMatchSelect });
  if (!request || request.expiresAt <= new Date()) return { matched: 0, notified: 0 };
  const candidates = await readExistingCandidates(request.kind);
  let matched = 0;
  let notified = 0;
  for (const candidate of candidates) {
    if (candidate.ownerUserId === request.ownerUserId) continue;
    const result = calculateMatch(request, candidate);
    if (!result) continue;
    const persisted = await persistMatch(request, candidate, result);
    if (persisted.created) matched += 1;
    if (request.notificationsEnabled && options.notify !== false && await dispatchMarketplaceMatchNotification(persisted.matchId).catch((error) => {
      logger.error("marketplace.initial_match_notification_failed", error, { matchId: persisted.matchId, requestId });
      return false;
    })) notified += 1;
  }
  return { matched, notified };
}

export async function matchDemandRequestAgainstListing(
  requestId: string,
  kind: MarketplaceRequestKind,
  listingId: string,
) {
  const [request, candidate] = await Promise.all([
    prisma.marketplaceDemandRequest.findUnique({ where: { id: requestId }, select: demandMatchSelect }),
    readListingCandidate(kind, listingId),
  ]);
  if (!request || request.kind !== kind || request.status !== "ACTIVE" || request.expiresAt <= new Date() || !candidate) {
    return { matched: 0, notified: 0 };
  }
  if (request.ownerUserId === candidate.ownerUserId) return { matched: 0, notified: 0 };
  const result = calculateMatch(request, candidate);
  if (!result) return { matched: 0, notified: 0 };
  const persisted = await persistMatch(request, candidate, result);
  const notified = request.notificationsEnabled
    && await dispatchMarketplaceMatchNotification(persisted.matchId).catch((error) => {
      logger.error("marketplace.listing_job_notification_failed", error, { matchId: persisted.matchId, requestId });
      return false;
    });
  return { matched: persisted.created ? 1 : 0, notified: notified ? 1 : 0 };
}

export async function processPendingMarketplaceMatchNotifications(limit = 50) {
  const pending = await prisma.marketplaceDemandMatch.findMany({
    where: {
      notifiedAt: null,
      request: { status: "ACTIVE", notificationsEnabled: true, expiresAt: { gt: new Date() } },
    },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: Math.min(100, Math.max(1, limit)),
  });
  let dispatched = 0;
  for (const row of pending) {
    if (await dispatchMarketplaceMatchNotification(row.id).catch((error) => {
      logger.error("marketplace.pending_match_notification_failed", error, { matchId: row.id });
      return false;
    })) dispatched += 1;
  }
  return { claimed: pending.length, dispatched };
}

export async function dispatchMarketplaceMatchNotification(matchId: string) {
  const match = await prisma.marketplaceDemandMatch.findUnique({
    where: { id: matchId },
    include: {
      request: {
        include: { owner: { select: { locale: true } } },
      },
    },
  });
  if (!match || match.notifiedAt) return false;
  if (match.request.status !== "ACTIVE" || !match.request.notificationsEnabled || match.request.expiresAt <= new Date()) return false;

  const listingSummary = await readCanonicalListingSummary(match.listingKind, match.listingId);
  if (!listingSummary) return false;

  const [title, message] = await Promise.all([
    translateForLocale(match.request.owner.locale, "notification.title.marketplace.request_match_found"),
    translateForLocale(
      match.request.owner.locale,
      `notification.message.marketplace.request_match_found.${match.listingKind}`,
      { listingSummary },
    ),
  ]);
  const result = await emitNotificationEvent({
    type: MARKETPLACE_MATCH_EVENT,
    idempotencyKey: `marketplace-demand-match:${match.id}`,
    recipients: [{ companyId: match.request.companyId, userId: match.request.ownerUserId }],
    companyId: match.request.companyId,
    content: { title, message },
    payload: {
      type: MARKETPLACE_MATCH_EVENT,
      requestId: match.requestId,
      listingSummary,
      matchId: match.id,
      listingKind: match.listingKind,
      listingId: match.listingId,
    },
    priority: "HIGH",
    channels: ["IN_APP", "ANDROID_PUSH", "IOS_PUSH", "WEB_PUSH"],
    collapseKey: `marketplace-request-match:${match.requestId}`,
    correlationId: match.requestId,
    deepLink: listingDeepLink(match.listingKind, match.listingId, match.requestId),
    expiresAt: match.request.expiresAt,
  });
  await prisma.marketplaceDemandMatch.update({
    where: { id: match.id },
    data: { notifiedAt: new Date(), notificationEventId: result.event.id },
  });
  return true;
}

export function calculateMatch(request: Demand, listing: MatchCandidate): MatchResult | null {
  if (request.kind !== listing.kind) return null;
  const requestedSectorScope = specializedMarketplaceScope(request.primarySector);
  if (requestedSectorScope && !listing.marketplaceScopes.includes(requestedSectorScope)) return null;
  const reasons: string[] = [];
  let score = 55;
  if (requestedSectorScope) {
    reasons.push("SECTOR");
    score += 10;
  }
  const requireText = (criterion: string | null, candidate: string | null | undefined, reason: string) => {
    if (!criterion) return true;
    if (!candidate || !textMatches(criterion, candidate)) return false;
    reasons.push(reason);
    score += 7;
    return true;
  };

  if (!requireText(request.originNormalized, listing.originNormalized, "ORIGIN")) return null;
  if (!requireText(request.destinationNormalized, listing.destinationNormalized, "DESTINATION")) return null;
  if (!requireText(request.locationNormalized, listing.locationNormalized, "LOCATION")) return null;
  if (request.availableFrom && listing.dateUntil && listing.dateUntil < request.availableFrom) return null;
  if (request.availableUntil && listing.dateFrom > request.availableUntil) return null;
  if (request.availableFrom || request.availableUntil) { reasons.push("DATE"); score += 6; }
  if (request.trailerType && request.trailerType !== listing.trailerType) return null;
  if (request.trailerType) { reasons.push("TRAILER_TYPE"); score += 7; }
  if (request.minWeight != null && (listing.weight == null || listing.weight < Number(request.minWeight))) return null;
  if (request.maxWeight != null && (listing.weight == null || listing.weight > Number(request.maxWeight))) return null;
  if (request.minWeight != null || request.maxWeight != null) { reasons.push("WEIGHT"); score += 6; }
  if (request.driverListingType && request.driverListingType !== listing.driverListingType) return null;
  if (request.driverListingType) { reasons.push("DRIVER_LISTING_TYPE"); score += 7; }
  if (request.licenseClasses.length && !request.licenseClasses.every((item) => listing.licenseClasses?.includes(item))) return null;
  if (request.licenseClasses.length) { reasons.push("LICENSE_CLASS"); score += 7; }
  if (request.employmentType && request.employmentType !== listing.employmentType) return null;
  if (request.employmentType) { reasons.push("EMPLOYMENT_TYPE"); score += 6; }
  if (request.internationalRequired && !listing.international) return null;
  if (request.internationalRequired) { reasons.push("INTERNATIONAL"); score += 6; }
  if (request.adrRequired && !listing.adr) return null;
  if (request.adrRequired) { reasons.push("ADR"); score += 6; }
  if (request.keywordsNormalized.length && !request.keywordsNormalized.some((keyword) => textMatches(keyword, listing.searchText))) return null;
  if (request.keywordsNormalized.length) { reasons.push("KEYWORDS"); score += 6; }
  return { score: Math.min(100, score), reasons };
}

async function persistMatch(request: Demand, listing: MatchCandidate, result: MatchResult) {
  try {
    const created = await prisma.$transaction(async (tx) => {
      const match = await tx.marketplaceDemandMatch.create({
        data: {
          requestId: request.id,
          listingKind: listing.kind,
          listingId: listing.id,
          listingOwnerUserId: listing.ownerUserId,
          score: result.score,
          reasons: result.reasons,
        },
        select: { id: true },
      });
      await tx.marketplaceDemandRequest.update({
        where: { id: request.id },
        data: { matchCount: { increment: 1 }, lastMatchedAt: new Date() },
      });
      return match;
    });
    return { matchId: created.id, created: true };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const existing = await prisma.marketplaceDemandMatch.findUniqueOrThrow({
      where: { requestId_listingKind_listingId: { requestId: request.id, listingKind: listing.kind, listingId: listing.id } },
      select: { id: true },
    });
    return { matchId: existing.id, created: false };
  }
}

async function readActiveRequests(kind: MarketplaceRequestKind) {
  const rows: Demand[] = [];
  let cursor: string | undefined;
  do {
    const page = await prisma.marketplaceDemandRequest.findMany({
      where: { kind, status: "ACTIVE", expiresAt: { gt: new Date() } },
      select: demandMatchSelect,
      orderBy: { id: "asc" },
      take: 251,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    rows.push(...page.slice(0, 250));
    cursor = page.length > 250 ? page[249]?.id : undefined;
  } while (cursor && rows.length < 5_000);
  return rows;
}

async function readExistingCandidates(kind: MarketplaceRequestKind): Promise<MatchCandidate[]> {
  if (kind === "LOAD") {
    const rows = await prisma.freightListing.findMany({
      where: { status: "ACTIVE", loadingDate: { gte: todayMatchDate() } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 250,
    });
    return rows.map((row) => loadCandidate(row));
  }
  if (kind === "VEHICLE") {
    const rows = await prisma.vehicleListing.findMany({
      where: { status: "ACTIVE", OR: [{ availableUntil: null }, { availableUntil: { gte: todayMatchDate() } }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 250,
    });
    return rows.map((row) => vehicleCandidate(row));
  }
  const rows = await prisma.driverListing.findMany({
    where: { status: "ACTIVE" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 250,
  });
  return rows.map((row) => driverCandidate(row));
}

async function readListingCandidate(kind: MarketplaceRequestKind, id: string): Promise<MatchCandidate | null> {
  if (kind === "LOAD") {
    const row = await prisma.freightListing.findFirst({ where: { id, status: "ACTIVE" } });
    return row ? loadCandidate(row) : null;
  }
  if (kind === "VEHICLE") {
    const row = await prisma.vehicleListing.findFirst({ where: { id, status: "ACTIVE" } });
    return row ? vehicleCandidate(row) : null;
  }
  const row = await prisma.driverListing.findFirst({ where: { id, status: "ACTIVE" } });
  return row ? driverCandidate(row) : null;
}

function loadCandidate(row: Awaited<ReturnType<typeof prisma.freightListing.findFirst>> & {}) {
  return {
    kind: "LOAD" as const,
    id: row.id,
    ownerUserId: row.ownerUserId,
    searchText: normalizeMatchSearchText([row.origin, row.destination, row.cargoType, row.description, row.trailerType].filter(Boolean).join(" ")),
    originNormalized: row.originNormalized,
    destinationNormalized: row.destinationNormalized,
    dateFrom: row.loadingDate,
    dateUntil: row.loadingDate,
    trailerType: row.trailerType,
    weight: row.weight == null ? null : Number(row.weight),
    marketplaceScopes: row.marketplaceScopes,
  };
}

function vehicleCandidate(row: Awaited<ReturnType<typeof prisma.vehicleListing.findFirst>> & {}) {
  return {
    kind: "VEHICLE" as const,
    id: row.id,
    ownerUserId: row.ownerUserId,
    searchText: normalizeMatchSearchText([row.origin, row.destination, row.description, row.trailerType].filter(Boolean).join(" ")),
    originNormalized: row.originNormalized,
    destinationNormalized: row.destinationNormalized,
    dateFrom: row.availableFrom,
    dateUntil: row.availableUntil,
    trailerType: row.trailerType,
    weight: row.capacityWeight == null ? null : Number(row.capacityWeight),
    international: row.internationalTransport,
    adr: row.adrSuitable,
    marketplaceScopes: row.marketplaceScopes,
  };
}

function driverCandidate(row: Awaited<ReturnType<typeof prisma.driverListing.findFirst>> & {}) {
  return {
    kind: "DRIVER" as const,
    id: row.id,
    ownerUserId: row.ownerUserId,
    searchText: normalizeMatchSearchText([row.title, row.location, row.preferredRoute, row.description, ...row.licenseClasses].filter(Boolean).join(" ")),
    locationNormalized: row.locationNormalized,
    dateFrom: row.availableFrom,
    dateUntil: null,
    driverListingType: row.listingType,
    licenseClasses: row.licenseClasses,
    employmentType: row.employmentType,
    international: row.internationalExperience,
    adr: row.adrCertificate,
    marketplaceScopes: row.marketplaceScopes,
  };
}

function textMatches(criterion: string, candidate: string) {
  const tokens = criterion.split(/\s+/u).filter((token) => token.length >= 2);
  return tokens.length > 0 && tokens.every((token) => candidate.includes(token));
}

function listingDeepLink(kind: MarketplaceRequestKind, listingId: string, requestId: string) {
  const segment = kind === "LOAD" ? "loads" : kind === "VEHICLE" ? "vehicles" : "drivers";
  return `logivya://marketplace/${segment}/${listingId}?requestId=${encodeURIComponent(requestId)}`;
}

async function readCanonicalListingSummary(kind: MarketplaceRequestKind, listingId: string) {
  if (kind === "LOAD") {
    const row = await prisma.freightListing.findFirst({
      where: { id: listingId, status: "ACTIVE" },
      include: { company: { select: { name: true } } },
    });
    if (!row) return null;
    const metadata = row.sourceExtractionId
      ? (await readPublicSourceMetadata([row.sourceExtractionId])).get(row.sourceExtractionId)
      : null;
    return buildPublicListingSummary({
      id: row.id,
      kind,
      source: row.source,
      companyName: row.company.name,
      explicitCompanyName: metadata?.explicitCompanyName,
      explicitAdvertiserName: metadata?.explicitAdvertiserName,
      description: row.description ?? row.cargoType,
      origin: row.origin,
      destination: row.destination,
      trailerType: row.trailerType,
      tonnage: row.weight == null ? null : Number(row.weight),
      vehicleCount: row.vehicleCount,
    }).listingSummary;
  }
  if (kind === "VEHICLE") {
    const row = await prisma.vehicleListing.findFirst({
      where: { id: listingId, status: "ACTIVE" },
      include: { company: { select: { name: true } } },
    });
    if (!row) return null;
    const metadata = row.sourceExtractionId
      ? (await readPublicSourceMetadata([row.sourceExtractionId])).get(row.sourceExtractionId)
      : null;
    return buildPublicListingSummary({
      id: row.id,
      kind,
      source: row.source,
      companyName: row.company.name,
      explicitCompanyName: metadata?.explicitCompanyName,
      explicitAdvertiserName: metadata?.explicitAdvertiserName,
      description: row.description,
      origin: row.origin,
      destination: row.destination,
      trailerType: row.trailerType,
      tonnage: row.capacityWeight == null ? null : Number(row.capacityWeight),
      vehicleCount: row.vehicleCount,
    }).listingSummary;
  }
  const row = await prisma.driverListing.findFirst({
    where: { id: listingId, status: "ACTIVE" },
    include: { company: { select: { name: true } } },
  });
  if (!row) return null;
  const metadata = row.sourceExtractionId
    ? (await readPublicSourceMetadata([row.sourceExtractionId])).get(row.sourceExtractionId)
    : null;
  return buildPublicListingSummary({
    id: row.id,
    kind,
    source: row.source,
    companyName: row.company.name,
    explicitCompanyName: metadata?.explicitCompanyName,
    explicitAdvertiserName: metadata?.explicitAdvertiserName,
    title: row.title,
    description: row.description ?? row.preferredRoute,
    origin: row.location,
  }).listingSummary;
}
