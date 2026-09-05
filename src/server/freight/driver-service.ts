import { canReadMarketplaceContact } from "@/server/freight/contact-access";
import { redactMarketplaceContent } from "@/server/freight/contact-privacy";
import "server-only";

import { Prisma, type FreightListingStatus } from "@prisma/client";

import { prisma } from "@/server/db";
import { buildPublicListingSummary } from "@/server/freight/public-listing-summary";
import { readPublicSourceMetadata, type PublicSourceMetadata } from "@/server/freight/public-source-metadata";
import { marketplaceScopesForSector } from "@/server/freight/sector-classification";
import { requireMarketplaceScopeFeature, requireMarketplaceSectorFeature } from "@/server/features/product-status";
import { normalizeFreightPhone, normalizeFreightSearchText, normalizeFreightText, parseFreightDate, todayFreightDate, type FreightActor } from "@/server/freight/service";
import type { CreateDriverListingInput, DriverSearchInput, MarketplaceMineInput, UpdateDriverListingInput } from "@/server/freight/marketplace-validation";

const driverSelect = {
  id: true, companyId: true, ownerUserId: true, source: true, sourceExtractionId: true, primarySector: true,
  marketplaceScopes: true, sectorDetails: true, listingType: true, title: true, location: true,
  preferredRoute: true, availableFrom: true, licenseClasses: true, experienceYears: true,
  employmentType: true, internationalExperience: true, adrCertificate: true, srcCertificate: true,
  psychotechnicalCertificate: true, salaryAmount: true, currency: true, description: true,
  contactPhone: true, status: true, publishedAt: true, completedAt: true, deactivatedAt: true, expiresAt: true,
  createdAt: true, updatedAt: true, company: { select: { name: true } }, owner: { select: { name: true } },
} satisfies Prisma.DriverListingSelect;

type DriverRow = Prisma.DriverListingGetPayload<{ select: typeof driverSelect }>;

function optionalNormalized(value: string | null | undefined) {
  if (value == null) return null;
  const normalized = normalizeFreightText(value);
  return normalized || null;
}

function serializeDriver(row: DriverRow, includeContact: boolean, sourceMetadata?: PublicSourceMetadata, includeOwnedSectorDetails = false) {
  const contactPhone = includeContact ? row.contactPhone : null;
  const publicSummary = buildPublicListingSummary({
    id: row.id,
    kind: "DRIVER",
    source: row.source,
    companyName: row.company.name,
    explicitCompanyName: sourceMetadata?.explicitCompanyName,
    explicitAdvertiserName: sourceMetadata?.explicitAdvertiserName,
    title: row.title,
    description: row.description ?? row.preferredRoute,
    origin: row.location,
    contactPhone,
  });
  return redactMarketplaceContent({
    contactAccess: includeContact ? "ALLOWED" : "SUBSCRIPTION_REQUIRED",
    id: row.id, kind: "DRIVER" as const, companyId: row.companyId, ownerUserId: row.ownerUserId, source: row.source,
    ...(includeOwnedSectorDetails ? { primarySector: row.primarySector, marketplaceScopes: row.marketplaceScopes, sectorDetails: row.sectorDetails } : {}),
    listingType: row.listingType, title: row.title, location: row.location, preferredRoute: row.preferredRoute,
    availableFrom: row.availableFrom.toISOString().slice(0, 10), licenseClasses: row.licenseClasses,
    experienceYears: row.experienceYears, employmentType: row.employmentType,
    internationalExperience: row.internationalExperience, adrCertificate: row.adrCertificate,
    srcCertificate: row.srcCertificate, psychotechnicalCertificate: row.psychotechnicalCertificate,
    salaryAmount: row.salaryAmount == null ? null : Number(row.salaryAmount), currency: row.currency,
    description: row.description, contactPhone, status: row.status,
    companyName: publicSummary.publicAdvertiserName, ownerName: publicSummary.publicAdvertiserName, ...publicSummary,
    publishedAt: row.publishedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null, deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }, includeContact);
}

async function serializeDriverRows(rows: DriverRow[], includeContact: boolean, includeOwnedSectorDetails = false) {
  const metadata = await readPublicSourceMetadata(rows.map((row) => row.sourceExtractionId));
  return rows.map((row) => serializeDriver(
    row,
    includeContact,
    row.sourceExtractionId ? metadata.get(row.sourceExtractionId) : undefined,
    includeOwnedSectorDetails,
  ));
}

async function serializeDriverRow(row: DriverRow, includeContact: boolean, includeOwnedSectorDetails = false) {
  return (await serializeDriverRows([row], includeContact, includeOwnedSectorDetails))[0]!;
}

function createData(actor: FreightActor, input: CreateDriverListingInput): Prisma.DriverListingUncheckedCreateInput {
  const availableFrom = parseFreightDate(input.availableFrom);
  if (availableFrom < todayFreightDate()) throw new Error("FREIGHT_LOADING_DATE_PAST");
  const title = normalizeFreightText(input.title);
  const location = normalizeFreightText(input.location);
  const preferredRoute = optionalNormalized(input.preferredRoute);
  return {
    companyId: actor.companyId, ownerUserId: actor.userId, clientRequestId: input.clientRequestId,
    primarySector: input.primarySector, marketplaceScopes: marketplaceScopesForSector(input.primarySector),
    ...(input.sectorDetails == null ? {} : { sectorDetails: input.sectorDetails as Prisma.InputJsonValue }),
    listingType: input.listingType, title, titleNormalized: normalizeFreightSearchText(title),
    location, locationNormalized: normalizeFreightSearchText(location), preferredRoute,
    preferredRouteNormalized: preferredRoute ? normalizeFreightSearchText(preferredRoute) : null,
    availableFrom, licenseClasses: [...new Set(input.licenseClasses)], experienceYears: input.experienceYears,
    employmentType: input.employmentType, internationalExperience: input.internationalExperience,
    adrCertificate: input.adrCertificate, srcCertificate: input.srcCertificate,
    psychotechnicalCertificate: input.psychotechnicalCertificate,
    salaryAmount: input.salaryAmount == null ? null : new Prisma.Decimal(input.salaryAmount),
    currency: input.salaryAmount == null ? null : (input.currency ?? actor.defaultCurrency).toUpperCase(),
    description: optionalNormalized(input.description), contactPhone: normalizeFreightPhone(input.contactPhone, actor.defaultCountry),
    status: "ACTIVE",
  };
}

export async function createDriverListing(actor: FreightActor, input: CreateDriverListingInput) {
  await requireMarketplaceSectorFeature(input.primarySector);
  if (input.clientRequestId) {
    const existing = await prisma.driverListing.findUnique({ where: { ownerUserId_clientRequestId: { ownerUserId: actor.userId, clientRequestId: input.clientRequestId } }, select: driverSelect });
    if (existing) return { listing: await serializeDriverRow(existing, true, true), duplicate: true };
  }
  try {
    const created = await prisma.driverListing.create({ data: createData(actor, input), select: driverSelect });
    return { listing: await serializeDriverRow(created, true, true), duplicate: false };
  } catch (error) {
    if (input.clientRequestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.driverListing.findUnique({ where: { ownerUserId_clientRequestId: { ownerUserId: actor.userId, clientRequestId: input.clientRequestId } }, select: driverSelect });
      if (existing) return { listing: await serializeDriverRow(existing, true, true), duplicate: true };
    }
    throw error;
  }
}

export async function searchDriverListings(input: DriverSearchInput) {
  await requireMarketplaceScopeFeature(input.scope);
  const where: Prisma.DriverListingWhereInput = {
    status: "ACTIVE",
    marketplaceScopes: { has: input.scope },
    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
  };
  if (input.q) {
    const q = normalizeFreightSearchText(input.q);
    where.OR = [{ titleNormalized: { contains: q } }, { locationNormalized: { contains: q } }, { preferredRouteNormalized: { contains: q } }, { description: { contains: input.q, mode: "insensitive" } }];
  }
  if (input.listingType) where.listingType = input.listingType;
  if (input.location) where.locationNormalized = { contains: normalizeFreightSearchText(input.location) };
  if (input.licenseClass) where.licenseClasses = { has: input.licenseClass };
  if (input.employmentType) where.employmentType = input.employmentType;
  if (input.internationalExperience !== undefined) where.internationalExperience = input.internationalExperience;
  const rows = await prisma.driverListing.findMany({ where, select: driverSelect, orderBy: [{ availableFrom: "asc" }, { createdAt: "desc" }, { id: "desc" }], take: input.limit + 1, ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}) });
  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  return { listings: await serializeDriverRows(page, false), pageInfo: { hasMore, nextCursor: hasMore ? page.at(-1)?.id ?? null : null } };
}

export async function listOwnedDriverListings(ownerUserId: string, input: MarketplaceMineInput) {
  if (input.scope) await requireMarketplaceScopeFeature(input.scope);
  const rows = await prisma.driverListing.findMany({ where: { ownerUserId, ...(input.status ? { status: input.status } : {}), ...(input.scope ? { marketplaceScopes: { has: input.scope } } : {}), ...(input.sector ? { primarySector: input.sector } : {}) }, select: driverSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: input.limit + 1, ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}) });
  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  return { listings: await serializeDriverRows(page, true, true), pageInfo: { hasMore, nextCursor: hasMore ? page.at(-1)?.id ?? null : null } };
}

export async function getDriverListing(id: string, requesterUserId: string) {
  const row = await prisma.driverListing.findUnique({ where: { id }, select: driverSelect });
  if (!row || ((row.status !== "ACTIVE" || (row.expiresAt && row.expiresAt <= new Date())) && row.ownerUserId !== requesterUserId)) throw new Error("DRIVER_LISTING_NOT_FOUND");
  return serializeDriverRow(row, await canReadMarketplaceContact(requesterUserId), row.ownerUserId === requesterUserId);
}

export async function updateOwnedDriverListing(actor: FreightActor, id: string, input: UpdateDriverListingInput) {
  const current = await prisma.driverListing.findFirst({ where: { id, ownerUserId: actor.userId }, select: driverSelect });
  if (!current) throw new Error("DRIVER_LISTING_NOT_FOUND");
  if (current.status === "COMPLETED" || current.status === "EXPIRED") throw new Error("FREIGHT_LISTING_NOT_EDITABLE");
  const data: Prisma.DriverListingUncheckedUpdateInput = {};
  if (input.listingType !== undefined) data.listingType = input.listingType;
  if (input.title !== undefined) { data.title = normalizeFreightText(input.title); data.titleNormalized = normalizeFreightSearchText(input.title); }
  if (input.location !== undefined) { data.location = normalizeFreightText(input.location); data.locationNormalized = normalizeFreightSearchText(input.location); }
  if (input.preferredRoute !== undefined) { const value = optionalNormalized(input.preferredRoute); data.preferredRoute = value; data.preferredRouteNormalized = value ? normalizeFreightSearchText(value) : null; }
  if (input.availableFrom !== undefined) { const date = parseFreightDate(input.availableFrom); if (date < todayFreightDate()) throw new Error("FREIGHT_LOADING_DATE_PAST"); data.availableFrom = date; }
  if (input.licenseClasses !== undefined) data.licenseClasses = [...new Set(input.licenseClasses)];
  if (input.experienceYears !== undefined) data.experienceYears = input.experienceYears;
  if (input.employmentType !== undefined) data.employmentType = input.employmentType;
  if (input.internationalExperience !== undefined) data.internationalExperience = input.internationalExperience;
  if (input.adrCertificate !== undefined) data.adrCertificate = input.adrCertificate;
  if (input.srcCertificate !== undefined) data.srcCertificate = input.srcCertificate;
  if (input.psychotechnicalCertificate !== undefined) data.psychotechnicalCertificate = input.psychotechnicalCertificate;
  if (input.description !== undefined) data.description = optionalNormalized(input.description);
  if (input.contactPhone !== undefined) data.contactPhone = normalizeFreightPhone(input.contactPhone, actor.defaultCountry);
  if (input.primarySector !== undefined) { data.primarySector = input.primarySector; data.marketplaceScopes = marketplaceScopesForSector(input.primarySector); }
  if (input.sectorDetails !== undefined) data.sectorDetails = input.sectorDetails === null ? Prisma.DbNull : input.sectorDetails as Prisma.InputJsonValue;
  const nextSalary = input.salaryAmount === undefined ? current.salaryAmount : input.salaryAmount;
  const nextCurrency = input.currency === undefined ? current.currency : input.currency;
  if (nextSalary != null && !nextCurrency) throw new Error("FREIGHT_CURRENCY_REQUIRED");
  if (input.salaryAmount !== undefined || input.currency !== undefined) { data.salaryAmount = nextSalary == null ? null : new Prisma.Decimal(nextSalary); data.currency = nextSalary == null ? null : nextCurrency?.toUpperCase(); }
  const mutation = await prisma.driverListing.updateMany({ where: { id, ownerUserId: actor.userId, status: { not: "COMPLETED" } }, data });
  if (mutation.count !== 1) throw new Error("FREIGHT_LISTING_NOT_EDITABLE");
  const updated = await prisma.driverListing.findUnique({ where: { id }, select: driverSelect });
  if (!updated) throw new Error("DRIVER_LISTING_NOT_FOUND");
  return serializeDriverRow(updated, true, true);
}

const transitions: Record<FreightListingStatus, readonly FreightListingStatus[]> = { ACTIVE: ["COMPLETED", "INACTIVE"], INACTIVE: ["ACTIVE", "COMPLETED"], COMPLETED: [], EXPIRED: [] };

export async function transitionOwnedDriverListing(id: string, ownerUserId: string, nextStatus: FreightListingStatus) {
  const current = await prisma.driverListing.findFirst({ where: { id, ownerUserId }, select: driverSelect });
  if (!current) throw new Error("DRIVER_LISTING_NOT_FOUND");
  if (current.status === nextStatus) return serializeDriverRow(current, true, true);
  if (!transitions[current.status].includes(nextStatus)) throw new Error("FREIGHT_STATUS_TRANSITION_INVALID");
  const now = new Date();
  const mutation = await prisma.driverListing.updateMany({ where: { id, ownerUserId, status: current.status }, data: { status: nextStatus, completedAt: nextStatus === "COMPLETED" ? now : null, deactivatedAt: nextStatus === "INACTIVE" ? now : null } });
  if (mutation.count !== 1) throw new Error("FREIGHT_STATUS_TRANSITION_INVALID");
  const updated = await prisma.driverListing.findUnique({ where: { id }, select: driverSelect });
  if (!updated) throw new Error("DRIVER_LISTING_NOT_FOUND");
  return serializeDriverRow(updated, true, true);
}
