export const FREIGHT_PUBLIC_FLAG = "freight_marketplace_public";
export const FREIGHT_INTERNAL_FLAG = "freight_marketplace_internal";
export const FREIGHT_INTERNAL_PERMISSION = "freight_marketplace_internal_access";

export const FREIGHT_TRAILER_TYPES = [
  "CURTAINSIDER",
  "OPEN_TRAILER",
  "CLOSED_TRAILER",
  "REFRIGERATED",
  "CONTAINER",
  "LOWBED",
  "TRUCK",
  "VAN",
  "OTHER",
] as const;

export const FREIGHT_CONTAINER_STATUSES = ["NONE", "ONE_WAY", "RETURN_REQUIRED"] as const;
export const FREIGHT_LISTING_STATUSES = ["ACTIVE", "COMPLETED", "INACTIVE", "EXPIRED"] as const;
export const FREIGHT_WEIGHT_UNIT = "METRIC_TONNE" as const;
export const DRIVER_LISTING_TYPES = ["DRIVER_AVAILABLE", "DRIVER_WANTED"] as const;
export const DRIVER_EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "DAILY"] as const;
export const DRIVER_LICENSE_CLASSES = ["B", "C", "CE", "D", "DE"] as const;
export const MARKETPLACE_SCOPES = ["GLOBAL", "HOME_MOVING", "PARTIAL_LOAD", "HEAVY_HAUL"] as const;
export const MANUAL_LOGISTICS_SECTORS = ["GENERAL_LOGISTICS", "HOME_MOVING", "PARTIAL_LOAD", "HEAVY_HAUL"] as const;

export type FreightTrailerTypeValue = (typeof FREIGHT_TRAILER_TYPES)[number];
export type FreightContainerStatusValue = (typeof FREIGHT_CONTAINER_STATUSES)[number];
export type FreightListingStatusValue = (typeof FREIGHT_LISTING_STATUSES)[number];
export type DriverListingTypeValue = (typeof DRIVER_LISTING_TYPES)[number];
export type DriverEmploymentTypeValue = (typeof DRIVER_EMPLOYMENT_TYPES)[number];
export type MarketplaceScopeValue = (typeof MARKETPLACE_SCOPES)[number];
export type ManualLogisticsSectorValue = (typeof MANUAL_LOGISTICS_SECTORS)[number];
