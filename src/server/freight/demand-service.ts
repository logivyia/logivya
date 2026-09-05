import { canReadMarketplaceContact } from "@/server/freight/contact-access";
import { matchContactActions, redactMarketplaceContent } from "@/server/freight/contact-privacy";
import "server-only";

import { Prisma, type MarketplaceRequestStatus } from "@prisma/client";

import { prisma } from "@/server/db";
import type {
  CreateDemandRequestInput,
  DemandMatchListInput,
  DemandRequestListInput,
  UpdateDemandRequestInput,
} from "@/server/freight/demand-validation";
import { normalizeSingleLogisticsLocation } from "@/server/freight/location-normalization";
import { marketplaceScopesForSector } from "@/server/freight/sector-classification";
import { requireMarketplaceScopeFeature, requireMarketplaceSectorFeature } from "@/server/features/product-status";
import {
  normalizeFreightSearchText,
  normalizeFreightText,
  parseFreightDate,
  todayFreightDate,
  type FreightActor,
} from "@/server/freight/service";
import { decryptPrivateValue } from "@/server/security/private-fields";

const requestSelect = {
  id: true,
  companyId: true,
  ownerUserId: true,
  kind: true,
  primarySector: true,
  marketplaceScopes: true,
  sectorCriteria: true,
  title: true,
  keywords: true,
  origin: true,
  destination: true,
  originCountry: true,
  originCity: true,
  originDistrict: true,
  originLocationId: true,
  destinationCountry: true,
  destinationCity: true,
  destinationDistrict: true,
  destinationLocationId: true,
  location: true,
  availableFrom: true,
  availableUntil: true,
  trailerType: true,
  vehicleCategory: true,
  vehicleBodyLength: true,
  requiredPlateCountry: true,
  transitRoute: true,
  cargoType: true,
  minWeight: true,
  maxWeight: true,
  driverListingType: true,
  licenseClasses: true,
  employmentType: true,
  internationalRequired: true,
  adrRequired: true,
  notificationsEnabled: true,
  pausedAt: true,
  status: true,
  expiresAt: true,
  matchCount: true,
  lastMatchedAt: true,
  smartMatchingJobs: {
    select: {
      id: true,
      status: true,
      requestedSources: true,
      completedSources: true,
      groupsProcessed: true,
      messagesAnalyzed: true,
      candidatesDetected: true,
      matchesFound: true,
      duplicatesRemoved: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 1,
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MarketplaceDemandRequestSelect;

type RequestRow = Prisma.MarketplaceDemandRequestGetPayload<{ select: typeof requestSelect }>;

function optionalText(value: string | null | undefined) {
  if (value == null) return null;
  const normalized = normalizeFreightText(value);
  return normalized || null;
}

function dateOnly(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function serializeRequest(row: RequestRow) {
  const effectiveStatus = row.expiresAt <= new Date() && ["ACTIVE", "PAUSED"].includes(row.status)
    ? "EXPIRED"
    : row.status;
  const { smartMatchingJobs, ...request } = row;
  const smartMatching = smartMatchingJobs[0];
  return {
    ...request,
    status: effectiveStatus,
    availableFrom: dateOnly(row.availableFrom),
    availableUntil: dateOnly(row.availableUntil),
    minWeight: row.minWeight == null ? null : Number(row.minWeight),
    maxWeight: row.maxWeight == null ? null : Number(row.maxWeight),
    vehicleBodyLength: row.vehicleBodyLength == null ? null : Number(row.vehicleBodyLength),
    expiresAt: row.expiresAt.toISOString(),
    lastMatchedAt: row.lastMatchedAt?.toISOString() ?? null,
    smartMatching: smartMatching ? {
      ...smartMatching,
      startedAt: smartMatching.startedAt?.toISOString() ?? null,
      completedAt: smartMatching.completedAt?.toISOString() ?? null,
      createdAt: smartMatching.createdAt.toISOString(),
    } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function createData(actor: FreightActor, input: CreateDemandRequestInput): Prisma.MarketplaceDemandRequestUncheckedCreateInput {
  const origin = optionalText(input.originCity ?? input.origin);
  const destination = optionalText(input.destinationCity ?? input.destination);
  const originLocation = normalizeSingleLogisticsLocation(origin);
  const destinationLocation = normalizeSingleLogisticsLocation(destination);
  const location = optionalText(input.location);
  const keywords = [...new Set(input.keywords.map(normalizeFreightText).filter(Boolean))];
  const availableFrom = input.availableFrom ? parseFreightDate(input.availableFrom) : null;
  const availableUntil = input.availableUntil ? parseFreightDate(input.availableUntil) : null;
  if (availableUntil && availableUntil < todayFreightDate()) throw new Error("FREIGHT_LOADING_DATE_PAST");
  if (availableFrom && availableUntil && availableUntil < availableFrom) throw new Error("MARKETPLACE_DATE_RANGE_INVALID");
  return {
    companyId: actor.companyId,
    ownerUserId: actor.userId,
    clientRequestId: input.clientRequestId,
    kind: input.kind,
    primarySector: input.primarySector,
    marketplaceScopes: marketplaceScopesForSector(input.primarySector),
    ...(input.sectorCriteria == null ? {} : { sectorCriteria: input.sectorCriteria as Prisma.InputJsonValue }),
    title: normalizeFreightText(input.title),
    keywords,
    keywordsNormalized: keywords.map(normalizeFreightSearchText),
    origin,
    originNormalized: origin ? normalizeFreightSearchText(origin) : null,
    destination,
    destinationNormalized: destination ? normalizeFreightSearchText(destination) : null,
    originCountry: optionalText(input.originCountry) ?? originLocation?.countryCode ?? null,
    originCity: optionalText(input.originCity) ?? (originLocation?.type === "CITY" || originLocation?.type === "DISTRICT" ? originLocation.canonical : null),
    originDistrict: optionalText(input.originDistrict),
    originLocationId: originLocation ? `${originLocation.countryCode}:${normalizeFreightSearchText(originLocation.canonical)}` : null,
    destinationCountry: optionalText(input.destinationCountry) ?? destinationLocation?.countryCode ?? null,
    destinationCity: optionalText(input.destinationCity) ?? (destinationLocation?.type === "CITY" || destinationLocation?.type === "DISTRICT" ? destinationLocation.canonical : null),
    destinationDistrict: optionalText(input.destinationDistrict),
    destinationLocationId: destinationLocation ? `${destinationLocation.countryCode}:${normalizeFreightSearchText(destinationLocation.canonical)}` : null,
    location,
    locationNormalized: location ? normalizeFreightSearchText(location) : null,
    availableFrom,
    availableUntil,
    trailerType: input.trailerType,
    vehicleCategory: optionalText(input.vehicleCategory),
    vehicleBodyLength: input.vehicleBodyLength == null ? null : new Prisma.Decimal(input.vehicleBodyLength),
    requiredPlateCountry: optionalText(input.requiredPlateCountry),
    transitRoute: optionalText(input.transitRoute),
    cargoType: optionalText(input.cargoType),
    minWeight: input.minWeight == null ? null : new Prisma.Decimal(input.minWeight),
    maxWeight: input.maxWeight == null ? null : new Prisma.Decimal(input.maxWeight),
    driverListingType: input.driverListingType,
    licenseClasses: [...new Set(input.licenseClasses)],
    employmentType: input.employmentType,
    internationalRequired: input.internationalRequired,
    adrRequired: input.adrRequired,
    notificationsEnabled: input.notificationsEnabled,
    expiresAt: new Date(Date.now() + input.expiresInDays * 86_400_000),
    status: "ACTIVE",
  };
}

export async function createDemandRequest(actor: FreightActor, input: CreateDemandRequestInput) {
  await requireMarketplaceSectorFeature(input.primarySector);
  if (input.clientRequestId) {
    const existing = await prisma.marketplaceDemandRequest.findUnique({
      where: { ownerUserId_clientRequestId: { ownerUserId: actor.userId, clientRequestId: input.clientRequestId } },
      select: requestSelect,
    });
    if (existing) return { request: serializeRequest(existing), duplicate: true };
  }
  try {
    const created = await prisma.marketplaceDemandRequest.create({ data: createData(actor, input), select: requestSelect });
    return { request: serializeRequest(created), duplicate: false };
  } catch (error) {
    if (input.clientRequestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.marketplaceDemandRequest.findUnique({
        where: { ownerUserId_clientRequestId: { ownerUserId: actor.userId, clientRequestId: input.clientRequestId } },
        select: requestSelect,
      });
      if (existing) return { request: serializeRequest(existing), duplicate: true };
    }
    throw error;
  }
}

export async function listOwnedDemandRequests(ownerUserId: string, input: DemandRequestListInput) {
  if (input.scope) await requireMarketplaceScopeFeature(input.scope);
  await expireDemandRequests(ownerUserId);
  const rows = await prisma.marketplaceDemandRequest.findMany({
    where: {
      ownerUserId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.scope ? { marketplaceScopes: { has: input.scope } } : {}),
    },
    select: requestSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  return {
    requests: page.map(serializeRequest),
    pageInfo: { hasMore, nextCursor: hasMore ? page.at(-1)?.id ?? null : null },
  };
}

export async function getOwnedDemandRequest(id: string, ownerUserId: string) {
  await expireDemandRequests(ownerUserId);
  const row = await prisma.marketplaceDemandRequest.findFirst({ where: { id, ownerUserId }, select: requestSelect });
  if (!row) throw new Error("MARKETPLACE_REQUEST_NOT_FOUND");
  return serializeRequest(row);
}

const transitions: Record<MarketplaceRequestStatus, readonly MarketplaceRequestStatus[]> = {
  ACTIVE: ["PAUSED", "FULFILLED"],
  PAUSED: ["ACTIVE", "FULFILLED"],
  FULFILLED: [],
  EXPIRED: [],
};

export async function transitionOwnedDemandRequest(id: string, ownerUserId: string, nextStatus: MarketplaceRequestStatus) {
  await expireDemandRequests(ownerUserId);
  const current = await prisma.marketplaceDemandRequest.findFirst({ where: { id, ownerUserId }, select: requestSelect });
  if (!current) throw new Error("MARKETPLACE_REQUEST_NOT_FOUND");
  if (current.status === nextStatus) return serializeRequest(current);
  if (!transitions[current.status].includes(nextStatus)) throw new Error("MARKETPLACE_REQUEST_STATUS_INVALID");
  if (nextStatus === "ACTIVE" && current.expiresAt <= new Date()) throw new Error("MARKETPLACE_REQUEST_EXPIRED");
  const mutation = await prisma.marketplaceDemandRequest.updateMany({
    where: { id, ownerUserId, status: current.status },
    data: { status: nextStatus, pausedAt: nextStatus === "PAUSED" ? new Date() : null },
  });
  if (mutation.count !== 1) throw new Error("MARKETPLACE_REQUEST_STATUS_INVALID");
  const updated = await prisma.marketplaceDemandRequest.findUniqueOrThrow({ where: { id }, select: requestSelect });
  return serializeRequest(updated);
}

export async function updateOwnedDemandNotifications(id: string, ownerUserId: string, notificationsEnabled: boolean) {
  const updated = await prisma.marketplaceDemandRequest.updateMany({
    where: { id, ownerUserId },
    data: { notificationsEnabled },
  });
  if (!updated.count) throw new Error("MARKETPLACE_REQUEST_NOT_FOUND");
  return serializeRequest(await prisma.marketplaceDemandRequest.findUniqueOrThrow({ where: { id }, select: requestSelect }));
}

export async function updateOwnedDemandRequest(actor: FreightActor, id: string, input: UpdateDemandRequestInput) {
  const current = await prisma.marketplaceDemandRequest.findFirst({ where: { id, ownerUserId: actor.userId }, select: { id: true, status: true } });
  if (!current) throw new Error("MARKETPLACE_REQUEST_NOT_FOUND");
  if (current.status === "EXPIRED" || current.status === "FULFILLED") throw new Error("MARKETPLACE_REQUEST_NOT_EDITABLE");
  const { companyId, ownerUserId, clientRequestId, status, ...data } = createData(actor, input);
  if (companyId !== actor.companyId || ownerUserId !== actor.userId || clientRequestId || status !== "ACTIVE") throw new Error("MARKETPLACE_REQUEST_UPDATE_SCOPE_INVALID");
  await prisma.marketplaceDemandRequest.update({ where: { id }, data: { ...data, matchCount: 0, lastMatchedAt: null } });
  await prisma.marketplaceDemandMatch.deleteMany({ where: { requestId: id } });
  return serializeRequest(await prisma.marketplaceDemandRequest.findUniqueOrThrow({ where: { id }, select: requestSelect }));
}

export async function deleteOwnedDemandRequest(id: string, ownerUserId: string) {
  const deleted = await prisma.marketplaceDemandRequest.deleteMany({ where: { id, ownerUserId } });
  if (!deleted.count) throw new Error("MARKETPLACE_REQUEST_NOT_FOUND");
  return { id, deleted: true };
}

export async function listOwnedDemandMatches(id: string, ownerUserId: string, input: DemandMatchListInput) {
  const request = await prisma.marketplaceDemandRequest.findFirst({ where: { id, ownerUserId }, select: { id: true } });
  if (!request) throw new Error("MARKETPLACE_REQUEST_NOT_FOUND");
  const [rows, smartRows] = await Promise.all([
    prisma.marketplaceDemandMatch.findMany({
      where: { requestId: id, status: { not: "DISMISSED" } },
      orderBy: [{ matchedAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    }),
    input.cursor ? Promise.resolve([]) : prisma.smartMatchResult.findMany({
      where: { demandId: id, status: { notIn: ["DISMISSED", "EXPIRED"] } },
      include: { candidate: true },
      orderBy: [{ score: "desc" }, { matchedAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    }),
  ]);
  const listings = await readMatchListings(rows.map((match) => ({ kind: match.listingKind, id: match.listingId })));
  const duplicateKeys = smartRows.map((match) => match.duplicateGroupKey);
  const provenanceRows = duplicateKeys.length ? await prisma.freightOpportunityCandidate.findMany({
    where: { ownerUserId, duplicateKey: { in: duplicateKeys }, expiresAt: { gt: new Date() } },
    select: { duplicateKey: true, sourcePlatform: true, sourceGroupId: true, sourceGroupName: true, sourceMessageId: true, sourceMessageTimestamp: true },
    orderBy: { sourceMessageTimestamp: "desc" },
    take: 250,
  }) : [];
  const provenance = new Map<string, typeof provenanceRows>();
  for (const source of provenanceRows) provenance.set(source.duplicateKey, [...(provenance.get(source.duplicateKey) ?? []), source]);
  const internalMatches = rows.flatMap((match) => {
    const listing = listings.get(`${match.listingKind}:${match.listingId}`);
    return listing ? [{
      id: match.id,
      requestId: match.requestId,
      listingKind: match.listingKind,
      listingId: match.listingId,
      score: match.score,
      reasons: match.reasons,
      status: match.status,
      matchedAt: match.matchedAt.toISOString(),
      sourcePlatform: "LOGIVYA" as const,
      sourceCount: 1,
      provenance: [{ platform: "LOGIVYA" as const, groupName: "Logivya", publishedAt: match.matchedAt.toISOString(), sourceMessageId: null }],
      explanation: match.reasons.map((reason) => ({ code: reason, status: "MATCH" })),
      listing,
    }] : [];
  });
  const externalMatches = smartRows.map((match) => serializeSmartMatch(match, provenance.get(match.duplicateGroupKey) ?? []));
  const merged = [...internalMatches, ...externalMatches]
    .sort((left, right) => right.score - left.score || Date.parse(right.matchedAt) - Date.parse(left.matchedAt));
  const hasMore = rows.length > input.limit || smartRows.length > input.limit || merged.length > input.limit;
  const contactAllowed = await canReadMarketplaceContact(ownerUserId);
  const page = merged.slice(0, input.limit).map((match) => ({ ...redactMarketplaceContent(match, contactAllowed), listing: { ...redactMarketplaceContent(match.listing, contactAllowed), ...matchContactActions(match.listing, contactAllowed) } }));
  return {
    matches: page,
    pageInfo: { hasMore, nextCursor: hasMore ? rows.slice(0, input.limit).at(-1)?.id ?? null : null },
  };
}

export async function markOwnedDemandMatchesViewed(id: string, ownerUserId: string) {
  const request = await prisma.marketplaceDemandRequest.findFirst({ where: { id, ownerUserId }, select: { id: true } });
  if (!request) throw new Error("MARKETPLACE_REQUEST_NOT_FOUND");
  const viewedAt = new Date();
  const [marketplaceUpdated, smartUpdated] = await prisma.$transaction([
    prisma.marketplaceDemandMatch.updateMany({
      where: { requestId: id, status: "NEW" },
      data: { status: "VIEWED", viewedAt },
    }),
    prisma.smartMatchResult.updateMany({
      where: { demandId: id, status: "NEW" },
      data: { status: "VIEWED", viewedAt },
    }),
  ]);
  return { updatedCount: marketplaceUpdated.count + smartUpdated.count, viewedAt: viewedAt.toISOString() };
}

export async function transitionOwnedDemandMatch(
  requestId: string,
  matchId: string,
  ownerUserId: string,
  status: "SAVED" | "DISMISSED",
) {
  const request = await prisma.marketplaceDemandRequest.findFirst({ where: { id: requestId, ownerUserId }, select: { id: true } });
  if (!request) throw new Error("MARKETPLACE_REQUEST_NOT_FOUND");
  const smart = await prisma.smartMatchResult.findFirst({ where: { id: matchId, demandId: requestId, ownerUserId }, select: { id: true } });
  const now = new Date();
  if (smart) {
    return prisma.smartMatchResult.update({
      where: { id: smart.id },
      data: {
        status,
        savedAt: status === "SAVED" ? now : null,
        dismissedAt: status === "DISMISSED" ? now : null,
      },
      select: { id: true, status: true, savedAt: true, dismissedAt: true },
    });
  }
  if (status === "SAVED") throw new Error("SMART_MATCH_RESULT_NOT_FOUND");
  const updated = await prisma.marketplaceDemandMatch.updateMany({
    where: { id: matchId, requestId },
    data: { status: "DISMISSED", dismissedAt: now },
  });
  if (!updated.count) throw new Error("SMART_MATCH_RESULT_NOT_FOUND");
  return { id: matchId, status: "DISMISSED" as const, savedAt: null, dismissedAt: now };
}

function serializeSmartMatch(
  match: Prisma.SmartMatchResultGetPayload<{ include: { candidate: true } }>,
  sources: Array<{ sourcePlatform: "LOGIVYA" | "WHATSAPP" | "TELEGRAM"; sourceGroupId: string; sourceGroupName: string; sourceMessageId: string; sourceMessageTimestamp: Date }>,
) {
  const candidate = match.candidate;
  const contactPhone = decryptOptional(candidate.advertisedBusinessContactEncrypted);
  const sourceExcerpt = decryptOptional(candidate.sourceTextEncrypted);
  const title = candidate.candidateType === "DRIVER"
    ? candidate.origin ?? candidate.companyName ?? "Şoför fırsatı"
    : `${candidate.origin ?? "?"} → ${candidate.destination ?? "?"}`;
  const details = [
    candidate.weight == null ? null : `${Number(candidate.weight)} t`,
    candidate.trailerType,
    candidate.cargoType,
  ].filter(Boolean);
  return {
    id: match.id,
    requestId: match.demandId,
    listingKind: candidate.candidateType,
    listingId: candidate.id,
    score: match.score,
    reasons: Array.isArray(match.explanation)
      ? match.explanation.flatMap((item) => item && typeof item === "object" && "code" in item ? [String(item.code)] : [])
      : [],
    status: match.status,
    matchedAt: match.matchedAt.toISOString(),
    sourcePlatform: match.sourcePlatform,
    sourceCount: match.sourceCount,
    provenance: sources.slice(0, 10).map((source) => ({
      platform: source.sourcePlatform,
      groupName: source.sourcePlatform === "LOGIVYA" ? "Logivya" : source.sourcePlatform === "WHATSAPP" ? "WhatsApp" : "Telegram",
      publishedAt: source.sourceMessageTimestamp.toISOString(),
    })),
    explanation: match.explanation,
    listing: {
      id: candidate.id,
      kind: candidate.candidateType,
      title,
      detail: details.join(" · ") || sourceExcerpt?.slice(0, 240) || "Ayrıntı belirtilmemiş",
      sourceExcerpt,
      contactType: contactPhone?.startsWith("@") ? "TELEGRAM" : contactPhone ? "PHONE" : null,
      date: dateOnly(candidate.loadingDate),
      companyName: candidate.companyName ?? (candidate.sourcePlatform === "WHATSAPP" ? "WhatsApp" : candidate.sourcePlatform === "TELEGRAM" ? "Telegram" : "Logivya"),
      contactPhone,
      status: candidate.expiresAt > new Date() ? "ACTIVE" : "INACTIVE",
    },
  };
}

function decryptOptional(value: string | null) {
  if (!value) return null;
  try {
    return decryptPrivateValue(value);
  } catch {
    return null;
  }
}

async function expireDemandRequests(ownerUserId: string) {
  await prisma.marketplaceDemandRequest.updateMany({
    where: { ownerUserId, status: { in: ["ACTIVE", "PAUSED"] }, expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED" },
  });
}

async function readMatchListings(keys: Array<{ kind: "LOAD" | "VEHICLE" | "DRIVER"; id: string }>) {
  const loadIds = keys.filter((key) => key.kind === "LOAD").map((key) => key.id);
  const vehicleIds = keys.filter((key) => key.kind === "VEHICLE").map((key) => key.id);
  const driverIds = keys.filter((key) => key.kind === "DRIVER").map((key) => key.id);
  const [loads, vehicles, drivers] = await Promise.all([
    prisma.freightListing.findMany({ where: { id: { in: loadIds } }, include: { company: { select: { name: true } } } }),
    prisma.vehicleListing.findMany({ where: { id: { in: vehicleIds } }, include: { company: { select: { name: true } } } }),
    prisma.driverListing.findMany({ where: { id: { in: driverIds } }, include: { company: { select: { name: true } } } }),
  ]);
  const result = new Map<string, Record<string, unknown>>();
  for (const row of loads) result.set(`LOAD:${row.id}`, {
    id: row.id, kind: "LOAD", title: `${row.origin} → ${row.destination}`,
    detail: `${row.weight == null ? "Ağırlık belirtilmedi" : `${Number(row.weight)} t`} · ${row.trailerType}`, date: dateOnly(row.loadingDate),
    companyName: row.company.name, contactPhone: row.contactPhone, contactType: "PHONE", status: row.status,
  });
  for (const row of vehicles) result.set(`VEHICLE:${row.id}`, {
    id: row.id, kind: "VEHICLE", title: `${row.origin}${row.destination ? ` → ${row.destination}` : ""}`,
    detail: `${row.trailerType}${row.capacityWeight ? ` · ${Number(row.capacityWeight)} t` : ""}`,
    date: dateOnly(row.availableFrom), companyName: row.company.name, contactPhone: row.contactPhone, contactType: "PHONE", status: row.status,
  });
  for (const row of drivers) result.set(`DRIVER:${row.id}`, {
    id: row.id, kind: "DRIVER", title: row.title,
    detail: `${row.location} · ${row.licenseClasses.join(", ")}`, date: dateOnly(row.availableFrom),
    companyName: row.company.name, contactPhone: row.contactPhone, contactType: "PHONE", status: row.status,
  });
  return result;
}
