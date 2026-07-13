export const locales = ["tr", "en", "ro", "ru", "az", "tk", "de", "bg", "el", "sr"] as const;

export type Locale = (typeof locales)[number];

export const fallbackLocale: Locale = "en";

export const localeMetadata: Record<Locale, { nativeName: string; intlLocale: string; direction: "ltr" | "rtl" }> = {
  tr: { nativeName: "Türkçe", intlLocale: "tr-TR", direction: "ltr" },
  en: { nativeName: "English", intlLocale: "en-US", direction: "ltr" },
  ro: { nativeName: "Română", intlLocale: "ro-RO", direction: "ltr" },
  ru: { nativeName: "Русский", intlLocale: "ru-RU", direction: "ltr" },
  az: { nativeName: "Azərbaycan dili", intlLocale: "az-AZ", direction: "ltr" },
  tk: { nativeName: "Türkmen dili", intlLocale: "tk-TM", direction: "ltr" },
  de: { nativeName: "Deutsch", intlLocale: "de-DE", direction: "ltr" },
  bg: { nativeName: "Български", intlLocale: "bg-BG", direction: "ltr" },
  el: { nativeName: "Ελληνικά", intlLocale: "el-GR", direction: "ltr" },
  sr: { nativeName: "Srpski", intlLocale: "sr-Latn-RS", direction: "ltr" },
};

export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace("_", "-").split("-")[0];
  return locales.includes(normalized as Locale) ? (normalized as Locale) : null;
}

export function detectDeviceLocale(): Locale {
  try {
    return normalizeLocale(Intl.DateTimeFormat().resolvedOptions().locale) ?? fallbackLocale;
  } catch {
    return fallbackLocale;
  }
}
