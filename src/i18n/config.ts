export const locales = ["tr", "en", "de", "ar", "ru", "zh", "az", "ro", "sr", "hr", "fa"] as const;
export type Locale = (typeof locales)[number];
export const fallbackLocale: Locale = "tr";
export const rtlLocales: readonly Locale[] = ["ar", "fa"];
export const localeNames: Record<Locale, string> = {
  tr: "TÜRKÇE", en: "İNGİLİZCE", de: "ALMANCA", ar: "ARAPÇA", ru: "RUSÇA",
  zh: "ÇİNCE", az: "AZERBAYCANCA", ro: "ROMANCA", sr: "SIRBİSTAN", hr: "HIRVATİSTAN", fa: "İRAN",
};
