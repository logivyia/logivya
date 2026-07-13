import { fallbackLocale, localeMetadata, normalizeLocale, type Locale } from "@/i18n/config";

function intlLocale(locale: Locale | string | null | undefined) {
  return localeMetadata[normalizeLocale(locale) ?? fallbackLocale].intlLocale;
}

export function formatDate(value: Date | string | number, locale: Locale | string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(intlLocale(locale), options ?? { dateStyle: "medium" }).format(new Date(value));
}

export function formatDateTime(value: Date | string | number, locale: Locale | string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(
    intlLocale(locale),
    options ?? { dateStyle: "medium", timeStyle: "short" },
  ).format(new Date(value));
}

export function formatNumber(value: number, locale: Locale | string, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(intlLocale(locale), options).format(value);
}

export function formatCurrency(value: number, currency: string, locale: Locale | string) {
  return formatNumber(value, locale, { style: "currency", currency, currencyDisplay: "symbol" });
}
