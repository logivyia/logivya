import { intlLocale, normalizeLocale, fallbackLocale, type Locale } from "@/i18n/config";

function resolvedLocale(locale: Locale | string | null | undefined) {
  return normalizeLocale(locale) ?? fallbackLocale;
}

export function formatDate(value: Date | string | number, locale: Locale | string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(intlLocale(resolvedLocale(locale)), options ?? { dateStyle: "medium" }).format(new Date(value));
}

export function formatDateTime(value: Date | string | number, locale: Locale | string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(
    intlLocale(resolvedLocale(locale)),
    options ?? { dateStyle: "medium", timeStyle: "short" },
  ).format(new Date(value));
}

export function formatNumber(value: number, locale: Locale | string, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(intlLocale(resolvedLocale(locale)), options).format(value);
}

export function formatCurrency(value: number, currency: string, locale: Locale | string) {
  return formatNumber(value, locale, { style: "currency", currency, currencyDisplay: "symbol" });
}

export function formatRelativeTime(value: number, unit: Intl.RelativeTimeFormatUnit, locale: Locale | string) {
  return new Intl.RelativeTimeFormat(intlLocale(resolvedLocale(locale)), { numeric: "auto" }).format(value, unit);
}
