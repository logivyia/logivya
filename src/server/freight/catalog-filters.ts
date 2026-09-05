import type { MarketplaceFilters } from "../../../shared/marketplace-filters";
import { logisticsCountrySearchTerms } from "./location-normalization";

/** Applied before the database limit so a narrow route can find older listings. */
export function catalogFilterWhere(filters: MarketplaceFilters, kind: "LOAD" | "VEHICLE" | "DRIVER") {
  const AND: Record<string, unknown>[] = [];
  if ((filters.kind && filters.kind !== kind) || (kind === "DRIVER" && (filters.destinationCountry || filters.destinationCity || filters.vehicle))) return { id: "__no_listing__" };
  for (const side of ["origin", "destination"] as const) {
    const field = kind === "DRIVER" ? "location" : side;
    const country = filters[`${side}Country`];
    const city = filters[`${side}City`];
    if (country) AND.push({ OR: logisticsCountrySearchTerms(country).map((contains) => ({ [field]: { contains, mode: "insensitive" } })) });
    if (city) AND.push({ [field]: { contains: city, mode: "insensitive" } });
  }
  if (filters.vehicle) AND.push({ trailerType: filters.vehicle });
  return AND.length ? { AND } : {};
}
