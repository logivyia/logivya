import { z } from "zod";

import {
  FREIGHT_CONTAINER_STATUSES,
  FREIGHT_LISTING_STATUSES,
  FREIGHT_TRAILER_TYPES,
  MANUAL_LOGISTICS_SECTORS,
  MARKETPLACE_SCOPES,
} from "@/server/freight/constants";

const trimmedText = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().nullable();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "FREIGHT_INVALID_DATE");
const positiveDecimal = (maximum: number) => z.coerce.number().finite().positive().max(maximum);
const boundedSectorDetails = z.record(z.string().trim().min(1).max(80), z.unknown())
  .superRefine((value, context) => {
    if (JSON.stringify(value).length > 20_000) {
      context.addIssue({ code: "custom", message: "MARKETPLACE_SECTOR_DETAILS_TOO_LARGE" });
    }
  })
  .optional()
  .nullable();

export const freightTrailerTypeSchema = z.enum(FREIGHT_TRAILER_TYPES);
export const freightContainerStatusSchema = z.enum(FREIGHT_CONTAINER_STATUSES);
export const freightListingStatusSchema = z.enum(FREIGHT_LISTING_STATUSES);

const freightListingBaseSchema = z.object({
  origin: trimmedText(2, 160),
  destination: trimmedText(2, 160),
  loadingDate: dateOnly,
  cargoType: optionalText(120),
  weight: positiveDecimal(200).optional().nullable(),
  trailerType: freightTrailerTypeSchema,
  vehicleCount: z.coerce.number().int().min(1).max(100),
  priceAmount: z.coerce.number().finite().positive().max(1_000_000_000).optional().nullable(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/u).optional().nullable(),
  customsInfo: optionalText(500),
  containerStatus: freightContainerStatusSchema,
  description: optionalText(2_000),
  contactPhone: trimmedText(7, 32),
  primarySector: z.enum(MANUAL_LOGISTICS_SECTORS),
  sectorDetails: boundedSectorDetails,
  clientRequestId: z.string().trim().min(16).max(100).optional(),
}).strict();

export const createFreightListingSchema = freightListingBaseSchema.extend({
  containerStatus: freightContainerStatusSchema.default("NONE"),
  primarySector: z.enum(MANUAL_LOGISTICS_SECTORS).default("GENERAL_LOGISTICS"),
}).superRefine((value, context) => {
  if (value.priceAmount != null && !value.currency) {
    context.addIssue({ code: "custom", path: ["currency"], message: "FREIGHT_CURRENCY_REQUIRED" });
  }
  const details = value.sectorDetails && typeof value.sectorDetails === "object" ? value.sectorDetails : {};
  const hasPartialQuantity = ["volumeM3", "palletCount", "packageCount", "dimensions"]
    .some((key) => typeof details[key] === "string" && details[key].trim().length > 0);
  if (value.weight == null && value.primarySector !== "HOME_MOVING"
    && !(value.primarySector === "PARTIAL_LOAD" && hasPartialQuantity)) {
    context.addIssue({ code: "custom", path: ["weight"], message: "FREIGHT_WEIGHT_OR_QUANTITY_REQUIRED" });
  }
});

export const updateFreightListingSchema = freightListingBaseSchema
  .omit({ clientRequestId: true })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "FREIGHT_EMPTY_UPDATE" });

export const freightSearchSchema = z.object({
  q: z.string().trim().max(160).optional(),
  origin: z.string().trim().max(160).optional(),
  destination: z.string().trim().max(160).optional(),
  loadingDate: dateOnly.optional(),
  trailerType: freightTrailerTypeSchema.optional(),
  minWeight: z.coerce.number().finite().positive().max(200).optional(),
  maxWeight: z.coerce.number().finite().positive().max(200).optional(),
  scope: z.enum(MARKETPLACE_SCOPES).default("GLOBAL"),
  cursor: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict().superRefine((value, context) => {
  if (value.minWeight != null && value.maxWeight != null && value.minWeight > value.maxWeight) {
    context.addIssue({ code: "custom", path: ["maxWeight"], message: "FREIGHT_WEIGHT_RANGE_INVALID" });
  }
});

export const freightMineSchema = z.object({
  status: freightListingStatusSchema.optional(),
  scope: z.enum(MARKETPLACE_SCOPES).optional(),
  sector: z.enum(MANUAL_LOGISTICS_SECTORS).optional(),
  cursor: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const freightStatusSchema = z.object({
  status: z.enum(["ACTIVE", "COMPLETED", "INACTIVE", "EXPIRED"]),
}).strict();

export type CreateFreightListingInput = z.infer<typeof createFreightListingSchema>;
export type UpdateFreightListingInput = z.infer<typeof updateFreightListingSchema>;
export type FreightSearchInput = z.infer<typeof freightSearchSchema>;
export type FreightMineInput = z.infer<typeof freightMineSchema>;
