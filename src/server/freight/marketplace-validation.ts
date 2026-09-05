import { z } from "zod";

import {
  DRIVER_EMPLOYMENT_TYPES,
  DRIVER_LICENSE_CLASSES,
  DRIVER_LISTING_TYPES,
  FREIGHT_LISTING_STATUSES,
  FREIGHT_TRAILER_TYPES,
  MANUAL_LOGISTICS_SECTORS,
  MARKETPLACE_SCOPES,
} from "@/server/freight/constants";

const trimmedText = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().nullable();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "FREIGHT_INVALID_DATE");
const optionalMoney = z.coerce.number().finite().positive().max(1_000_000_000).optional().nullable();
const optionalCurrency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/u).optional().nullable();
const queryBoolean = z.preprocess((value) => value === "true" ? true : value === "false" ? false : value, z.boolean()).optional();
const boundedSectorDetails = z.record(z.string().trim().min(1).max(80), z.unknown())
  .superRefine((value, context) => {
    if (JSON.stringify(value).length > 20_000) {
      context.addIssue({ code: "custom", message: "MARKETPLACE_SECTOR_DETAILS_TOO_LARGE" });
    }
  })
  .optional()
  .nullable();

const vehicleBase = z.object({
  origin: trimmedText(2, 160),
  destination: optionalText(160),
  availableFrom: dateOnly,
  availableUntil: dateOnly.optional().nullable(),
  trailerType: z.enum(FREIGHT_TRAILER_TYPES),
  capacityWeight: z.coerce.number().finite().positive().max(200).optional().nullable(),
  vehicleCount: z.coerce.number().int().min(1).max(100),
  internationalTransport: z.boolean(),
  adrSuitable: z.boolean(),
  priceAmount: optionalMoney,
  currency: optionalCurrency,
  description: optionalText(2_000),
  contactPhone: trimmedText(7, 32),
  primarySector: z.enum(MANUAL_LOGISTICS_SECTORS),
  sectorDetails: boundedSectorDetails,
  clientRequestId: z.string().trim().min(16).max(100).optional(),
}).strict();

function validateCommercialAndDateRange(
  value: { availableFrom?: string; availableUntil?: string | null; priceAmount?: number | null; currency?: string | null },
  context: z.RefinementCtx,
) {
  if (value.priceAmount != null && !value.currency) {
    context.addIssue({ code: "custom", path: ["currency"], message: "FREIGHT_CURRENCY_REQUIRED" });
  }
  if (value.availableFrom && value.availableUntil && value.availableUntil < value.availableFrom) {
    context.addIssue({ code: "custom", path: ["availableUntil"], message: "MARKETPLACE_DATE_RANGE_INVALID" });
  }
}

export const createVehicleListingSchema = vehicleBase.extend({
  primarySector: z.enum(MANUAL_LOGISTICS_SECTORS).default("GENERAL_LOGISTICS"),
}).superRefine(validateCommercialAndDateRange);
export const updateVehicleListingSchema = vehicleBase
  .omit({ clientRequestId: true })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "FREIGHT_EMPTY_UPDATE" })
  .superRefine((value, context) => {
    if (value.priceAmount != null && value.currency === null) {
      context.addIssue({ code: "custom", path: ["currency"], message: "FREIGHT_CURRENCY_REQUIRED" });
    }
    if (value.availableFrom && value.availableUntil && value.availableUntil < value.availableFrom) {
      context.addIssue({ code: "custom", path: ["availableUntil"], message: "MARKETPLACE_DATE_RANGE_INVALID" });
    }
  });

export const vehicleSearchSchema = z.object({
  q: z.string().trim().max(160).optional(),
  origin: z.string().trim().max(160).optional(),
  destination: z.string().trim().max(160).optional(),
  availableFrom: dateOnly.optional(),
  trailerType: z.enum(FREIGHT_TRAILER_TYPES).optional(),
  internationalTransport: queryBoolean,
  adrSuitable: queryBoolean,
  scope: z.enum(MARKETPLACE_SCOPES).default("GLOBAL"),
  cursor: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

const driverBase = z.object({
  listingType: z.enum(DRIVER_LISTING_TYPES),
  title: trimmedText(3, 140),
  location: trimmedText(2, 160),
  preferredRoute: optionalText(200),
  availableFrom: dateOnly,
  licenseClasses: z.array(z.enum(DRIVER_LICENSE_CLASSES)).min(1).max(DRIVER_LICENSE_CLASSES.length),
  experienceYears: z.coerce.number().int().min(0).max(60),
  employmentType: z.enum(DRIVER_EMPLOYMENT_TYPES),
  internationalExperience: z.boolean(),
  adrCertificate: z.boolean(),
  srcCertificate: z.boolean(),
  psychotechnicalCertificate: z.boolean(),
  salaryAmount: optionalMoney,
  currency: optionalCurrency,
  description: optionalText(2_000),
  contactPhone: trimmedText(7, 32),
  primarySector: z.enum(MANUAL_LOGISTICS_SECTORS),
  sectorDetails: boundedSectorDetails,
  clientRequestId: z.string().trim().min(16).max(100).optional(),
}).strict();

export const createDriverListingSchema = driverBase.extend({
  primarySector: z.enum(MANUAL_LOGISTICS_SECTORS).default("GENERAL_LOGISTICS"),
}).superRefine((value, context) => {
  if (value.salaryAmount != null && !value.currency) {
    context.addIssue({ code: "custom", path: ["currency"], message: "FREIGHT_CURRENCY_REQUIRED" });
  }
});
export const updateDriverListingSchema = driverBase
  .omit({ clientRequestId: true })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "FREIGHT_EMPTY_UPDATE" })
  .superRefine((value, context) => {
    if (value.salaryAmount != null && value.currency === null) {
      context.addIssue({ code: "custom", path: ["currency"], message: "FREIGHT_CURRENCY_REQUIRED" });
    }
  });

export const driverSearchSchema = z.object({
  q: z.string().trim().max(160).optional(),
  listingType: z.enum(DRIVER_LISTING_TYPES).optional(),
  location: z.string().trim().max(160).optional(),
  licenseClass: z.enum(DRIVER_LICENSE_CLASSES).optional(),
  employmentType: z.enum(DRIVER_EMPLOYMENT_TYPES).optional(),
  internationalExperience: queryBoolean,
  scope: z.enum(MARKETPLACE_SCOPES).default("GLOBAL"),
  cursor: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const marketplaceMineSchema = z.object({
  status: z.enum(FREIGHT_LISTING_STATUSES).optional(),
  scope: z.enum(MARKETPLACE_SCOPES).optional(),
  sector: z.enum(MANUAL_LOGISTICS_SECTORS).optional(),
  cursor: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const marketplaceStatusSchema = z.object({ status: z.enum(FREIGHT_LISTING_STATUSES) }).strict();

export type CreateVehicleListingInput = z.infer<typeof createVehicleListingSchema>;
export type UpdateVehicleListingInput = z.infer<typeof updateVehicleListingSchema>;
export type VehicleSearchInput = z.infer<typeof vehicleSearchSchema>;
export type CreateDriverListingInput = z.infer<typeof createDriverListingSchema>;
export type UpdateDriverListingInput = z.infer<typeof updateDriverListingSchema>;
export type DriverSearchInput = z.infer<typeof driverSearchSchema>;
export type MarketplaceMineInput = z.infer<typeof marketplaceMineSchema>;
