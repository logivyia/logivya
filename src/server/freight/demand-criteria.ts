import { createHash } from "node:crypto";

// Compare the criteria used by a running matcher, not updatedAt (which also
// changes when a match increments the request's counters).
export const demandCriteriaSelect = {
  kind: true, primarySector: true, marketplaceScopes: true, sectorCriteria: true,
  keywordsNormalized: true, originNormalized: true, destinationNormalized: true,
  originCountry: true, destinationCountry: true, locationNormalized: true,
  availableFrom: true, availableUntil: true, trailerType: true, vehicleCategory: true,
  vehicleBodyLength: true, requiredPlateCountry: true, transitRoute: true, cargoType: true,
  minWeight: true, maxWeight: true, driverListingType: true, licenseClasses: true,
  employmentType: true, internationalRequired: true, adrRequired: true, expiresAt: true,
} as const;

export function demandCriteriaVersion(value: object) {
  const row = value as Record<string, unknown>;
  const canonical = (item: unknown): unknown => {
    if (item == null) return null;
    if (item instanceof Date) return item.toISOString();
    if (Array.isArray(item)) return item.map(canonical).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (typeof item === "object") {
      if ("toJSON" in item && typeof item.toJSON === "function") return item.toJSON();
      return Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k,canonical(v)]));
    }
    return item;
  };
  return createHash("sha256").update(JSON.stringify(Object.keys(demandCriteriaSelect).map(k => [k, canonical(row[k])]))).digest("hex");
}
