import "server-only";

import { prisma } from "@/server/db";
import type { MarketplaceScope } from "@prisma/client";
import { buildPublicListingSummary, type PublicListingSummary } from "@/server/freight/public-listing-summary";
import { readPublicSourceMetadata } from "@/server/freight/public-source-metadata";

export type LiveMarketplaceEvent = {
  event: "listing.created" | "listing.updated" | "listing.expired" | "listing.deleted" | "listing.matched";
  cursor: string;
  match?: { demandId: string };
  listing: {
    id: string;
    kind: "LOAD" | "VEHICLE" | "DRIVER";
    source: "LOGIVYA" | "WHATSAPP" | "TELEGRAM";
    sourceLabel: "LOGIVYA" | "WhatsApp" | "Telegram";
    eventVersion: 1;
    companyName: string;
    title: string;
    description: string | null;
    origin: string | null;
    destination: string | null;
    trailerType: string | null;
    vehicleBodyLength: number | null;
    tonnage: number | null;
    relevantDate: string | null;
    status: string;
    publishedAt: string;
    updatedAt: string;
  } & PublicListingSummary;
};

export async function readLiveMarketplaceEvents(
  after: Date,
  limit = 100,
  requesterUserId?: string,
  includeActiveSnapshot = false,
  scope: MarketplaceScope = "GLOBAL",
): Promise<LiveMarketplaceEvent[]> {
  const take = Math.min(200, Math.max(1, limit));
  const matches = requesterUserId ? await prisma.marketplaceDemandMatch.findMany({
    where: { matchedAt: { gt: after }, request: { ownerUserId: requesterUserId } },
    select: { id: true, requestId: true, listingKind: true, listingId: true, matchedAt: true },
    orderBy: [{ matchedAt: "asc" }, { id: "asc" }],
    take,
  }) : [];
  const matchedLoadIds = matches.filter((item) => item.listingKind === "LOAD").map((item) => item.listingId);
  const matchedVehicleIds = matches.filter((item) => item.listingKind === "VEHICLE").map((item) => item.listingId);
  const matchedDriverIds = matches.filter((item) => item.listingKind === "DRIVER").map((item) => item.listingId);
  const [loads, vehicles, drivers] = await Promise.all([
    prisma.freightListing.findMany({
      where: includeActiveSnapshot
        ? { status: "ACTIVE", marketplaceScopes: { has: scope }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }
        : { marketplaceScopes: { has: scope }, OR: [{ updatedAt: { gt: after } }, ...(matchedLoadIds.length ? [{ id: { in: matchedLoadIds } }] : [])] },
      select: {
        id: true, source: true, sourceExtractionId: true, origin: true, destination: true, cargoType: true, description: true, trailerType: true,
        weight: true, loadingDate: true, status: true, publishedAt: true, deactivatedAt: true, updatedAt: true,
        company: { select: { name: true } },
      },
      orderBy: includeActiveSnapshot ? [{ updatedAt: "desc" }, { id: "desc" }] : [{ updatedAt: "asc" }, { id: "asc" }], take,
    }),
    prisma.vehicleListing.findMany({
      where: includeActiveSnapshot
        ? { status: "ACTIVE", marketplaceScopes: { has: scope }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }
        : { marketplaceScopes: { has: scope }, OR: [{ updatedAt: { gt: after } }, ...(matchedVehicleIds.length ? [{ id: { in: matchedVehicleIds } }] : [])] },
      select: {
        id: true, source: true, sourceExtractionId: true, origin: true, destination: true, description: true, trailerType: true, capacityWeight: true,
        availableFrom: true, status: true, publishedAt: true, deactivatedAt: true, updatedAt: true, company: { select: { name: true } },
      },
      orderBy: includeActiveSnapshot ? [{ updatedAt: "desc" }, { id: "desc" }] : [{ updatedAt: "asc" }, { id: "asc" }], take,
    }),
    prisma.driverListing.findMany({
      where: includeActiveSnapshot
        ? { status: "ACTIVE", marketplaceScopes: { has: scope }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }
        : { marketplaceScopes: { has: scope }, OR: [{ updatedAt: { gt: after } }, ...(matchedDriverIds.length ? [{ id: { in: matchedDriverIds } }] : [])] },
      select: {
        id: true, source: true, sourceExtractionId: true, title: true, location: true, preferredRoute: true, description: true,
        availableFrom: true, status: true, publishedAt: true, deactivatedAt: true, updatedAt: true, company: { select: { name: true } },
      },
      orderBy: includeActiveSnapshot ? [{ updatedAt: "desc" }, { id: "desc" }] : [{ updatedAt: "asc" }, { id: "asc" }], take,
    }),
  ]);

  const publicSourceMetadata = await readPublicSourceMetadata([
    ...loads.map((row) => row.sourceExtractionId),
    ...vehicles.map((row) => row.sourceExtractionId),
    ...drivers.map((row) => row.sourceExtractionId),
  ]);

  const listingEvents = [
    ...loads.map((row): LiveMarketplaceEvent => {
      const metadata = row.sourceExtractionId ? publicSourceMetadata.get(row.sourceExtractionId) : null;
      const summary = buildPublicListingSummary({
        id: row.id,
        kind: "LOAD",
        source: row.source,
        companyName: row.company.name,
        explicitCompanyName: metadata?.explicitCompanyName,
        explicitAdvertiserName: metadata?.explicitAdvertiserName,
        description: row.description ?? row.cargoType,
        origin: row.origin,
        destination: row.destination,
        trailerType: row.trailerType,
        tonnage: row.weight == null ? null : Number(row.weight),
      });
      return {
        event: eventName(row.status, row.deactivatedAt, row.publishedAt, row.updatedAt),
        cursor: row.updatedAt.toISOString(),
        listing: {
          id: row.id, kind: "LOAD", source: row.source, sourceLabel: sourceLabel(row.source), eventVersion: 1,
          ...summary,
          companyName: summary.publicAdvertiserName,
          title: summary.publicTitle,
          description: row.description ?? row.cargoType,
          origin: row.origin, destination: row.destination, trailerType: row.trailerType,
          vehicleBodyLength: null, tonnage: row.weight == null ? null : Number(row.weight), relevantDate: row.loadingDate.toISOString(), status: row.status,
          publishedAt: row.publishedAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
        },
      };
    }),
    ...vehicles.map((row): LiveMarketplaceEvent => {
      const metadata = row.sourceExtractionId ? publicSourceMetadata.get(row.sourceExtractionId) : null;
      const summary = buildPublicListingSummary({
        id: row.id,
        kind: "VEHICLE",
        source: row.source,
        companyName: row.company.name,
        explicitCompanyName: metadata?.explicitCompanyName,
        explicitAdvertiserName: metadata?.explicitAdvertiserName,
        description: row.description,
        origin: row.origin,
        destination: row.destination,
        trailerType: row.trailerType,
        tonnage: row.capacityWeight == null ? null : Number(row.capacityWeight),
      });
      return {
        event: eventName(row.status, row.deactivatedAt, row.publishedAt, row.updatedAt),
        cursor: row.updatedAt.toISOString(),
        listing: {
          id: row.id, kind: "VEHICLE", source: row.source, sourceLabel: sourceLabel(row.source), eventVersion: 1,
          ...summary,
          companyName: summary.publicAdvertiserName,
          title: summary.publicTitle,
          description: row.description, origin: row.origin, destination: row.destination, trailerType: row.trailerType,
          vehicleBodyLength: null, tonnage: row.capacityWeight == null ? null : Number(row.capacityWeight), relevantDate: row.availableFrom.toISOString(), status: row.status,
          publishedAt: row.publishedAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
        },
      };
    }),
    ...drivers.map((row): LiveMarketplaceEvent => {
      const metadata = row.sourceExtractionId ? publicSourceMetadata.get(row.sourceExtractionId) : null;
      const summary = buildPublicListingSummary({
        id: row.id,
        kind: "DRIVER",
        source: row.source,
        companyName: row.company.name,
        explicitCompanyName: metadata?.explicitCompanyName,
        explicitAdvertiserName: metadata?.explicitAdvertiserName,
        title: row.title,
        description: row.description ?? row.preferredRoute,
        origin: row.location,
      });
      return {
        event: eventName(row.status, row.deactivatedAt, row.publishedAt, row.updatedAt),
        cursor: row.updatedAt.toISOString(),
        listing: {
          id: row.id, kind: "DRIVER", source: row.source, sourceLabel: sourceLabel(row.source), eventVersion: 1,
          ...summary,
          companyName: summary.publicAdvertiserName,
          title: summary.publicTitle,
          description: row.description ?? row.preferredRoute,
          origin: row.location, destination: null, trailerType: null, vehicleBodyLength: null, tonnage: null, relevantDate: row.availableFrom.toISOString(),
          status: row.status, publishedAt: row.publishedAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
        },
      };
    }),
  ];
  const listingByKey = new Map(listingEvents.map((event) => [`${event.listing.kind}:${event.listing.id}`, event.listing]));
  const matchedEvents = matches.flatMap((match): LiveMarketplaceEvent[] => {
    const listing = listingByKey.get(`${match.listingKind}:${match.listingId}`);
    return listing ? [{
      event: "listing.matched",
      cursor: match.matchedAt.toISOString(),
      match: { demandId: match.requestId },
      listing,
    }] : [];
  });
  const events = [
    ...listingEvents.filter((event) => includeActiveSnapshot || new Date(event.cursor) > after),
    ...matchedEvents,
  ].sort((left, right) => left.cursor.localeCompare(right.cursor) || left.event.localeCompare(right.event) || left.listing.id.localeCompare(right.listing.id));
  return includeActiveSnapshot ? events.slice(-take) : events.slice(0, take);
}

function eventName(status: string, deactivatedAt: Date | null, publishedAt: Date, updatedAt: Date): LiveMarketplaceEvent["event"] {
  if (status === "EXPIRED") return "listing.expired";
  if (status === "INACTIVE") return deactivatedAt ? "listing.deleted" : "listing.expired";
  return Math.abs(updatedAt.getTime() - publishedAt.getTime()) < 2_000 ? "listing.created" : "listing.updated";
}

function sourceLabel(source: "LOGIVYA" | "WHATSAPP" | "TELEGRAM") {
  return source === "WHATSAPP" ? "WhatsApp" as const : source === "TELEGRAM" ? "Telegram" as const : "LOGIVYA" as const;
}
