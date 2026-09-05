import "server-only";

import type { MarketplaceScope } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { resolveFreightMarketplaceAccess } from "@/server/freight/access";
import { MARKETPLACE_SCOPES, type MarketplaceScopeValue } from "@/server/freight/constants";
import type { LiveMarketplaceEvent } from "@/server/freight/live-feed";
import {
  buildWhatsAppReferralMessage,
  redactPublicContactDetails,
} from "@/server/freight/public-listing-summary";

export { validateOwnedDemandContext } from "@/server/freight/demand-context";

export const WEB_MARKETPLACE_SEGMENTS = ["loads", "vehicles", "drivers"] as const;
export type WebMarketplaceSegment = (typeof WEB_MARKETPLACE_SEGMENTS)[number];
export type WebMarketplaceKind = "LOAD" | "VEHICLE" | "DRIVER";

type MarketplaceListingKey = { id: string; kind: WebMarketplaceKind };

const SEGMENT_BY_KIND: Record<WebMarketplaceKind, WebMarketplaceSegment> = {
  LOAD: "loads",
  VEHICLE: "vehicles",
  DRIVER: "drivers",
};

const KIND_BY_SEGMENT: Record<WebMarketplaceSegment, WebMarketplaceKind> = {
  loads: "LOAD",
  vehicles: "VEHICLE",
  drivers: "DRIVER",
};

const CONTAINER_STATUS_TR: Record<string, string | null> = {
  NONE: null,
  ONE_WAY: "Tek yön",
  RETURN_REQUIRED: "Dönüş gerekli",
};

const EMPLOYMENT_TYPE_TR: Record<string, string> = {
  FULL_TIME: "Tam zamanlı",
  PART_TIME: "Yarı zamanlı",
  CONTRACT: "Sözleşmeli",
  DAILY: "Günlük",
};

const DRIVER_LISTING_TYPE_TR: Record<string, string> = {
  DRIVER_AVAILABLE: "Şoför iş arıyor",
  DRIVER_WANTED: "Şoför aranıyor",
};

const unsafeAdvertiserNames = new Set([
  "burak idim",
  "burak ıdım",
  "burak idım",
  "burak ıdim",
  "super admin",
  "superadmin",
  "logivya super admin",
]);

export async function requireWebMarketplaceAccess() {
  const context = await requireApiSession();
  const access = await resolveFreightMarketplaceAccess(context.user.id);
  if (!access.enabled || !access.audience) throw new Error("FREIGHT_MARKETPLACE_NOT_FOUND");
  return { ...context, freightAudience: access.audience };
}

export function marketplaceKindFromSegment(value: string): WebMarketplaceKind | null {
  return WEB_MARKETPLACE_SEGMENTS.includes(value as WebMarketplaceSegment)
    ? KIND_BY_SEGMENT[value as WebMarketplaceSegment]
    : null;
}

export function marketplaceSegmentFromKind(kind: WebMarketplaceKind) {
  return SEGMENT_BY_KIND[kind];
}

export function safeWebMarketplaceScope(value: string | null | undefined): MarketplaceScopeValue {
  return MARKETPLACE_SCOPES.includes(value as MarketplaceScopeValue)
    ? value as MarketplaceScopeValue
    : "GLOBAL";
}

export function safeWebLiveAfter(value: string | null | undefined) {
  if (!value) return new Date(Date.now() - 30 * 60_000);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date(Date.now() - 30 * 60_000);
  const oldest = new Date(Date.now() - 24 * 60 * 60_000);
  return parsed < oldest ? oldest : parsed;
}

export function boundedWebLimit(value: string | null | undefined, fallback = 1_000) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) ? Math.min(2_000, Math.max(1, parsed)) : fallback;
}

export async function serializeWebLiveEvents(events: LiveMarketplaceEvent[]) {
  const advertisers = await resolveSafeWebAdvertisers(events.map((item) => ({
    id: item.listing.id,
    kind: item.listing.kind,
  })));

  return events.map((item) => {
    const requestId = item.match?.demandId ?? null;
    const segment = marketplaceSegmentFromKind(item.listing.kind);
    const href = webListingHref(segment, item.listing.id, requestId);
    return {
      event: item.event,
      cursor: item.cursor,
      match: item.match ? {
        requestId: item.match.demandId,
      } : null,
      listing: {
        id: item.listing.id,
        kind: item.listing.kind,
        originCountry: item.listing.originCountry,
        destinationCountry: item.listing.destinationCountry,
        origin: item.listing.loadingDisplayName,
        destination: item.listing.deliveryDisplayName,
        trailerType: item.listing.trailerType,
        href,
        publicTitle: redactPublicContactDetails(item.listing.publicTitle) ?? "İlan",
        publicDescription: redactPublicContactDetails(item.listing.publicDescription),
        loadingDisplayName: cleanPublicText(item.listing.loadingDisplayName),
        deliveryDisplayName: cleanPublicText(item.listing.deliveryDisplayName),
        vehicleDisplayName: cleanPublicText(item.listing.vehicleDisplayName),
        tonnageDisplay: cleanPublicText(item.listing.tonnageDisplay),
        tonnageAccessibilityLabel: cleanPublicText(item.listing.tonnageAccessibilityLabel),
        vehicleCountDisplay: cleanPublicText(item.listing.vehicleCountDisplay),
        publicAdvertiserName: advertisers.get(listingKey(item.listing.kind, item.listing.id))
          ?? sourceFallback(item.listing.source),
        sourcePlatformDisplay: cleanPublicText(item.listing.sourcePlatformDisplay) ?? sourceLabel(item.listing.source),
        listingSummary: cleanPublicText(item.listing.listingSummary) ?? cleanPublicText(item.listing.publicTitle) ?? "İlan",
        relevantDate: cleanPublicText(item.listing.relevantDate),
        publishedAt: item.listing.publishedAt,
        updatedAt: item.listing.updatedAt,
        status: item.listing.status,
      },
    };
  });
}

export async function serializeWebListingDetail(
  kind: WebMarketplaceKind,
  listingValue: unknown,
  requestId: string | null,
) {
  const listing = asRecord(listingValue);
  const id = requiredText(listing.id);
  const segment = marketplaceSegmentFromKind(kind);
  const source = safeSource(listing.source);
  const advertisers = await resolveSafeWebAdvertisers([{ id, kind }]);
  const publicAdvertiserName = advertisers.get(listingKey(kind, id)) ?? sourceFallback(source);
  const status = cleanPublicText(listing.status) ?? "INACTIVE";
  const active = status === "ACTIVE" && !isExpired(listing.expiresAt);
  const contactPhone = active ? safePublicE164(listing.contactPhone) : null;
  const publicListingUrl = canonicalWebListingUrl(segment, id);
  const listingSummary = cleanPublicText(listing.listingSummary)
    ?? cleanPublicText(listing.publicTitle)
    ?? "İlan";
  const prefilledMessage = contactPhone
    ? buildWhatsAppReferralMessage({ listingSummary, kind, publicListingUrl })
    : null;

  return {
    id,
    kind,
    href: webListingHref(segment, id, requestId),
    requestId,
    status,
    isActive: active,
    publicTitle: redactPublicContactDetails(cleanPublicText(listing.publicTitle)) ?? "İlan",
    publicDescription: redactPublicContactDetails(cleanPublicText(listing.publicDescription)),
    loadingDisplayName: cleanPublicText(listing.loadingDisplayName),
    deliveryDisplayName: cleanPublicText(listing.deliveryDisplayName),
    vehicleDisplayName: cleanPublicText(listing.vehicleDisplayName),
    tonnageDisplay: cleanPublicText(listing.tonnageDisplay),
    tonnageAccessibilityLabel: cleanPublicText(listing.tonnageAccessibilityLabel),
    vehicleCountDisplay: cleanPublicText(listing.vehicleCountDisplay),
    publicAdvertiserName,
    sourcePlatformDisplay: cleanPublicText(listing.sourcePlatformDisplay) ?? sourceLabel(source),
    listingSummary,
    publicListingUrl,
    publishedAt: cleanPublicText(listing.publishedAt),
    updatedAt: cleanPublicText(listing.updatedAt),
    attributes: safeListingAttributes(kind, listing),
    contact: contactPhone && prefilledMessage ? {
      phone: contactPhone,
      telHref: `tel:${contactPhone}`,
      whatsappHref: `https://wa.me/${contactPhone.slice(1)}?text=${encodeURIComponent(prefilledMessage)}`,
      prefilledMessage,
    } : null,
    contactAccess: listing.contactAccess ?? "ALLOWED",
  };
}

export async function webMarketplaceError(error: unknown) {
  const code = error instanceof Error ? error.message : "MARKETPLACE_REQUEST_FAILED";
  if (code === "UNAUTHORIZED") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (code === "CSRF_REJECTED") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (
    code === "FREIGHT_MARKETPLACE_NOT_FOUND"
    || code === "FEATURE_NOT_AVAILABLE"
    || code === "FREIGHT_LISTING_NOT_FOUND"
    || code === "VEHICLE_LISTING_NOT_FOUND"
    || code === "DRIVER_LISTING_NOT_FOUND"
    || code === "MARKETPLACE_REQUEST_NOT_FOUND"
    || code === "MARKETPLACE_MATCH_NOT_FOUND"
  ) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (
    code === "FREIGHT_INVALID_DATE"
    || code === "FREIGHT_LOADING_DATE_PAST"
    || code === "MARKETPLACE_DATE_RANGE_INVALID"
    || code === "FREIGHT_WEIGHT_RANGE_INVALID"
    || code === "MARKETPLACE_REQUEST_CRITERIA_REQUIRED"
    || code === "MARKETPLACE_REQUEST_KIND_FIELDS_INVALID"
  ) {
    return NextResponse.json({ error: code }, { status: 400 });
  }
  return NextResponse.json({ error: "MARKETPLACE_REQUEST_FAILED" }, { status: 500 });
}

export function webListingHref(segment: WebMarketplaceSegment, id: string, requestId?: string | null) {
  const path = `/marketplace/listings/${segment}/${encodeURIComponent(id)}`;
  return requestId ? `${path}?requestId=${encodeURIComponent(requestId)}` : path;
}

function canonicalWebListingUrl(segment: WebMarketplaceSegment, id: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === "https:" && /(^|\.)logivya\.com$/iu.test(parsed.hostname)) {
        return new URL(webListingHref(segment, id), parsed.origin).toString();
      }
    } catch {
      // Fall through to the canonical production origin.
    }
  }
  return new URL(webListingHref(segment, id), "https://www.logivya.com").toString();
}

async function resolveSafeWebAdvertisers(keys: MarketplaceListingKey[]) {
  const unique = new Map(keys.map((item) => [listingKey(item.kind, item.id), item]));
  const loads = [...unique.values()].filter((item) => item.kind === "LOAD").map((item) => item.id);
  const vehicles = [...unique.values()].filter((item) => item.kind === "VEHICLE").map((item) => item.id);
  const drivers = [...unique.values()].filter((item) => item.kind === "DRIVER").map((item) => item.id);
  const [loadRows, vehicleRows, driverRows] = await Promise.all([
    loads.length ? prisma.freightListing.findMany({
      where: { id: { in: loads } },
      select: { id: true, source: true, sourceExtractionId: true, company: { select: { name: true } } },
    }) : Promise.resolve([]),
    vehicles.length ? prisma.vehicleListing.findMany({
      where: { id: { in: vehicles } },
      select: { id: true, source: true, sourceExtractionId: true, company: { select: { name: true } } },
    }) : Promise.resolve([]),
    drivers.length ? prisma.driverListing.findMany({
      where: { id: { in: drivers } },
      select: { id: true, source: true, sourceExtractionId: true, company: { select: { name: true } } },
    }) : Promise.resolve([]),
  ]);
  const rows = [
    ...loadRows.map((row) => ({ ...row, kind: "LOAD" as const })),
    ...vehicleRows.map((row) => ({ ...row, kind: "VEHICLE" as const })),
    ...driverRows.map((row) => ({ ...row, kind: "DRIVER" as const })),
  ];
  const extractionIds = [...new Set(rows.map((row) => row.sourceExtractionId).filter((id): id is string => Boolean(id)))];
  const extractions = extractionIds.length ? await prisma.whatsAppListingExtraction.findMany({
    where: { id: { in: extractionIds } },
    select: { id: true, companyName: true, contactName: true },
  }) : [];
  const extractionById = new Map(extractions.map((row) => [row.id, row]));
  const result = new Map<string, string>();
  for (const row of rows) {
    const source = safeSource(row.source);
    if (source === "LOGIVYA") {
      result.set(listingKey(row.kind, row.id), cleanPublicText(row.company.name) ?? "Logivya İlanı");
      continue;
    }
    const extraction = row.sourceExtractionId ? extractionById.get(row.sourceExtractionId) : null;
    const extracted = safeExtractedAdvertiser(extraction?.companyName)
      ?? safeExtractedAdvertiser(extraction?.contactName);
    result.set(listingKey(row.kind, row.id), extracted ?? sourceFallback(source));
  }
  return result;
}

function safeListingAttributes(kind: WebMarketplaceKind, listing: Record<string, unknown>) {
  const common = {
    relevantDate: cleanPublicText(kind === "LOAD" ? listing.loadingDate : listing.availableFrom),
    availableUntil: cleanPublicText(listing.availableUntil),
    cargoType: cleanPublicText(listing.cargoType),
    priceAmount: finiteNumber(listing.priceAmount ?? listing.salaryAmount),
    currency: safeCurrency(listing.currency),
  };
  if (kind === "LOAD") {
    return {
      ...common,
      customsInfo: cleanPublicText(listing.customsInfo),
      containerStatusDisplay: CONTAINER_STATUS_TR[cleanPublicText(listing.containerStatus) ?? ""] ?? null,
    };
  }
  if (kind === "VEHICLE") {
    return {
      ...common,
      internationalTransport: listing.internationalTransport === true,
      adrSuitable: listing.adrSuitable === true,
    };
  }
  return {
    ...common,
    location: cleanPublicText(listing.location ?? listing.loadingDisplayName),
    preferredRoute: cleanPublicText(listing.preferredRoute),
    listingTypeDisplay: DRIVER_LISTING_TYPE_TR[cleanPublicText(listing.listingType) ?? ""] ?? null,
    licenseClasses: Array.isArray(listing.licenseClasses)
      ? listing.licenseClasses.filter((item): item is string => typeof item === "string").slice(0, 12)
      : [],
    experienceYears: finiteNumber(listing.experienceYears),
    employmentTypeDisplay: EMPLOYMENT_TYPE_TR[cleanPublicText(listing.employmentType) ?? ""] ?? null,
    internationalExperience: listing.internationalExperience === true,
    adrCertificate: listing.adrCertificate === true,
    srcCertificate: listing.srcCertificate === true,
    psychotechnicalCertificate: listing.psychotechnicalCertificate === true,
  };
}

function safeExtractedAdvertiser(value: unknown) {
  const normalized = cleanPublicText(value);
  if (!normalized) return null;
  const comparison = normalized.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("tr-TR");
  if (unsafeAdvertiserNames.has(comparison)) return null;
  if (/@(?:g\.us|s\.whatsapp\.net|lid|broadcast)$/iu.test(normalized)) return null;
  if (/^\+?\d[\d\s().-]{6,}$/u.test(normalized)) return null;
  return normalized.slice(0, 120);
}

function sourceFallback(source: string) {
  if (source === "WHATSAPP") return "WhatsApp İlanı";
  if (source === "TELEGRAM") return "Telegram İlanı";
  return "Logivya İlanı";
}

function sourceLabel(source: string) {
  if (source === "WHATSAPP") return "WhatsApp";
  if (source === "TELEGRAM") return "Telegram";
  return "Logivya";
}

function safeSource(value: unknown): "LOGIVYA" | "WHATSAPP" | "TELEGRAM" {
  return value === "WHATSAPP" || value === "TELEGRAM" ? value : "LOGIVYA";
}

function safePublicE164(value: unknown) {
  const normalized = cleanPublicText(value);
  return normalized && /^\+[1-9]\d{7,14}$/u.test(normalized) ? normalized : null;
}

function cleanPublicText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (!normalized || /^(unknown|null|undefined|n\/a)$/iu.test(normalized)) return null;
  if (/@(?:g\.us|s\.whatsapp\.net|lid|broadcast)(?:\b|$)/iu.test(normalized)) return null;
  return normalized.slice(0, 2_000);
}

function requiredText(value: unknown) {
  const text = cleanPublicText(value);
  if (!text) throw new Error("FREIGHT_LISTING_NOT_FOUND");
  return text;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeCurrency(value: unknown) {
  return typeof value === "string" && /^[A-Z]{3}$/u.test(value) ? value : null;
}

function isExpired(value: unknown) {
  const text = cleanPublicText(value);
  if (!text) return false;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function listingKey(kind: WebMarketplaceKind, id: string) {
  return `${kind}:${id}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("FREIGHT_LISTING_NOT_FOUND");
  return value as Record<string, unknown>;
}

export type WebMarketplaceScope = MarketplaceScope;
