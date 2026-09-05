import "server-only";

import { prisma } from "@/server/db";
import type { MarketplaceScope } from "@prisma/client";
import { buildPublicListingSummary, type PublicListingSummary } from "@/server/freight/public-listing-summary";
import { readPublicSourceMetadata } from "@/server/freight/public-source-metadata";
import { redactMarketplaceContent } from "./contact-privacy";
import { normalizeSingleLogisticsLocation } from "./location-normalization";
import { catalogFilterWhere } from "./catalog-filters";
import { emptyMarketplaceFilters, type MarketplaceFilters } from "../../../shared/marketplace-filters";

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
    originCountry: string | null;
    destinationCountry: string | null;
    trailerType: string | null;
    driverListingType?: string;
    licenseClasses?: string[];
    employmentType?: string;
    adrCertificate?: boolean;
    internationalExperience?: boolean;
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
  options: { filters?: MarketplaceFilters; before?: { time: Date; id: string } } = {},
): Promise<LiveMarketplaceEvent[]> {
  const take = Number.isFinite(limit) ? Math.min(2_000, Math.max(1, Math.trunc(limit))) : 100;
  const snapshotWhere = (kind: "LOAD" | "VEHICLE" | "DRIVER") => ({
    status: "ACTIVE" as const, marketplaceScopes: { has: scope },
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      catalogFilterWhere(options.filters ?? emptyMarketplaceFilters, kind),
      ...(options.before ? [{ OR: [{ updatedAt: { lt: options.before.time } }, { updatedAt: options.before.time, id: { lt: options.before.id } }] }] : []),
    ],
  });
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
        ? snapshotWhere("LOAD")
        : { marketplaceScopes: { has: scope }, OR: [{ updatedAt: { gt: after } }, ...(matchedLoadIds.length ? [{ id: { in: matchedLoadIds } }] : [])] },
      select: {
        id: true, source: true, sourceExtractionId: true, origin: true, destination: true, cargoType: true, description: true, trailerType: true,
        weight: true, loadingDate: true, status: true, publishedAt: true, deactivatedAt: true, updatedAt: true,
        company: { select: { name: true } },
      },
      orderBy: includeActiveSnapshot ? [{ updatedAt: "desc" }, { id: "desc" }] : [{ updatedAt: "asc" }, { id: "asc" }],
      take,
    }),
    prisma.vehicleListing.findMany({
      where: includeActiveSnapshot
        ? snapshotWhere("VEHICLE")
        : { marketplaceScopes: { has: scope }, OR: [{ updatedAt: { gt: after } }, ...(matchedVehicleIds.length ? [{ id: { in: matchedVehicleIds } }] : [])] },
      select: {
        id: true, source: true, sourceExtractionId: true, origin: true, destination: true, description: true, trailerType: true, capacityWeight: true,
        availableFrom: true, status: true, publishedAt: true, deactivatedAt: true, updatedAt: true, company: { select: { name: true } },
      },
      orderBy: includeActiveSnapshot ? [{ updatedAt: "desc" }, { id: "desc" }] : [{ updatedAt: "asc" }, { id: "asc" }],
      take,
    }),
    prisma.driverListing.findMany({
      where: includeActiveSnapshot
        ? snapshotWhere("DRIVER")
        : { marketplaceScopes: { has: scope }, OR: [{ updatedAt: { gt: after } }, ...(matchedDriverIds.length ? [{ id: { in: matchedDriverIds } }] : [])] },
      select: {
        id: true, source: true, sourceExtractionId: true, title: true, location: true, preferredRoute: true, description: true,
        listingType: true, licenseClasses: true, employmentType: true, adrCertificate: true, internationalExperience: true,
        availableFrom: true, status: true, publishedAt: true, deactivatedAt: true, updatedAt: true, company: { select: { name: true } },
      },
      orderBy: includeActiveSnapshot ? [{ updatedAt: "desc" }, { id: "desc" }] : [{ updatedAt: "asc" }, { id: "asc" }],
      take,
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
          origin: row.origin, destination: row.destination, originCountry: normalizeSingleLogisticsLocation(row.origin)?.countryCode ?? null, destinationCountry: normalizeSingleLogisticsLocation(row.destination)?.countryCode ?? null, trailerType: row.trailerType,
          vehicleBodyLength: null, tonnage: row.weight == null ? null : Number(row.weight), relevantDate: row.loadingDate?.toISOString() ?? null, status: row.status,
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
          description: row.description, origin: row.origin, destination: row.destination, originCountry: normalizeSingleLogisticsLocation(row.origin)?.countryCode ?? null, destinationCountry: normalizeSingleLogisticsLocation(row.destination)?.countryCode ?? null, trailerType: row.trailerType,
          vehicleBodyLength: null, tonnage: row.capacityWeight == null ? null : Number(row.capacityWeight), relevantDate: row.availableFrom?.toISOString() ?? null, status: row.status,
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
          driverListingType: row.listingType, licenseClasses: row.licenseClasses, employmentType: row.employmentType,
          adrCertificate: row.adrCertificate, internationalExperience: row.internationalExperience,
          ...summary,
          companyName: summary.publicAdvertiserName,
          title: summary.publicTitle,
          description: row.description ?? row.preferredRoute,
          origin: row.location, destination: null, originCountry: normalizeSingleLogisticsLocation(row.location)?.countryCode ?? null, destinationCountry: null, trailerType: null, vehicleBodyLength: null, tonnage: null, relevantDate: row.availableFrom?.toISOString() ?? null,
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
  ].sort((left, right) => left.cursor.localeCompare(right.cursor) || left.listing.id.localeCompare(right.listing.id) || left.event.localeCompare(right.event));
  // Snapshot queries are sorted newest-first per listing kind, then normalized
  // to ascending cursor order above. Keep only the newest bounded window so a
  // large marketplace cannot create an unbounded mobile response/render pass.
  return redactMarketplaceContent(includeActiveSnapshot ? events.slice(-take) : events.slice(0, take));
}

function eventName(status: string, deactivatedAt: Date | null, publishedAt: Date, updatedAt: Date): LiveMarketplaceEvent["event"] {
  if (status === "EXPIRED") return "listing.expired";
  if (status === "INACTIVE") return deactivatedAt ? "listing.deleted" : "listing.expired";
  return Math.abs(updatedAt.getTime() - publishedAt.getTime()) < 2_000 ? "listing.created" : "listing.updated";
}

function sourceLabel(source: "LOGIVYA" | "WHATSAPP" | "TELEGRAM") {
  return source === "WHATSAPP" ? "WhatsApp" as const : source === "TELEGRAM" ? "Telegram" as const : "LOGIVYA" as const;
}
