export const locales = ["tr", "en", "de", "ru", "az", "ar", "ku", "bs", "sr", "hr", "sq", "mk", "bg", "ro", "ka"] as const;
export type Locale = (typeof locales)[number];
export const fallbackLocale: Locale = "en";
export const rtlLocales: readonly Locale[] = ["ar"];
export const localeNames: Record<Locale, string> = {
  tr: "Türkçe", en: "English", de: "Deutsch", ru: "Русский", az: "Azərbaycan", ar: "العربية",
  ku: "Kurdî", bs: "Bosanski", sr: "Srpski", hr: "Hrvatski", sq: "Shqip", mk: "Македонски",
  bg: "Български", ro: "Română", ka: "ქართული",
};
