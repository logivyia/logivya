import "server-only";

import { Prisma, type FreightListingStatus } from "@prisma/client";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/core";
import phoneMetadata from "libphonenumber-js/min/metadata";

import { prisma } from "@/server/db";
import { FREIGHT_WEIGHT_UNIT } from "@/server/freight/constants";
import { buildPublicListingSummary } from "@/server/freight/public-listing-summary";
import { readPublicSourceMetadata, type PublicSourceMetadata } from "@/server/freight/public-source-metadata";
import { marketplaceScopesForSector } from "@/server/freight/sector-classification";
import { requireMarketplaceScopeFeature, requireMarketplaceSectorFeature } from "@/server/features/product-status";
import type {
  CreateFreightListingInput,
  FreightMineInput,
  FreightSearchInput,
  UpdateFreightListingInput,
} from "@/server/freight/validation";

const listingSelect = {
  id: true,
  companyId: true,
  ownerUserId: true,
  source: true,
  sourceExtractionId: true,
  primarySector: true,
  marketplaceScopes: true,
  sectorDetails: true,
  origin: true,
  destination: true,
  loadingDate: true,
  cargoType: true,
  weight: true,
  weightUnit: true,
  trailerType: true,
  vehicleCount: true,
  priceAmount: true,
  currency: true,
  customsInfo: true,
  containerStatus: true,
  description: true,
  contactPhone: true,
  status: true,
  publishedAt: true,
  completedAt: true,
  deactivatedAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { name: true } },
  owner: { select: { name: true } },
} satisfies Prisma.FreightListingSelect;

type FreightListingRow = Prisma.FreightListingGetPayload<{ select: typeof listingSelect }>;

export type FreightActor = {
  userId: string;
  companyId: string;
  defaultCountry: string;
  defaultCurrency: string;
};

export function normalizeFreightText(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function normalizeFreightSearchText(value: string) {
  return normalizeFreightText(value).toLocaleLowerCase("tr-TR");
}

export function parseFreightDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) throw new Error("FREIGHT_INVALID_DATE");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("FREIGHT_INVALID_DATE");
  }
  return date;
}

export function todayFreightDate(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function normalizeFreightPhone(value: string, defaultCountry: string) {
  const country = /^[A-Z]{2}$/u.test(defaultCountry) ? defaultCountry as CountryCode : "TR";
  const parsed = parsePhoneNumberFromString(normalizeFreightText(value), country, phoneMetadata);
  if (!parsed?.isValid()) throw new Error("FREIGHT_INVALID_PHONE");
  return parsed.number;
}

function optionalNormalized(value: string | null | undefined) {
  if (value == null) return null;
  const normalized = normalizeFreightText(value);
  return normalized || null;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function serializeListing(
  row: FreightListingRow,
  includeContact: boolean,
  sourceMetadata?: PublicSourceMetadata,
  includeOwnedSectorDetails = false,
) {
  const contactPhone = includeContact ? row.contactPhone : null;
  const publicSummary = buildPublicListingSummary({
    id: row.id,
    kind: "LOAD",
    source: row.source,
    companyName: row.company.name,
    explicitCompanyName: sourceMetadata?.explicitCompanyName,
    explicitAdvertiserName: sourceMetadata?.explicitAdvertiserName,
    description: row.description ?? row.cargoType,
    origin: row.origin,
    destination: row.destination,
    trailerType: row.trailerType,
    tonnage: row.weight == null ? null : Number(row.weight),
    vehicleCount: row.vehicleCount,
    contactPhone,
  });
  return {
    id: row.id,
    companyId: row.companyId,
    ownerUserId: row.ownerUserId,
    source: row.source,
    ...(includeOwnedSectorDetails ? {
      primarySector: row.primarySector,
      marketplaceScopes: row.marketplaceScopes,
      sectorDetails: row.sectorDetails,
    } : {}),
    origin: row.origin,
    destination: row.destination,
    loadingDate: dateOnly(row.loadingDate),
    cargoType: row.cargoType,
    weight: row.weight == null ? null : Number(row.weight),
    weightUnit: row.weightUnit,
    trailerType: row.trailerType,
    vehicleCount: row.vehicleCount,
    priceAmount: row.priceAmount == null ? null : Number(row.priceAmount),
    currency: row.currency,
    customsInfo: row.customsInfo,
    containerStatus: row.containerStatus,
    description: row.description,
    contactPhone,
    status: row.status,
    companyName: publicSummary.publicAdvertiserName,
    ownerName: publicSummary.publicAdvertiserName,
    ...publicSummary,
    publishedAt: row.publishedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function serializeListingRows(rows: FreightListingRow[], includeContact: boolean, includeOwnedSectorDetails = false) {
  const metadata = await readPublicSourceMetadata(rows.map((row) => row.sourceExtractionId));
  return rows.map((row) => serializeListing(
    row,
    includeContact,
    row.sourceExtractionId ? metadata.get(row.sourceExtractionId) : undefined,
    includeOwnedSectorDetails,
  ));
}

async function serializeListingRow(row: FreightListingRow, includeContact: boolean, includeOwnedSectorDetails = false) {
  return (await serializeListingRows([row], includeContact, includeOwnedSectorDetails))[0]!;
}

function createData(actor: FreightActor, input: CreateFreightListingInput): Prisma.FreightListingUncheckedCreateInput {
  const loadingDate = parseFreightDate(input.loadingDate);
  if (loadingDate < todayFreightDate()) throw new Error("FREIGHT_LOADING_DATE_PAST");
  const origin = normalizeFreightText(input.origin);
  const destination = normalizeFreightText(input.destination);
  return {
    companyId: actor.companyId,
    ownerUserId: actor.userId,
    clientRequestId: input.clientRequestId,
    primarySector: input.primarySector,
    marketplaceScopes: marketplaceScopesForSector(input.primarySector),
    ...(input.sectorDetails == null ? {} : { sectorDetails: input.sectorDetails as Prisma.InputJsonValue }),
    origin,
    originNormalized: normalizeFreightSearchText(origin),
    destination,
    destinationNormalized: normalizeFreightSearchText(destination),
    loadingDate,
    cargoType: optionalNormalized(input.cargoType),
    weight: input.weight == null ? null : new Prisma.Decimal(input.weight),
    weightUnit: FREIGHT_WEIGHT_UNIT,
    trailerType: input.trailerType,
    vehicleCount: input.vehicleCount,
    priceAmount: input.priceAmount == null ? null : new Prisma.Decimal(input.priceAmount),
    currency: input.priceAmount == null ? null : (input.currency ?? actor.defaultCurrency).toUpperCase(),
    customsInfo: optionalNormalized(input.customsInfo),
    containerStatus: input.containerStatus,
    description: optionalNormalized(input.description),
    contactPhone: normalizeFreightPhone(input.contactPhone, actor.defaultCountry),
    status: "ACTIVE",
  };
}

export async function createFreightListing(actor: FreightActor, input: CreateFreightListingInput) {
  await requireMarketplaceSectorFeature(input.primarySector);
  if (input.clientRequestId) {
    const existing = await prisma.freightListing.findUnique({
      where: { ownerUserId_clientRequestId: { ownerUserId: actor.userId, clientRequestId: input.clientRequestId } },
      select: listingSelect,
    });
    if (existing) return { listing: await serializeListingRow(existing, true, true), duplicate: true };
  }

  try {
    const created = await prisma.freightListing.create({ data: createData(actor, input), select: listingSelect });
    return { listing: await serializeListingRow(created, true, true), duplicate: false };
  } catch (error) {
    if (input.clientRequestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.freightListing.findUnique({
        where: { ownerUserId_clientRequestId: { ownerUserId: actor.userId, clientRequestId: input.clientRequestId } },
        select: listingSelect,
      });
      if (existing) return { listing: await serializeListingRow(existing, true, true), duplicate: true };
    }
    throw error;
  }
}

export async function searchFreightListings(input: FreightSearchInput) {
  await requireMarketplaceScopeFeature(input.scope);
  const where: Prisma.FreightListingWhereInput = {
    status: "ACTIVE",
    loadingDate: { gte: todayFreightDate() },
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      ...(input.q ? [{ OR: [
        { origin: { contains: input.q, mode: "insensitive" as const } },
        { destination: { contains: input.q, mode: "insensitive" as const } },
        { cargoType: { contains: input.q, mode: "insensitive" as const } },
        { description: { contains: input.q, mode: "insensitive" as const } },
      ] }] : []),
    ],
  };
  where.marketplaceScopes = { has: input.scope };
  if (input.origin) where.originNormalized = { contains: normalizeFreightSearchText(input.origin) };
  if (input.destination) where.destinationNormalized = { contains: normalizeFreightSearchText(input.destination) };
  if (input.loadingDate) {
    const loadingDate = parseFreightDate(input.loadingDate);
    if (loadingDate < todayFreightDate()) throw new Error("FREIGHT_LOADING_DATE_PAST");
    where.loadingDate = loadingDate;
  }
  if (input.trailerType) where.trailerType = input.trailerType;
  if (input.minWeight != null || input.maxWeight != null) {
    where.weight = {
      ...(input.minWeight != null ? { gte: new Prisma.Decimal(input.minWeight) } : {}),
      ...(input.maxWeight != null ? { lte: new Prisma.Decimal(input.maxWeight) } : {}),
    };
  }

  const rows = await prisma.freightListing.findMany({
    where,
    select: listingSelect,
    orderBy: [{ loadingDate: "asc" }, { createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  return {
    listings: await serializeListingRows(page, false),
    pageInfo: { hasMore, nextCursor: hasMore ? page.at(-1)?.id ?? null : null },
    sort: "LOADING_DATE_ASC_CREATED_AT_DESC",
  };
}

export async function listOwnedFreightListings(ownerUserId: string, input: FreightMineInput) {
  if (input.scope) await requireMarketplaceScopeFeature(input.scope);
  const rows = await prisma.freightListing.findMany({
    where: {
      ownerUserId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.scope ? { marketplaceScopes: { has: input.scope } } : {}),
      ...(input.sector ? { primarySector: input.sector } : {}),
    },
    select: listingSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  return {
    listings: await serializeListingRows(page, true, true),
    pageInfo: { hasMore, nextCursor: hasMore ? page.at(-1)?.id ?? null : null },
  };
}

export async function getFreightListing(id: string, requesterUserId: string) {
  const row = await prisma.freightListing.findUnique({ where: { id }, select: listingSelect });
  if (!row || (row.status !== "ACTIVE" && row.ownerUserId !== requesterUserId)) {
    throw new Error("FREIGHT_LISTING_NOT_FOUND");
  }
  return serializeListingRow(row, true, row.ownerUserId === requesterUserId);
}

export async function updateOwnedFreightListing(actor: FreightActor, id: string, input: UpdateFreightListingInput) {
  const current = await prisma.freightListing.findFirst({
    where: { id, ownerUserId: actor.userId },
    select: listingSelect,
  });
  if (!current) throw new Error("FREIGHT_LISTING_NOT_FOUND");
  if (current.status === "COMPLETED" || current.status === "EXPIRED") throw new Error("FREIGHT_LISTING_NOT_EDITABLE");

  const data: Prisma.FreightListingUncheckedUpdateInput = {};
  if (input.origin !== undefined) {
    data.origin = normalizeFreightText(input.origin);
    data.originNormalized = normalizeFreightSearchText(input.origin);
  }
  if (input.destination !== undefined) {
    data.destination = normalizeFreightText(input.destination);
    data.destinationNormalized = normalizeFreightSearchText(input.destination);
  }
  if (input.loadingDate !== undefined) {
    const loadingDate = parseFreightDate(input.loadingDate);
    if (loadingDate < todayFreightDate()) throw new Error("FREIGHT_LOADING_DATE_PAST");
    data.loadingDate = loadingDate;
  }
  if (input.cargoType !== undefined) data.cargoType = optionalNormalized(input.cargoType);
  if (input.weight !== undefined) data.weight = input.weight == null ? null : new Prisma.Decimal(input.weight);
  if (input.trailerType !== undefined) data.trailerType = input.trailerType;
  if (input.vehicleCount !== undefined) data.vehicleCount = input.vehicleCount;
  if (input.customsInfo !== undefined) data.customsInfo = optionalNormalized(input.customsInfo);
  if (input.containerStatus !== undefined) data.containerStatus = input.containerStatus;
  if (input.description !== undefined) data.description = optionalNormalized(input.description);
  if (input.contactPhone !== undefined) data.contactPhone = normalizeFreightPhone(input.contactPhone, actor.defaultCountry);
  if (input.primarySector !== undefined) {
    data.primarySector = input.primarySector;
    data.marketplaceScopes = marketplaceScopesForSector(input.primarySector);
  }
  if (input.sectorDetails !== undefined) {
    data.sectorDetails = input.sectorDetails === null ? Prisma.DbNull : input.sectorDetails as Prisma.InputJsonValue;
  }

  const nextPrice = input.priceAmount === undefined ? current.priceAmount : input.priceAmount;
  const nextCurrency = input.currency === undefined ? current.currency : input.currency;
  if (nextPrice != null && !nextCurrency) throw new Error("FREIGHT_CURRENCY_REQUIRED");
  if (input.priceAmount !== undefined || input.currency !== undefined) {
    data.priceAmount = nextPrice == null ? null : new Prisma.Decimal(nextPrice);
    data.currency = nextPrice == null ? null : nextCurrency?.toUpperCase();
  }

  const mutation = await prisma.freightListing.updateMany({
    where: { id, ownerUserId: actor.userId, status: { not: "COMPLETED" } },
    data,
  });
  if (mutation.count !== 1) throw new Error("FREIGHT_LISTING_NOT_EDITABLE");
  const updated = await prisma.freightListing.findUnique({ where: { id }, select: listingSelect });
  if (!updated) throw new Error("FREIGHT_LISTING_NOT_FOUND");
  return serializeListingRow(updated, true, true);
}

const allowedTransitions: Record<FreightListingStatus, readonly FreightListingStatus[]> = {
  ACTIVE: ["COMPLETED", "INACTIVE"],
  INACTIVE: ["ACTIVE", "COMPLETED"],
  COMPLETED: [],
  EXPIRED: [],
};

export async function transitionOwnedFreightListing(id: string, ownerUserId: string, nextStatus: FreightListingStatus) {
  const current = await prisma.freightListing.findFirst({ where: { id, ownerUserId }, select: listingSelect });
  if (!current) throw new Error("FREIGHT_LISTING_NOT_FOUND");
  if (current.status === nextStatus) return serializeListingRow(current, true, true);
  if (!allowedTransitions[current.status].includes(nextStatus)) throw new Error("FREIGHT_STATUS_TRANSITION_INVALID");
  if (nextStatus === "ACTIVE" && current.loadingDate < todayFreightDate()) throw new Error("FREIGHT_LOADING_DATE_PAST");

  const now = new Date();
  const mutation = await prisma.freightListing.updateMany({
    where: { id, ownerUserId, status: current.status },
    data: {
      status: nextStatus,
      completedAt: nextStatus === "COMPLETED" ? now : null,
      deactivatedAt: nextStatus === "INACTIVE" ? now : null,
    },
  });
  if (mutation.count !== 1) throw new Error("FREIGHT_STATUS_TRANSITION_INVALID");
  const updated = await prisma.freightListing.findUnique({ where: { id }, select: listingSelect });
  if (!updated) throw new Error("FREIGHT_LISTING_NOT_FOUND");
  return serializeListingRow(updated, true, true);
}
