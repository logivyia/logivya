export type PublicMarketplaceListingKind = "LOAD" | "VEHICLE" | "DRIVER";
export type PublicMarketplaceSource = "LOGIVYA" | "WHATSAPP" | "TELEGRAM";

const VEHICLE_LABELS_TR: Record<string, string> = {
  CURTAINSIDER: "Tenteli",
  OPEN_TRAILER: "Açık Kasa",
  FLATBED: "Açık Kasa",
  CLOSED_TRAILER: "Kapalı Kasa",
  CLOSED_BODY: "Kapalı Kasa",
  REFRIGERATED: "Frigo",
  CONTAINER: "Konteyner",
  LOWBED: "Lowbed",
  TRUCK: "Kamyon",
  VAN: "Panelvan",
};

const SOURCE_LABELS_TR: Record<PublicMarketplaceSource, string> = {
  LOGIVYA: "Logivya",
  WHATSAPP: "WhatsApp",
  TELEGRAM: "Telegram",
};

const UNSAFE_INGESTION_IDENTITIES = new Set([
  "burak idim",
  "burak ıdım",
  "burak idım",
  "burak ıdim",
  "burak i̇di̇m",
  "super admin",
  "superadmin",
  "logivya super admin",
]);

export type PublicListingSummaryInput = {
  id: string;
  kind: PublicMarketplaceListingKind;
  source: PublicMarketplaceSource;
  companyName?: string | null;
  explicitCompanyName?: string | null;
  explicitAdvertiserName?: string | null;
  title?: string | null;
  description?: string | null;
  origin?: string | null;
  destination?: string | null;
  trailerType?: string | null;
  tonnage?: number | null;
  tonnageMin?: number | null;
  tonnageMax?: number | null;
  vehicleCount?: number | null;
  contactPhone?: string | null;
  publicListingUrl?: string | null;
};

export type PublicListingSummary = {
  publicTitle: string;
  publicDescription: string | null;
  loadingDisplayName: string | null;
  deliveryDisplayName: string | null;
  vehicleDisplayName: string | null;
  tonnageDisplay: string | null;
  tonnageAccessibilityLabel: string | null;
  vehicleCountDisplay: string | null;
  publicAdvertiserName: string;
  sourcePlatformDisplay: string;
  publicListingUrl: string | null;
  canCall: boolean;
  canOpenWhatsApp: boolean;
  listingSummary: string;
  listingTypeNoun: string;
  whatsappPrefilledMessage: string | null;
};

export function buildPublicListingSummary(input: PublicListingSummaryInput): PublicListingSummary {
  const loadingDisplayName = publicText(input.origin);
  const deliveryDisplayName = publicText(input.destination);
  const vehicleDisplayName = publicVehicleDisplayName(input.trailerType);
  const tonnageDisplay = formatPublicTonnage({
    value: input.tonnage,
    min: input.tonnageMin,
    max: input.tonnageMax,
  });
  const publicTitle = buildPublicListingTitle({
    kind: input.kind,
    title: input.title,
    origin: loadingDisplayName,
    destination: deliveryDisplayName,
    vehicleDisplayName,
  });
  const publicAdvertiserName = resolvePublicAdvertiserName({
    source: input.source,
    companyName: input.companyName,
    explicitCompanyName: input.explicitCompanyName,
    explicitAdvertiserName: input.explicitAdvertiserName,
  });
  const listingSummary = [
    buildRouteLabel(loadingDisplayName, deliveryDisplayName),
    tonnageDisplay,
    vehicleDisplayName,
  ].filter((value): value is string => Boolean(value)).join(", ") || publicTitle;
  const publicListingUrl = validPublicListingUrl(input.publicListingUrl);
  const contactAvailable = Boolean(publicText(input.contactPhone));

  return {
    publicTitle,
    publicDescription: publicText(input.description),
    loadingDisplayName,
    deliveryDisplayName,
    vehicleDisplayName,
    tonnageDisplay,
    tonnageAccessibilityLabel: tonnageDisplay ? tonnageDisplay.replace(/T$/u, " ton").replace(/T/gu, " ton") : null,
    vehicleCountDisplay: input.vehicleCount && input.vehicleCount > 1 ? `${input.vehicleCount} araç` : null,
    publicAdvertiserName,
    sourcePlatformDisplay: SOURCE_LABELS_TR[input.source],
    publicListingUrl,
    canCall: contactAvailable,
    canOpenWhatsApp: contactAvailable,
    listingSummary,
    listingTypeNoun: listingTypeNoun(input.kind),
    whatsappPrefilledMessage: contactAvailable
      ? buildWhatsAppReferralMessage({ listingSummary, kind: input.kind, publicListingUrl })
      : null,
  };
}

export function publicVehicleDisplayName(value: string | null | undefined) {
  const normalized = publicText(value)?.toUpperCase();
  if (!normalized || normalized === "OTHER" || normalized === "UNKNOWN") return null;
  return VEHICLE_LABELS_TR[normalized] ?? null;
}

export function formatPublicTonnage(input: { value?: number | null; min?: number | null; max?: number | null }) {
  const value = meaningfulTonnage(input.value);
  const min = meaningfulTonnage(input.min);
  const max = meaningfulTonnage(input.max);
  if (value != null) return `${formatNumber(value)}T`;
  if (min != null && max != null && min !== max) return `${formatNumber(min)}-${formatNumber(max)}T`;
  if (min != null) return `${formatNumber(min)}T`;
  if (max != null) return `0-${formatNumber(max)}T`;
  return null;
}

export function buildPublicListingTitle(input: {
  kind: PublicMarketplaceListingKind;
  title?: string | null;
  origin?: string | null;
  destination?: string | null;
  vehicleDisplayName?: string | null;
}) {
  if (input.kind === "DRIVER") return publicText(input.title) ?? publicText(input.origin) ?? "Şoför ilanı";
  const route = buildRouteLabel(publicText(input.origin), publicText(input.destination));
  const supportedVehicle = publicText(input.vehicleDisplayName);
  if (route && supportedVehicle) return `${route} ${supportedVehicle}`;
  if (route) return route;
  return publicText(input.title) ?? (input.kind === "VEHICLE" ? "Araç ilanı" : "Yük ilanı");
}

export function resolvePublicAdvertiserName(input: {
  source: PublicMarketplaceSource;
  companyName?: string | null;
  explicitCompanyName?: string | null;
  explicitAdvertiserName?: string | null;
}) {
  if (input.source === "LOGIVYA") return safeAdvertiser(input.companyName) ?? "Logivya İlanı";
  const explicit = safeAdvertiser(input.explicitCompanyName) ?? safeAdvertiser(input.explicitAdvertiserName);
  if (explicit) return explicit;
  return input.source === "WHATSAPP" ? "WhatsApp İlanı" : "Telegram İlanı";
}

export function buildWhatsAppReferralMessage(input: {
  listingSummary: string;
  kind: PublicMarketplaceListingKind;
  publicListingUrl?: string | null;
}) {
  const summary = publicText(input.listingSummary) ?? "ilan";
  const base = `Merhaba, logivya.com'da yer alan “${summary}” ${listingTypeNoun(input.kind)} için yazıyorum.`;
  const url = validPublicListingUrl(input.publicListingUrl);
  return url ? `${base}\n\n${url}` : base;
}

function listingTypeNoun(kind: PublicMarketplaceListingKind) {
  if (kind === "LOAD") return "yük ilanınız";
  if (kind === "VEHICLE") return "araç ilanınız";
  return "şoför ilanınız";
}

function buildRouteLabel(origin: string | null, destination: string | null) {
  if (origin && destination) return `${origin} → ${destination}`;
  return origin ?? destination;
}

function meaningfulTonnage(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2, useGrouping: false }).format(value);
}

function safeAdvertiser(value: string | null | undefined) {
  const normalized = publicText(value);
  if (!normalized) return null;
  const comparison = normalized.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("tr-TR");
  return UNSAFE_INGESTION_IDENTITIES.has(comparison) ? null : normalized.slice(0, 120);
}

function publicText(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (!normalized || /^(unknown|null|undefined|n\/a)$/iu.test(normalized)) return null;
  return normalized;
}

function validPublicListingUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !/(^|\.)logivya\.com$/iu.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
