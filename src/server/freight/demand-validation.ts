import { z } from "zod";

import {
  DRIVER_EMPLOYMENT_TYPES,
  DRIVER_LICENSE_CLASSES,
  DRIVER_LISTING_TYPES,
  FREIGHT_TRAILER_TYPES,
  MANUAL_LOGISTICS_SECTORS,
  MARKETPLACE_SCOPES,
} from "@/server/freight/constants";

export const MARKETPLACE_REQUEST_KINDS = ["LOAD", "VEHICLE", "DRIVER"] as const;
export const MARKETPLACE_REQUEST_STATUSES = ["ACTIVE", "PAUSED", "FULFILLED", "EXPIRED"] as const;

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().nullable();
const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "FREIGHT_INVALID_DATE").optional().nullable();
const optionalWeight = z.coerce.number().finite().positive().max(200).optional().nullable();
const boundedSectorCriteria = z.record(z.string().trim().min(1).max(80), z.unknown())
  .superRefine((value, context) => {
    if (JSON.stringify(value).length > 20_000) {
      context.addIssue({ code: "custom", message: "MARKETPLACE_SECTOR_DETAILS_TOO_LARGE" });
    }
  })
  .optional()
  .nullable();

const demandRequestFields = z.object({
  kind: z.enum(MARKETPLACE_REQUEST_KINDS),
  title: z.string().trim().min(3).max(140),
  primarySector: z.enum(MANUAL_LOGISTICS_SECTORS).default("GENERAL_LOGISTICS"),
  sectorCriteria: boundedSectorCriteria,
  keywords: z.array(z.string().trim().min(2).max(40)).max(5).default([]),
  origin: optionalText(160),
  destination: optionalText(160),
  originCountry: optionalText(80),
  originCity: optionalText(120),
  originDistrict: optionalText(120),
  destinationCountry: optionalText(80),
  destinationCity: optionalText(120),
  destinationDistrict: optionalText(120),
  location: optionalText(160),
  availableFrom: optionalDate,
  availableUntil: optionalDate,
  trailerType: z.enum(FREIGHT_TRAILER_TYPES).optional().nullable(),
  vehicleCategory: optionalText(80),
  vehicleBodyLength: z.coerce.number().finite().positive().max(40).optional().nullable(),
  requiredPlateCountry: optionalText(80),
  transitRoute: optionalText(500),
  cargoType: optionalText(120),
  minWeight: optionalWeight,
  maxWeight: optionalWeight,
  driverListingType: z.enum(DRIVER_LISTING_TYPES).optional().nullable(),
  licenseClasses: z.array(z.enum(DRIVER_LICENSE_CLASSES)).max(DRIVER_LICENSE_CLASSES.length).default([]),
  employmentType: z.enum(DRIVER_EMPLOYMENT_TYPES).optional().nullable(),
  internationalRequired: z.boolean().default(false),
  adrRequired: z.boolean().default(false),
  notificationsEnabled: z.boolean().default(true),
  expiresInDays: z.coerce.number().int().min(1).max(180).default(30),
  clientRequestId: z.string().trim().min(16).max(100).optional(),
}).strict();

function validateDemandCriteria(value: z.infer<typeof demandRequestFields>, context: z.RefinementCtx) {
  if (value.availableFrom && value.availableUntil && value.availableUntil < value.availableFrom) {
    context.addIssue({ code: "custom", path: ["availableUntil"], message: "MARKETPLACE_DATE_RANGE_INVALID" });
  }
  if (value.minWeight != null && value.maxWeight != null && value.minWeight > value.maxWeight) {
    context.addIssue({ code: "custom", path: ["maxWeight"], message: "FREIGHT_WEIGHT_RANGE_INVALID" });
  }

  const hasRouteCriteria = Boolean(
    value.origin || value.destination || value.originCountry || value.originCity || value.destinationCountry || value.destinationCity
      || value.trailerType || value.vehicleCategory || value.requiredPlateCountry || value.transitRoute || value.cargoType || value.availableFrom || value.availableUntil
      || value.minWeight != null || value.maxWeight != null || value.keywords.length || Object.keys(value.sectorCriteria ?? {}).length,
  );
  const hasDriverCriteria = Boolean(
    value.location || value.availableFrom || value.availableUntil || value.driverListingType
      || value.licenseClasses.length || value.employmentType || value.internationalRequired
      || value.adrRequired || value.keywords.length || Object.keys(value.sectorCriteria ?? {}).length,
  );
  if ((value.kind === "LOAD" || value.kind === "VEHICLE") && !hasRouteCriteria) {
    context.addIssue({ code: "custom", path: ["origin"], message: "MARKETPLACE_REQUEST_CRITERIA_REQUIRED" });
  }
  if (value.kind === "DRIVER" && !hasDriverCriteria) {
    context.addIssue({ code: "custom", path: ["location"], message: "MARKETPLACE_REQUEST_CRITERIA_REQUIRED" });
  }

  if (value.kind === "DRIVER" && (value.origin || value.destination || value.originCountry || value.originCity || value.destinationCountry || value.destinationCity || value.trailerType || value.minWeight != null || value.maxWeight != null)) {
    context.addIssue({ code: "custom", path: ["kind"], message: "MARKETPLACE_REQUEST_KIND_FIELDS_INVALID" });
  }
  if (value.kind !== "DRIVER" && (value.location || value.driverListingType || value.licenseClasses.length || value.employmentType)) {
    context.addIssue({ code: "custom", path: ["kind"], message: "MARKETPLACE_REQUEST_KIND_FIELDS_INVALID" });
  }
  if (value.kind === "LOAD" && (value.internationalRequired || value.adrRequired)) {
    context.addIssue({ code: "custom", path: ["kind"], message: "MARKETPLACE_REQUEST_KIND_FIELDS_INVALID" });
  }
}

export const createDemandRequestSchema = demandRequestFields.superRefine(validateDemandCriteria);
export const updateDemandRequestSchema = demandRequestFields.omit({ clientRequestId: true }).superRefine(validateDemandCriteria);

export const demandRequestListSchema = z.object({
  status: z.enum(MARKETPLACE_REQUEST_STATUSES).optional(),
  scope: z.enum(MARKETPLACE_SCOPES).optional(),
  cursor: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const demandRequestStatusSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "FULFILLED"]),
}).strict();

export const demandRequestNotificationSchema = z.object({
  notificationsEnabled: z.boolean(),
}).strict();

export const demandMatchListSchema = z.object({
  cursor: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const smartMatchResultStatusSchema = z.object({
  status: z.enum(["SAVED", "DISMISSED"]),
}).strict();

export type CreateDemandRequestInput = z.infer<typeof createDemandRequestSchema>;
export type UpdateDemandRequestInput = z.infer<typeof updateDemandRequestSchema>;
export type DemandRequestListInput = z.infer<typeof demandRequestListSchema>;
export type DemandMatchListInput = z.infer<typeof demandMatchListSchema>;
