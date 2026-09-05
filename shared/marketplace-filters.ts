export const marketplaceCountries = [
  ["TR", "Türkiye"], ["IR", "İran"], ["IQ", "Irak"], ["SY", "Suriye"], ["AZ", "Azerbaycan"], ["GE", "Gürcistan"],
  ["RU", "Rusya"], ["BY", "Belarus"], ["KZ", "Kazakistan"], ["UZ", "Özbekistan"], ["TM", "Türkmenistan"], ["KG", "Kırgızistan"],
  ["TJ", "Tacikistan"], ["AF", "Afganistan"], ["UA", "Ukrayna"], ["BG", "Bulgaristan"], ["RO", "Romanya"],
  ["SA", "Suudi Arabistan"], ["AE", "Birleşik Arap Emirlikleri"], ["QA", "Katar"],
  ["KW", "Kuveyt"], ["DE", "Almanya"], ["GB", "Birleşik Krallık"], ["GR", "Yunanistan"], ["RS", "Sırbistan"],
] as const;
export const marketplaceVehicles = [
  ["REFRIGERATED", "Frigo"], ["CURTAINSIDER", "Tenteli"], ["OPEN_TRAILER", "Açık Kasa"], ["CLOSED_TRAILER", "Kapalı Kasa"],
  ["CONTAINER", "Konteyner"], ["LOWBED", "Lowbed"], ["TRUCK", "Kamyon"], ["VAN", "Panelvan"],
] as const;
export const driverLicenseOptions = ["B", "C", "CE", "D", "DE"] as const;
export const driverEmploymentOptions = ["FULL_TIME", "PART_TIME", "CONTRACT", "DAILY"] as const;
export type MarketplaceFilters = { originCountry: string; destinationCountry: string; originCity: string; destinationCity: string; vehicle: string; kind: string; location?: string; licenseClass?: string; employmentType?: string; driverListingType?: string; adrRequired?: string; internationalRequired?: string };
export const emptyMarketplaceFilters: MarketplaceFilters = { originCountry: "", destinationCountry: "", originCity: "", destinationCity: "", vehicle: "", kind: "" };
export function marketplaceFilterParams(filters: MarketplaceFilters) {
  return Object.entries(filters).filter(([, value]) => value).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
}
export function parseMarketplaceFilters(params: URLSearchParams): MarketplaceFilters {
  const country = (key: string) => marketplaceCountries.some(([code]) => code === params.get(key)) ? params.get(key)! : "";
  return {
    originCountry: country("originCountry"), destinationCountry: country("destinationCountry"),
    originCity: (params.get("originCity") ?? "").trim().slice(0, 80), destinationCity: (params.get("destinationCity") ?? "").trim().slice(0, 80),
    vehicle: marketplaceVehicles.some(([code]) => code === params.get("vehicle")) ? params.get("vehicle")! : "",
    kind: ["LOAD", "VEHICLE", "DRIVER"].includes(params.get("kind") ?? "") ? params.get("kind")! : "",
    location: (params.get("location") ?? "").trim().slice(0, 80),
    licenseClass: driverLicenseOptions.some(value => value === params.get("licenseClass")) ? params.get("licenseClass")! : "",
    employmentType: driverEmploymentOptions.some(value => value === params.get("employmentType")) ? params.get("employmentType")! : "",
    driverListingType: ["DRIVER_AVAILABLE", "DRIVER_WANTED"].includes(params.get("driverListingType") ?? "") ? params.get("driverListingType")! : "",
    adrRequired: params.get("adrRequired") === "true" ? "true" : "",
    internationalRequired: params.get("internationalRequired") === "true" ? "true" : "",
  };
}
export function matchesMarketplaceFilters(listing: { kind: string; originCountry?: string | null; destinationCountry?: string | null; origin?: string | null; destination?: string | null; trailerType?: string | null; driverListingType?: string; licenseClasses?: string[]; employmentType?: string; adrCertificate?: boolean; internationalExperience?: boolean }, filters: MarketplaceFilters) {
  const fold = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/ı/gu, "i");
  return (!filters.kind || listing.kind === filters.kind)
    && (!filters.originCountry || listing.originCountry === filters.originCountry)
    && (!filters.destinationCountry || listing.destinationCountry === filters.destinationCountry)
    && (!filters.originCity || fold(listing.origin ?? "").includes(fold(filters.originCity)))
    && (!filters.destinationCity || fold(listing.destination ?? "").includes(fold(filters.destinationCity)))
    && (!filters.location || (listing.kind === "DRIVER" && fold(listing.origin ?? "").includes(fold(filters.location))))
    && (!filters.driverListingType || (listing.kind === "DRIVER" && listing.driverListingType === filters.driverListingType))
    && (!filters.licenseClass || (listing.kind === "DRIVER" && listing.licenseClasses?.includes(filters.licenseClass)))
    && (!filters.employmentType || (listing.kind === "DRIVER" && listing.employmentType === filters.employmentType))
    && (filters.adrRequired !== "true" || (listing.kind === "DRIVER" && listing.adrCertificate === true))
    && (filters.internationalRequired !== "true" || (listing.kind === "DRIVER" && listing.internationalExperience === true))
    && (!filters.vehicle || listing.trailerType === filters.vehicle
      || (filters.vehicle === "OPEN_TRAILER" && listing.trailerType === "FLATBED")
      || (filters.vehicle === "CLOSED_TRAILER" && listing.trailerType === "CLOSED_BODY"));
}
