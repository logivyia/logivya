export const locales = ["tr", "en", "ar", "ro", "ru", "az", "tk", "de", "bg", "el", "sr"] as const;

export type Locale = (typeof locales)[number];

export const fallbackLocale: Locale = "en";

export const rtlLocales: readonly Locale[] = ["ar"];

export type LocaleMetadata = {
  name: string;
  nativeName: string;
  intlLocale: string;
  direction: "ltr" | "rtl";
};

export const localeMetadata: Record<Locale, LocaleMetadata> = {
  tr: { name: "Turkish", nativeName: "Türkçe", intlLocale: "tr-TR", direction: "ltr" },
  en: { name: "English", nativeName: "English", intlLocale: "en-US", direction: "ltr" },
  ar: { name: "Arabic", nativeName: "العربية", intlLocale: "ar-SA", direction: "rtl" },
  ro: { name: "Romanian", nativeName: "Română", intlLocale: "ro-RO", direction: "ltr" },
  ru: { name: "Russian", nativeName: "Русский", intlLocale: "ru-RU", direction: "ltr" },
  az: { name: "Azerbaijani", nativeName: "Azərbaycan dili", intlLocale: "az-AZ", direction: "ltr" },
  tk: { name: "Turkmen", nativeName: "Türkmen dili", intlLocale: "tk-TM", direction: "ltr" },
  de: { name: "German", nativeName: "Deutsch", intlLocale: "de-DE", direction: "ltr" },
  bg: { name: "Bulgarian", nativeName: "Български", intlLocale: "bg-BG", direction: "ltr" },
  el: { name: "Greek", nativeName: "Ελληνικά", intlLocale: "el-GR", direction: "ltr" },
  sr: { name: "Serbian", nativeName: "Srpski", intlLocale: "sr-Latn-RS", direction: "ltr" },
};

export const localeNames = Object.fromEntries(
  locales.map((locale) => [locale, localeMetadata[locale].nativeName]),
) as Record<Locale, string>;

export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace("_", "-").split("-")[0];
  return locales.includes(normalized as Locale) ? (normalized as Locale) : null;
}

export function intlLocale(locale: Locale | string) {
  const normalized = normalizeLocale(locale) ?? fallbackLocale;
  return localeMetadata[normalized].intlLocale;
}
