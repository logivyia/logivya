import "server-only";

import { Prisma, type FreightListingStatus } from "@prisma/client";

import { prisma } from "@/server/db";
import { FREIGHT_WEIGHT_UNIT } from "@/server/freight/constants";
import { buildPublicListingSummary } from "@/server/freight/public-listing-summary";
import { readPublicSourceMetadata, type PublicSourceMetadata } from "@/server/freight/public-source-metadata";
import { marketplaceScopesForSector } from "@/server/freight/sector-classification";
import { requireMarketplaceScopeFeature, requireMarketplaceSectorFeature } from "@/server/features/product-status";
import { normalizeFreightPhone, normalizeFreightSearchText, normalizeFreightText, parseFreightDate, todayFreightDate, type FreightActor } from "@/server/freight/service";
import type { CreateVehicleListingInput, MarketplaceMineInput, UpdateVehicleListingInput, VehicleSearchInput } from "@/server/freight/marketplace-validation";

const vehicleSelect = {
  id: true, companyId: true, ownerUserId: true, source: true, sourceExtractionId: true, primarySector: true,
  marketplaceScopes: true, sectorDetails: true, origin: true, destination: true,
  availableFrom: true, availableUntil: true, trailerType: true, capacityWeight: true,
  weightUnit: true, vehicleCount: true, internationalTransport: true, adrSuitable: true,
  priceAmount: true, currency: true, description: true, contactPhone: true, status: true,
  publishedAt: true, completedAt: true, deactivatedAt: true, expiresAt: true, createdAt: true, updatedAt: true,
  company: { select: { name: true } }, owner: { select: { name: true } },
} satisfies Prisma.VehicleListingSelect;

type VehicleRow = Prisma.VehicleListingGetPayload<{ select: typeof vehicleSelect }>;

function optionalNormalized(value: string | null | undefined) {
  if (value == null) return null;
  const normalized = normalizeFreightText(value);
  return normalized || null;
}

function dateOnly(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function serializeVehicle(row: VehicleRow, includeContact: boolean, sourceMetadata?: PublicSourceMetadata, includeOwnedSectorDetails = false) {
  const contactPhone = includeContact ? row.contactPhone : null;
  const publicSummary = buildPublicListingSummary({
    id: row.id,
    kind: "VEHICLE",
    source: row.source,
    companyName: row.company.name,
    explicitCompanyName: sourceMetadata?.explicitCompanyName,
    explicitAdvertiserName: sourceMetadata?.explicitAdvertiserName,
    description: row.description,
    origin: row.origin,
    destination: row.destination,
    trailerType: row.trailerType,
    tonnage: row.capacityWeight == null ? null : Number(row.capacityWeight),
    vehicleCount: row.vehicleCount,
    contactPhone,
  });
  return {
    id: row.id, kind: "VEHICLE" as const, companyId: row.companyId, ownerUserId: row.ownerUserId, source: row.source,
    ...(includeOwnedSectorDetails ? { primarySector: row.primarySector, marketplaceScopes: row.marketplaceScopes, sectorDetails: row.sectorDetails } : {}),
    origin: row.origin, destination: row.destination, availableFrom: dateOnly(row.availableFrom)!,
    availableUntil: dateOnly(row.availableUntil), trailerType: row.trailerType,
    capacityWeight: row.capacityWeight == null ? null : Number(row.capacityWeight), weightUnit: row.weightUnit,
    vehicleCount: row.vehicleCount, internationalTransport: row.internationalTransport, adrSuitable: row.adrSuitable,
    priceAmount: row.priceAmount == null ? null : Number(row.priceAmount), currency: row.currency,
    description: row.description, contactPhone, status: row.status,
    companyName: publicSummary.publicAdvertiserName, ownerName: publicSummary.publicAdvertiserName, ...publicSummary,
    publishedAt: row.publishedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null, deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

async function serializeVehicleRows(rows: VehicleRow[], includeContact: boolean, includeOwnedSectorDetails = false) {
  const metadata = await readPublicSourceMetadata(rows.map((row) => row.sourceExtractionId));
  return rows.map((row) => serializeVehicle(
    row,
    includeContact,
    row.sourceExtractionId ? metadata.get(row.sourceExtractionId) : undefined,
    includeOwnedSectorDetails,
  ));
}

async function serializeVehicleRow(row: VehicleRow, includeContact: boolean, includeOwnedSectorDetails = false) {
  return (await serializeVehicleRows([row], includeContact, includeOwnedSectorDetails))[0]!;
}

function readVehicleDates(input: { availableFrom: string; availableUntil?: string | null }) {
  const availableFrom = parseFreightDate(input.availableFrom);
  const availableUntil = input.availableUntil ? parseFreightDate(input.availableUntil) : null;
  if (availableFrom < todayFreightDate()) throw new Error("FREIGHT_LOADING_DATE_PAST");
  if (availableUntil && availableUntil < availableFrom) throw new Error("MARKETPLACE_DATE_RANGE_INVALID");
  return { availableFrom, availableUntil };
}

function createData(actor: FreightActor, input: CreateVehicleListingInput): Prisma.VehicleListingUncheckedCreateInput {
  const { availableFrom, availableUntil } = readVehicleDates(input);
  const origin = normalizeFreightText(input.origin);
  const destination = optionalNormalized(input.destination);
  return {
    companyId: actor.companyId, ownerUserId: actor.userId, clientRequestId: input.clientRequestId,
    primarySector: input.primarySector, marketplaceScopes: marketplaceScopesForSector(input.primarySector),
    ...(input.sectorDetails == null ? {} : { sectorDetails: input.sectorDetails as Prisma.InputJsonValue }),
    origin, originNormalized: normalizeFreightSearchText(origin), destination,
    destinationNormalized: destination ? normalizeFreightSearchText(destination) : null,
    availableFrom, availableUntil, trailerType: input.trailerType,
    capacityWeight: input.capacityWeight == null ? null : new Prisma.Decimal(input.capacityWeight),
    weightUnit: FREIGHT_WEIGHT_UNIT, vehicleCount: input.vehicleCount,
    internationalTransport: input.internationalTransport, adrSuitable: input.adrSuitable,
    priceAmount: input.priceAmount == null ? null : new Prisma.Decimal(input.priceAmount),
    currency: input.priceAmount == null ? null : (input.currency ?? actor.defaultCurrency).toUpperCase(),
    description: optionalNormalized(input.description), contactPhone: normalizeFreightPhone(input.contactPhone, actor.defaultCountry),
    status: "ACTIVE",
  };
}

export async function createVehicleListing(actor: FreightActor, input: CreateVehicleListingInput) {
  await requireMarketplaceSectorFeature(input.primarySector);
  if (input.clientRequestId) {
    const existing = await prisma.vehicleListing.findUnique({ where: { ownerUserId_clientRequestId: { ownerUserId: actor.userId, clientRequestId: input.clientRequestId } }, select: vehicleSelect });
    if (existing) return { listing: await serializeVehicleRow(existing, true, true), duplicate: true };
  }
  try {
    const created = await prisma.vehicleListing.create({ data: createData(actor, input), select: vehicleSelect });
    return { listing: await serializeVehicleRow(created, true, true), duplicate: false };
  } catch (error) {
    if (input.clientRequestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.vehicleListing.findUnique({ where: { ownerUserId_clientRequestId: { ownerUserId: actor.userId, clientRequestId: input.clientRequestId } }, select: vehicleSelect });
      if (existing) return { listing: await serializeVehicleRow(existing, true, true), duplicate: true };
    }
    throw error;
  }
}

export async function searchVehicleListings(input: VehicleSearchInput) {
  await requireMarketplaceScopeFeature(input.scope);
  const today = todayFreightDate();
  const targetDate = input.availableFrom ? parseFreightDate(input.availableFrom) : null;
  const where: Prisma.VehicleListingWhereInput = {
    status: "ACTIVE",
    ...(targetDate ? { availableFrom: { lte: targetDate } } : {}),
    marketplaceScopes: { has: input.scope },
    AND: [
      { OR: [{ availableUntil: null }, { availableUntil: { gte: targetDate ?? today } }] },
      { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    ],
  };
  if (input.q) {
    const q = normalizeFreightSearchText(input.q);
    where.OR = [{ originNormalized: { contains: q } }, { destinationNormalized: { contains: q } }, { description: { contains: input.q, mode: "insensitive" } }];
  }
  if (input.origin) where.originNormalized = { contains: normalizeFreightSearchText(input.origin) };
  if (input.destination) where.destinationNormalized = { contains: normalizeFreightSearchText(input.destination) };
  if (input.trailerType) where.trailerType = input.trailerType;
  if (input.internationalTransport !== undefined) where.internationalTransport = input.internationalTransport;
  if (input.adrSuitable !== undefined) where.adrSuitable = input.adrSuitable;
  const rows = await prisma.vehicleListing.findMany({
    where, select: vehicleSelect, orderBy: [{ availableFrom: "asc" }, { createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1, ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  return { listings: await serializeVehicleRows(page, false), pageInfo: { hasMore, nextCursor: hasMore ? page.at(-1)?.id ?? null : null } };
}

export async function listOwnedVehicleListings(ownerUserId: string, input: MarketplaceMineInput) {
  if (input.scope) await requireMarketplaceScopeFeature(input.scope);
  const rows = await prisma.vehicleListing.findMany({ where: { ownerUserId, ...(input.status ? { status: input.status } : {}), ...(input.scope ? { marketplaceScopes: { has: input.scope } } : {}), ...(input.sector ? { primarySector: input.sector } : {}) }, select: vehicleSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: input.limit + 1, ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}) });
  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  return { listings: await serializeVehicleRows(page, true, true), pageInfo: { hasMore, nextCursor: hasMore ? page.at(-1)?.id ?? null : null } };
}

export async function getVehicleListing(id: string, requesterUserId: string) {
  const row = await prisma.vehicleListing.findUnique({ where: { id }, select: vehicleSelect });
  if (!row || (row.status !== "ACTIVE" && row.ownerUserId !== requesterUserId)) throw new Error("VEHICLE_LISTING_NOT_FOUND");
  return serializeVehicleRow(row, true, row.ownerUserId === requesterUserId);
}

export async function updateOwnedVehicleListing(actor: FreightActor, id: string, input: UpdateVehicleListingInput) {
  const current = await prisma.vehicleListing.findFirst({ where: { id, ownerUserId: actor.userId }, select: vehicleSelect });
  if (!current) throw new Error("VEHICLE_LISTING_NOT_FOUND");
  if (current.status === "COMPLETED" || current.status === "EXPIRED") throw new Error("FREIGHT_LISTING_NOT_EDITABLE");
  const data: Prisma.VehicleListingUncheckedUpdateInput = {};
  if (input.origin !== undefined) { data.origin = normalizeFreightText(input.origin); data.originNormalized = normalizeFreightSearchText(input.origin); }
  if (input.destination !== undefined) { const value = optionalNormalized(input.destination); data.destination = value; data.destinationNormalized = value ? normalizeFreightSearchText(value) : null; }
  const nextFrom = input.availableFrom ? parseFreightDate(input.availableFrom) : current.availableFrom;
  const nextUntil = input.availableUntil === undefined ? current.availableUntil : input.availableUntil ? parseFreightDate(input.availableUntil) : null;
  if (input.availableFrom !== undefined && nextFrom < todayFreightDate()) throw new Error("FREIGHT_LOADING_DATE_PAST");
  if (nextUntil && nextUntil < nextFrom) throw new Error("MARKETPLACE_DATE_RANGE_INVALID");
  if (input.availableFrom !== undefined) data.availableFrom = nextFrom;
  if (input.availableUntil !== undefined) data.availableUntil = nextUntil;
  if (input.trailerType !== undefined) data.trailerType = input.trailerType;
  if (input.capacityWeight !== undefined) data.capacityWeight = input.capacityWeight == null ? null : new Prisma.Decimal(input.capacityWeight);
  if (input.vehicleCount !== undefined) data.vehicleCount = input.vehicleCount;
  if (input.internationalTransport !== undefined) data.internationalTransport = input.internationalTransport;
  if (input.adrSuitable !== undefined) data.adrSuitable = input.adrSuitable;
  if (input.description !== undefined) data.description = optionalNormalized(input.description);
  if (input.contactPhone !== undefined) data.contactPhone = normalizeFreightPhone(input.contactPhone, actor.defaultCountry);
  if (input.primarySector !== undefined) { data.primarySector = input.primarySector; data.marketplaceScopes = marketplaceScopesForSector(input.primarySector); }
  if (input.sectorDetails !== undefined) data.sectorDetails = input.sectorDetails === null ? Prisma.DbNull : input.sectorDetails as Prisma.InputJsonValue;
  const nextPrice = input.priceAmount === undefined ? current.priceAmount : input.priceAmount;
  const nextCurrency = input.currency === undefined ? current.currency : input.currency;
  if (nextPrice != null && !nextCurrency) throw new Error("FREIGHT_CURRENCY_REQUIRED");
  if (input.priceAmount !== undefined || input.currency !== undefined) { data.priceAmount = nextPrice == null ? null : new Prisma.Decimal(nextPrice); data.currency = nextPrice == null ? null : nextCurrency?.toUpperCase(); }
  const mutation = await prisma.vehicleListing.updateMany({ where: { id, ownerUserId: actor.userId, status: { not: "COMPLETED" } }, data });
  if (mutation.count !== 1) throw new Error("FREIGHT_LISTING_NOT_EDITABLE");
  const updated = await prisma.vehicleListing.findUnique({ where: { id }, select: vehicleSelect });
  if (!updated) throw new Error("VEHICLE_LISTING_NOT_FOUND");
  return serializeVehicleRow(updated, true, true);
}

const transitions: Record<FreightListingStatus, readonly FreightListingStatus[]> = { ACTIVE: ["COMPLETED", "INACTIVE"], INACTIVE: ["ACTIVE", "COMPLETED"], COMPLETED: [], EXPIRED: [] };

export async function transitionOwnedVehicleListing(id: string, ownerUserId: string, nextStatus: FreightListingStatus) {
  const current = await prisma.vehicleListing.findFirst({ where: { id, ownerUserId }, select: vehicleSelect });
  if (!current) throw new Error("VEHICLE_LISTING_NOT_FOUND");
  if (current.status === nextStatus) return serializeVehicleRow(current, true, true);
  if (!transitions[current.status].includes(nextStatus)) throw new Error("FREIGHT_STATUS_TRANSITION_INVALID");
  if (nextStatus === "ACTIVE" && current.availableUntil && current.availableUntil < todayFreightDate()) throw new Error("FREIGHT_LOADING_DATE_PAST");
  const now = new Date();
  const mutation = await prisma.vehicleListing.updateMany({ where: { id, ownerUserId, status: current.status }, data: { status: nextStatus, completedAt: nextStatus === "COMPLETED" ? now : null, deactivatedAt: nextStatus === "INACTIVE" ? now : null } });
  if (mutation.count !== 1) throw new Error("FREIGHT_STATUS_TRANSITION_INVALID");
  const updated = await prisma.vehicleListing.findUnique({ where: { id }, select: vehicleSelect });
  if (!updated) throw new Error("VEHICLE_LISTING_NOT_FOUND");
  return serializeVehicleRow(updated, true, true);
}
