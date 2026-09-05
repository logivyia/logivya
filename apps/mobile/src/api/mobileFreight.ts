import { apiClient } from "@/api/client";
import type { MarketplaceFilters } from "../../../../shared/marketplace-filters";

export type FreightAccessAudience = "public" | "internal" | null;
export type FreightListingStatus = "ACTIVE" | "COMPLETED" | "INACTIVE" | "EXPIRED";
export type FreightTrailerType =
  | "CURTAINSIDER"
  | "OPEN_TRAILER"
  | "CLOSED_TRAILER"
  | "REFRIGERATED"
  | "CONTAINER"
  | "LOWBED"
  | "TRUCK"
  | "VAN"
  | "OTHER";
export type FreightContainerStatus = "NONE" | "ONE_WAY" | "RETURN_REQUIRED";
export type DriverListingType = "DRIVER_AVAILABLE" | "DRIVER_WANTED";
export type DriverEmploymentType =
  "FULL_TIME" | "PART_TIME" | "CONTRACT" | "DAILY";
export type DriverLicenseClass = "B" | "C" | "CE" | "D" | "DE";
export type MarketplaceScope = "GLOBAL" | "HOME_MOVING" | "PARTIAL_LOAD" | "HEAVY_HAUL";
export type LogisticsSector = "GENERAL_LOGISTICS" | "HOME_MOVING" | "PARTIAL_LOAD" | "HEAVY_HAUL";
export type SectorDetails = Record<string, unknown>;

export type PublicListingSummaryFields = {
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
  contactAccess?: string;
};

export type MobileFreightListing = PublicListingSummaryFields & {
  id: string;
  companyId: string;
  ownerUserId: string;
  source: SmartMatchSource;
  primarySector: LogisticsSector | "MULTI_SECTOR" | "UNKNOWN" | "NON_LOGISTICS";
  marketplaceScopes: MarketplaceScope[];
  sectorDetails: SectorDetails | null;
  origin: string;
  destination: string;
  loadingDate: string;
  cargoType: string | null;
  weight: number | null;
  weightUnit: "METRIC_TONNE";
  trailerType: FreightTrailerType;
  vehicleCount: number;
  priceAmount: number | null;
  currency: string | null;
  customsInfo: string | null;
  containerStatus: FreightContainerStatus;
  description: string | null;
  contactPhone: string | null;
  status: FreightListingStatus;
  companyName: string;
  ownerName: string;
  publishedAt: string;
  completedAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FreightListingPayload = {
  origin: string;
  destination: string;
  loadingDate: string;
  cargoType?: string | null;
  weight?: number | null;
  trailerType: FreightTrailerType;
  vehicleCount: number;
  priceAmount?: number | null;
  currency?: string | null;
  customsInfo?: string | null;
  containerStatus: FreightContainerStatus;
  description?: string | null;
  contactPhone: string;
  primarySector?: LogisticsSector;
  sectorDetails?: SectorDetails | null;
  clientRequestId?: string;
};

export type FreightSearchFilters = {
  q?: string;
  origin?: string;
  destination?: string;
  loadingDate?: string;
  trailerType?: FreightTrailerType;
  minWeight?: number;
  maxWeight?: number;
  scope?: MarketplaceScope;
  cursor?: string;
  limit?: number;
};

export type FreightPage = {
  listings: MobileFreightListing[];
  pageInfo: { hasMore: boolean; nextCursor: string | null };
};

export type MobileVehicleListing = PublicListingSummaryFields & {
  id: string;
  kind: "VEHICLE";
  companyId: string;
  ownerUserId: string;
  source: SmartMatchSource;
  primarySector: LogisticsSector | "MULTI_SECTOR" | "UNKNOWN" | "NON_LOGISTICS";
  marketplaceScopes: MarketplaceScope[];
  sectorDetails: SectorDetails | null;
  origin: string;
  destination: string | null;
  availableFrom: string;
  availableUntil: string | null;
  trailerType: FreightTrailerType;
  capacityWeight: number | null;
  weightUnit: "METRIC_TONNE";
  vehicleCount: number;
  internationalTransport: boolean;
  adrSuitable: boolean;
  priceAmount: number | null;
  currency: string | null;
  description: string | null;
  contactPhone: string | null;
  status: FreightListingStatus;
  companyName: string;
  ownerName: string;
  publishedAt: string;
  completedAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VehicleListingPayload = {
  origin: string;
  destination?: string | null;
  availableFrom: string;
  availableUntil?: string | null;
  trailerType: FreightTrailerType;
  capacityWeight?: number | null;
  vehicleCount: number;
  internationalTransport: boolean;
  adrSuitable: boolean;
  priceAmount?: number | null;
  currency?: string | null;
  description?: string | null;
  contactPhone: string;
  primarySector?: LogisticsSector;
  sectorDetails?: SectorDetails | null;
  clientRequestId?: string;
};

export type VehicleSearchFilters = {
  q?: string;
  origin?: string;
  destination?: string;
  availableFrom?: string;
  trailerType?: FreightTrailerType;
  internationalTransport?: boolean;
  adrSuitable?: boolean;
  scope?: MarketplaceScope;
  cursor?: string;
  limit?: number;
};

export type MobileDriverListing = PublicListingSummaryFields & {
  id: string;
  kind: "DRIVER";
  companyId: string;
  ownerUserId: string;
  source: SmartMatchSource;
  primarySector: LogisticsSector | "MULTI_SECTOR" | "UNKNOWN" | "NON_LOGISTICS";
  marketplaceScopes: MarketplaceScope[];
  sectorDetails: SectorDetails | null;
  listingType: DriverListingType;
  title: string;
  location: string;
  preferredRoute: string | null;
  availableFrom: string;
  licenseClasses: DriverLicenseClass[];
  experienceYears: number;
  employmentType: DriverEmploymentType;
  internationalExperience: boolean;
  adrCertificate: boolean;
  srcCertificate: boolean;
  psychotechnicalCertificate: boolean;
  salaryAmount: number | null;
  currency: string | null;
  description: string | null;
  contactPhone: string | null;
  status: FreightListingStatus;
  companyName: string;
  ownerName: string;
  publishedAt: string;
  completedAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DriverListingPayload = {
  listingType: DriverListingType;
  title: string;
  location: string;
  preferredRoute?: string | null;
  availableFrom: string;
  licenseClasses: DriverLicenseClass[];
  experienceYears: number;
  employmentType: DriverEmploymentType;
  internationalExperience: boolean;
  adrCertificate: boolean;
  srcCertificate: boolean;
  psychotechnicalCertificate: boolean;
  salaryAmount?: number | null;
  currency?: string | null;
  description?: string | null;
  contactPhone: string;
  primarySector?: LogisticsSector;
  sectorDetails?: SectorDetails | null;
  clientRequestId?: string;
};

export type DriverSearchFilters = {
  q?: string;
  listingType?: DriverListingType;
  location?: string;
  licenseClass?: DriverLicenseClass;
  employmentType?: DriverEmploymentType;
  internationalExperience?: boolean;
  scope?: MarketplaceScope;
  cursor?: string;
  limit?: number;
};

export type VehiclePage = {
  listings: MobileVehicleListing[];
  pageInfo: FreightPage["pageInfo"];
};
export type DriverPage = {
  listings: MobileDriverListing[];
  pageInfo: FreightPage["pageInfo"];
};

export type MarketplaceRequestKind = "LOAD" | "VEHICLE" | "DRIVER";
export type MarketplaceRequestStatus = "ACTIVE" | "PAUSED" | "FULFILLED" | "EXPIRED";
export type MarketplaceMatchStatus = "NEW" | "VIEWED" | "SAVED" | "DISMISSED" | "EXPIRED";
export type SmartMatchSource = "LOGIVYA" | "WHATSAPP" | "TELEGRAM";
export type SmartMatchingJobStatus = "QUEUED" | "RUNNING" | "PARTIAL" | "COMPLETED" | "FAILED" | "CANCELLED";

export type SmartMatchingProgress = {
  id: string;
  status: SmartMatchingJobStatus;
  requestedSources: SmartMatchSource[];
  completedSources: SmartMatchSource[];
  groupsProcessed: number;
  messagesAnalyzed: number;
  candidatesDetected: number;
  matchesFound: number;
  duplicatesRemoved: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type MarketplaceDemandRequestPayload = {
  kind: MarketplaceRequestKind;
  title: string;
  primarySector?: LogisticsSector;
  sectorCriteria?: SectorDetails | null;
  keywords: string[];
  origin?: string | null;
  destination?: string | null;
  originCountry?: string | null;
  originCity?: string | null;
  originDistrict?: string | null;
  destinationCountry?: string | null;
  destinationCity?: string | null;
  destinationDistrict?: string | null;
  location?: string | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  trailerType?: FreightTrailerType | null;
  vehicleCategory?: string | null;
  vehicleBodyLength?: number | null;
  requiredPlateCountry?: string | null;
  transitRoute?: string | null;
  cargoType?: string | null;
  minWeight?: number | null;
  maxWeight?: number | null;
  driverListingType?: DriverListingType | null;
  licenseClasses: DriverLicenseClass[];
  employmentType?: DriverEmploymentType | null;
  internationalRequired: boolean;
  adrRequired: boolean;
  notificationsEnabled: boolean;
  expiresInDays: number;
  clientRequestId?: string;
};

export type MarketplaceDemandRequest = Omit<MarketplaceDemandRequestPayload, "expiresInDays" | "clientRequestId"> & {
  id: string;
  companyId: string;
  ownerUserId: string;
  status: MarketplaceRequestStatus;
  expiresAt: string;
  matchCount: number;
  lastMatchedAt: string | null;
  smartMatching: SmartMatchingProgress | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceDemandMatch = {
  id: string;
  requestId: string;
  listingKind: MarketplaceRequestKind;
  listingId: string;
  score: number;
  reasons: string[];
  status: MarketplaceMatchStatus;
  matchedAt: string;
  sourcePlatform: SmartMatchSource;
  sourceCount: number;
  provenance: Array<{
    platform: SmartMatchSource;
    groupId?: string;
    groupName: string;
    sourceMessageId: string | null;
    publishedAt: string;
  }>;
  explanation: Array<{ code?: string; status?: string; score?: number; weight?: number }>;
  listing: {
    id: string;
    kind: MarketplaceRequestKind;
    title: string;
    detail: string;
    date: string | null;
    companyName: string;
    contactPhone: string | null;
    contactType?: "PHONE" | "TELEGRAM" | null;
    canCall?: boolean;
    canOpenWhatsApp?: boolean;
    contactAccess?: "ALLOWED" | "SUBSCRIPTION_REQUIRED";
    whatsappPrefilledMessage?: string | null;
    telegramHref?: string | null;
    sourceExcerpt?: string | null;
    status: FreightListingStatus;
  };
};

export type MarketplaceDemandRequestPage = {
  requests: MarketplaceDemandRequest[];
  pageInfo: FreightPage["pageInfo"];
};

export type MarketplaceDemandMatchPage = {
  matches: MarketplaceDemandMatch[];
  pageInfo: FreightPage["pageInfo"];
};

export type LiveMarketplaceListing = PublicListingSummaryFields & {
  originCountry?: string | null;
  destinationCountry?: string | null;
  id: string;
  kind: MarketplaceRequestKind;
  source: SmartMatchSource;
  sourceLabel: string;
  eventVersion: 1;
  companyName: string;
  title: string;
  description: string | null;
  origin: string | null;
  destination: string | null;
  trailerType: FreightTrailerType | null;
  vehicleBodyLength: number | null;
  tonnage: number | null;
  relevantDate: string | null;
  status: FreightListingStatus;
  publishedAt: string;
  updatedAt: string;
};

export type LiveMarketplaceEvent = {
  event: "listing.created" | "listing.updated" | "listing.expired" | "listing.deleted" | "listing.matched";
  cursor: string;
  match?: { demandId: string };
  listing: LiveMarketplaceListing;
};

function queryString(
  values: Record<string, string | number | boolean | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && String(value).trim() !== "")
      query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

export function getFreightAccess() {
  return apiClient.request<{
    enabled: boolean;
    audience: FreightAccessAudience;
  }>("/api/mobile/freight/access", { retry: false });
}

export function searchFreightListings(filters: FreightSearchFilters = {}) {
  return apiClient.request<FreightPage & { sort: string }>(
    `/api/mobile/freight/listings${queryString(filters)}`,
  );
}

export function getMyFreightListings(
  status: FreightListingStatus,
  cursor?: string | null,
  limit = 20,
  scope?: MarketplaceScope,
  sector?: LogisticsSector,
) {
  return apiClient.request<FreightPage>(
    `/api/mobile/freight/listings/mine${queryString({ status, cursor: cursor ?? undefined, limit, scope, sector })}`,
  );
}

export function getFreightListing(id: string, requestId?: string) {
  return apiClient.request<{ listing: MobileFreightListing; requestId: string | null }>(
    `/api/mobile/freight/listings/${encodeURIComponent(id)}${queryString({ requestId })}`,
  );
}

export function createFreightListing(payload: FreightListingPayload) {
  return apiClient.post<{ listing: MobileFreightListing; duplicate: boolean }>(
    "/api/mobile/freight/listings",
    payload,
  );
}

export function updateFreightListing(
  id: string,
  payload: Partial<FreightListingPayload>,
) {
  const { clientRequestId: _clientRequestId, ...update } = payload;
  return apiClient.patch<{ listing: MobileFreightListing }>(
    `/api/mobile/freight/listings/${id}`,
    update,
  );
}

export function updateFreightListingStatus(
  id: string,
  status: FreightListingStatus,
) {
  return apiClient.patch<{ listing: MobileFreightListing }>(
    `/api/mobile/freight/listings/${id}/status`,
    { status },
  );
}

export function searchVehicleListings(filters: VehicleSearchFilters = {}) {
  return apiClient.request<VehiclePage>(
    `/api/mobile/freight/vehicle-listings${queryString(filters)}`,
  );
}

export function getMyVehicleListings(
  status: FreightListingStatus,
  cursor?: string | null,
  limit = 20,
  scope?: MarketplaceScope,
  sector?: LogisticsSector,
) {
  return apiClient.request<VehiclePage>(
    `/api/mobile/freight/vehicle-listings/mine${queryString({ status, cursor: cursor ?? undefined, limit, scope, sector })}`,
  );
}

export function getVehicleListing(id: string, requestId?: string) {
  return apiClient.request<{ listing: MobileVehicleListing; requestId: string | null }>(
    `/api/mobile/freight/vehicle-listings/${encodeURIComponent(id)}${queryString({ requestId })}`,
  );
}

export function createVehicleListing(payload: VehicleListingPayload) {
  return apiClient.post<{ listing: MobileVehicleListing; duplicate: boolean }>(
    "/api/mobile/freight/vehicle-listings",
    payload,
  );
}

export function updateVehicleListing(
  id: string,
  payload: Partial<VehicleListingPayload>,
) {
  const { clientRequestId: _clientRequestId, ...update } = payload;
  return apiClient.patch<{ listing: MobileVehicleListing }>(
    `/api/mobile/freight/vehicle-listings/${id}`,
    update,
  );
}

export function updateVehicleListingStatus(
  id: string,
  status: FreightListingStatus,
) {
  return apiClient.patch<{ listing: MobileVehicleListing }>(
    `/api/mobile/freight/vehicle-listings/${id}`,
    { status },
  );
}

export function searchDriverListings(filters: DriverSearchFilters = {}) {
  return apiClient.request<DriverPage>(
    `/api/mobile/freight/driver-listings${queryString(filters)}`,
  );
}

export function getMyDriverListings(
  status: FreightListingStatus,
  cursor?: string | null,
  limit = 20,
  scope?: MarketplaceScope,
  sector?: LogisticsSector,
) {
  return apiClient.request<DriverPage>(
    `/api/mobile/freight/driver-listings/mine${queryString({ status, cursor: cursor ?? undefined, limit, scope, sector })}`,
  );
}

export function getDriverListing(id: string, requestId?: string) {
  return apiClient.request<{ listing: MobileDriverListing; requestId: string | null }>(
    `/api/mobile/freight/driver-listings/${encodeURIComponent(id)}${queryString({ requestId })}`,
  );
}

export function createDriverListing(payload: DriverListingPayload) {
  return apiClient.post<{ listing: MobileDriverListing; duplicate: boolean }>(
    "/api/mobile/freight/driver-listings",
    payload,
  );
}

export function updateDriverListing(
  id: string,
  payload: Partial<DriverListingPayload>,
) {
  const { clientRequestId: _clientRequestId, ...update } = payload;
  return apiClient.patch<{ listing: MobileDriverListing }>(
    `/api/mobile/freight/driver-listings/${id}`,
    update,
  );
}

export function updateDriverListingStatus(
  id: string,
  status: FreightListingStatus,
) {
  return apiClient.patch<{ listing: MobileDriverListing }>(
    `/api/mobile/freight/driver-listings/${id}`,
    { status },
  );
}

export function getMarketplaceDemandRequests(status?: MarketplaceRequestStatus, scope?: MarketplaceScope) {
  return apiClient.request<MarketplaceDemandRequestPage>(
    `/api/mobile/freight/requests${queryString({ status, scope, limit: 50 })}`,
  );
}

export function createMarketplaceDemandRequest(payload: MarketplaceDemandRequestPayload) {
  return apiClient.post<{
    request: MarketplaceDemandRequest;
    duplicate: boolean;
    initialMatches: number;
    smartMatchingStarted: boolean;
    smartMatchingJob: Pick<SmartMatchingProgress, "id" | "status" | "requestedSources" | "createdAt">;
  }>("/api/mobile/freight/requests", payload);
}

export function updateMarketplaceDemandRequestStatus(id: string, status: Exclude<MarketplaceRequestStatus, "EXPIRED">) {
  return apiClient.patch<{ request: MarketplaceDemandRequest }>(
    `/api/mobile/freight/requests/${id}`,
    { status },
  );
}

export function updateMarketplaceDemandRequestNotifications(id: string, notificationsEnabled: boolean) {
  return apiClient.patch<{ request: MarketplaceDemandRequest }>(
    `/api/mobile/freight/requests/${id}`,
    { notificationsEnabled },
  );
}

export function updateMarketplaceDemandRequest(id: string, payload: Omit<MarketplaceDemandRequestPayload, "clientRequestId">) {
  return apiClient.patch<{ request: MarketplaceDemandRequest }>(`/api/mobile/freight/requests/${id}`, payload);
}

export function deleteMarketplaceDemandRequest(id: string) {
  return apiClient.delete<{ id: string; deleted: true }>(`/api/mobile/freight/requests/${id}`);
}

export function getMarketplaceDemandMatches(requestId: string, cursor?: string | null) {
  return apiClient.request<MarketplaceDemandMatchPage>(
    `/api/mobile/freight/requests/${requestId}/matches${queryString({ cursor: cursor ?? undefined, limit: 50 })}`,
  );
}

export function getLiveMarketplaceEvents(after?: string, limit = 1_000, scope: MarketplaceScope = "GLOBAL", filters?: MarketplaceFilters) {
  return apiClient.request<{ events: LiveMarketplaceEvent[]; cursor: string }>(
    `/api/mobile/freight/listings/live${queryString({ after, limit, scope, ...filters })}`,
    { retry: false },
  );
}

export function markMarketplaceDemandMatchesViewed(requestId: string) {
  return apiClient.patch<{ updatedCount: number; viewedAt: string }>(
    `/api/mobile/freight/requests/${requestId}/matches`,
    {},
  );
}

export function updateMarketplaceDemandMatchStatus(requestId: string, matchId: string, status: "SAVED" | "DISMISSED") {
  return apiClient.patch<{ id: string; status: MarketplaceMatchStatus; savedAt: string | null; dismissedAt: string | null }>(
    `/api/mobile/freight/requests/${requestId}/matches/${matchId}`,
    { status },
  );
}
