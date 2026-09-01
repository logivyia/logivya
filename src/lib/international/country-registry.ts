import registry from "../../../shared/country-registry.json";

export type CountryRegistryEntry = (typeof registry.countries)[number];
export type SupportedCountryIso = CountryRegistryEntry["countryIso"];
export type SupportedMessageLocale = CountryRegistryEntry["localeId"];

export const countryRegistryVersion = registry.version;
export const countryRegistry = [...registry.countries]
  .filter((entry) => entry.enabled)
  .sort((left, right) => left.sortOrder - right.sortOrder);

// Retain prior footer variants only for retry/idempotency cleanup. New messages
// always use the current registry text.
const LEGACY_ATTRIBUTIONS = [
  "Mesaj gönderimi logivya.com kullanılarak gönderilmiştir.",
  "Mesaj gönderimi logivya.com kullanılarak gerçekleştirilmiştir.",
  "This message was sent using logivya.com.",
  "Acest mesaj a fost trimis folosind logivya.com.",
  "Это сообщение отправлено с помощью logivya.com.",
  "Bu mesaj logivya.com istifadə edilərək göndərilib.",
  "Bu habar logivya.com ulanylyp iberildi.",
] as const;

export function getCountryByIso(value: string | null | undefined) {
  const iso = value?.trim().toUpperCase();
  return countryRegistry.find((entry) => entry.countryIso === iso) ?? null;
}

export function getCountryByLocale(value: string | null | undefined) {
  const locale = value?.trim().toLowerCase().replace("_", "-").split("-")[0];
  return countryRegistry.find((entry) => entry.localeId === locale) ?? null;
}

export function getCountryByCallingCode(value: string | null | undefined) {
  const callingCode = value?.trim().startsWith("+") ? value.trim() : `+${value?.trim() ?? ""}`;
  return countryRegistry.find((entry) => entry.callingCode === callingCode) ?? null;
}

export function inferCountryFromPhoneNumber(value: string | null | undefined) {
  const digits = value?.replace(/\D/gu, "") ?? "";
  if (!digits) return null;
  return [...countryRegistry]
    .sort((left, right) => right.callingCode.length - left.callingCode.length)
    .find((entry) => digits.startsWith(entry.callingCode.slice(1))) ?? null;
}

export function getAllCanonicalAttributions() {
  return [...countryRegistry.map((entry) => entry.attribution), ...LEGACY_ATTRIBUTIONS]
    .map((attribution) => attribution.normalize("NFC"));
}
