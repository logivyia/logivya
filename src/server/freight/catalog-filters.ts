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
  if (kind === "DRIVER") {
    if (filters.location) AND.push({ location: { contains: filters.location, mode: "insensitive" } });
    if (filters.licenseClass) AND.push({ licenseClasses: { has: filters.licenseClass } });
    if (filters.employmentType) AND.push({ employmentType: filters.employmentType });
    if (filters.driverListingType) AND.push({ listingType: filters.driverListingType });
    if (filters.adrRequired === "true") AND.push({ adrCertificate: true });
    if (filters.internationalRequired === "true") AND.push({ internationalExperience: true });
  } else if (filters.location || filters.licenseClass || filters.employmentType || filters.driverListingType || filters.adrRequired || filters.internationalRequired) return { id: "__no_listing__" };
  return AND.length ? { AND } : {};
}
