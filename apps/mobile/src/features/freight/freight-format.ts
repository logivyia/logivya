import type { FreightContainerStatus, FreightListingStatus, FreightTrailerType, MobileFreightListing } from "@/api/mobileFreight";
import { localeMetadata, type Locale } from "@/i18n/config";
import type { TranslationKey } from "@/i18n/translations";
import { translate } from "@/i18n/translations";

export const trailerOptions: Array<{ value: FreightTrailerType; labelKey: TranslationKey }> = [
  { value: "CURTAINSIDER", labelKey: "freightTrailerCurtainsider" },
  { value: "OPEN_TRAILER", labelKey: "freightTrailerOpen" },
  { value: "CLOSED_TRAILER", labelKey: "freightTrailerClosed" },
  { value: "REFRIGERATED", labelKey: "freightTrailerRefrigerated" },
  { value: "CONTAINER", labelKey: "freightTrailerContainer" },
  { value: "LOWBED", labelKey: "freightTrailerLowbed" },
  { value: "TRUCK", labelKey: "freightTrailerTruck" },
  { value: "VAN", labelKey: "freightTrailerVan" },
  { value: "OTHER", labelKey: "freightTrailerOther" },
];

export const containerOptions: Array<{ value: FreightContainerStatus; labelKey: TranslationKey }> = [
  { value: "NONE", labelKey: "freightContainerNone" },
  { value: "ONE_WAY", labelKey: "freightContainerOneWay" },
  { value: "RETURN_REQUIRED", labelKey: "freightContainerReturn" },
];

export const currencyOptions = ["TRY", "USD", "EUR", "GBP"] as const;

export const statusLabelKeys: Record<FreightListingStatus, TranslationKey> = {
  ACTIVE: "freightStatusActive",
  COMPLETED: "freightStatusCompleted",
  INACTIVE: "freightStatusInactive",
  EXPIRED: "freightStatusExpired",
};

export function trailerLabelKey(value: FreightTrailerType) {
  return trailerOptions.find((option) => option.value === value)?.labelKey ?? "freightTrailerOther";
}

export function containerLabelKey(value: FreightContainerStatus) {
  return containerOptions.find((option) => option.value === value)?.labelKey ?? "freightContainerNone";
}

export function formatFreightDate(value: string | null | undefined, locale: Locale) {
  if (!value) return translate(locale, "notSpecified");
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T00:00:00.000Z` : value);
  if (!Number.isFinite(date.getTime())) return translate(locale, "notSpecified");
  return new Intl.DateTimeFormat(localeMetadata[locale].intlLocale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatFreightPrice(listing: Pick<MobileFreightListing, "priceAmount" | "currency">, locale: Locale) {
  if (listing.priceAmount == null || !listing.currency) return null;
  return new Intl.NumberFormat(localeMetadata[locale].intlLocale, {
    style: "currency",
    currency: listing.currency,
    maximumFractionDigits: 2,
  }).format(listing.priceAmount);
}

export function todayDateInput() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function dateToInput(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
