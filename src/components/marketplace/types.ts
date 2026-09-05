export type WebMarketplaceKind = "LOAD" | "VEHICLE" | "DRIVER";

export type WebMarketplaceListing = {
  id: string;
  kind: WebMarketplaceKind;
  href: string;
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
  listingSummary: string;
  relevantDate: string | null;
  publishedAt: string;
  updatedAt: string;
  status: string;
  originCountry?: string | null;
  destinationCountry?: string | null;
  origin?: string | null;
  destination?: string | null;
  trailerType?: string | null;
  match?: { requestId: string } | null;
};

export type WebMarketplaceEvent = {
  event: "listing.created" | "listing.updated" | "listing.expired" | "listing.deleted" | "listing.matched";
  cursor: string;
  match: { requestId: string } | null;
  listing: WebMarketplaceListing;
};

export type WebListingAttributes = {
  relevantDate: string | null;
  availableUntil: string | null;
  cargoType: string | null;
  priceAmount: number | null;
  currency: string | null;
  customsInfo?: string | null;
  containerStatusDisplay?: string | null;
  internationalTransport?: boolean;
  adrSuitable?: boolean;
  location?: string | null;
  preferredRoute?: string | null;
  listingTypeDisplay?: string | null;
  licenseClasses?: string[];
  experienceYears?: number | null;
  employmentTypeDisplay?: string | null;
  internationalExperience?: boolean;
  adrCertificate?: boolean;
  srcCertificate?: boolean;
  psychotechnicalCertificate?: boolean;
};

export type WebMarketplaceListingDetail = Omit<WebMarketplaceListing, "relevantDate"> & {
  requestId: string | null;
  isActive: boolean;
  publicListingUrl: string;
  attributes: WebListingAttributes;
  contact: {
    phone: string;
    telHref: string;
    whatsappHref: string;
    prefilledMessage: string;
  } | null;
  contactAccess?: string;
};

export type WebDemandRequest = {
  id: string;
  kind: WebMarketplaceKind;
  title: string;
  origin: string | null;
  destination: string | null;
  location: string | null;
  availableFrom: string | null;
  availableUntil: string | null;
  trailerType: string | null;
  minWeight: number | null;
  maxWeight: number | null;
  notificationsEnabled: boolean;
  status: string;
  expiresAt: string;
  matchCount: number;
  lastMatchedAt: string | null;
  createdAt: string;
};

export type WebMarketplaceNotification = {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  listingKind: WebMarketplaceKind | null;
  requestId: string | null;
  href: string | null;
};
