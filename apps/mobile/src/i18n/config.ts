export const locales = ["tr", "en", "ar", "ro", "ru", "az", "tk", "de", "bg", "el", "sr", "uz"] as const;

export type Locale = (typeof locales)[number];

export const fallbackLocale: Locale = "en";

export const localeMetadata: Record<Locale, { nativeName: string; intlLocale: string; direction: "ltr" | "rtl" }> = {
  tr: { nativeName: "Türkçe", intlLocale: "tr-TR", direction: "ltr" },
  en: { nativeName: "English", intlLocale: "en-US", direction: "ltr" },
  ar: { nativeName: "العربية", intlLocale: "ar-SA", direction: "rtl" },
  ro: { nativeName: "Română", intlLocale: "ro-RO", direction: "ltr" },
  ru: { nativeName: "Русский", intlLocale: "ru-RU", direction: "ltr" },
  az: { nativeName: "Azərbaycan dili", intlLocale: "az-AZ", direction: "ltr" },
  tk: { nativeName: "Türkmen dili", intlLocale: "tk-TM", direction: "ltr" },
  de: { nativeName: "Deutsch", intlLocale: "de-DE", direction: "ltr" },
  bg: { nativeName: "Български", intlLocale: "bg-BG", direction: "ltr" },
  el: { nativeName: "Ελληνικά", intlLocale: "el-GR", direction: "ltr" },
  uz: { nativeName: "O‘zbekcha", intlLocale: "uz-Latn-UZ", direction: "ltr" },
  sr: { nativeName: "Srpski", intlLocale: "sr-Latn-RS", direction: "ltr" },
};

export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace("_", "-").split("-")[0];
  return locales.includes(normalized as Locale) ? (normalized as Locale) : null;
}

export function detectDeviceLocale(): Locale {
  try {
    const options = Intl.DateTimeFormat().resolvedOptions();
    const deviceLocale = options.locale ?? "";
    const normalizedLocale = normalizeLocale(deviceLocale);
    const regionCode = (() => {
      try {
        return new Intl.Locale(deviceLocale).region ?? "";
      } catch {
        return deviceLocale.match(/(?:-|_)([A-Za-z]{2})(?:-|$)/u)?.[1]?.toUpperCase() ?? "";
      }
    })();

    if (
      normalizedLocale === "tr" ||
      regionCode === "TR" ||
      options.timeZone === "Europe/Istanbul"
    ) {
      return "tr";
    }

    return normalizedLocale ?? fallbackLocale;
  } catch {
    return fallbackLocale;
  }
}
