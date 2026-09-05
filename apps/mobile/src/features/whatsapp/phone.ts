import { countryRegistry, type MobileCountryRegistryEntry } from "@/generated/country-registry";
import { translateCurrent } from "@/i18n/runtime";
import {
  MobilePhoneNormalizationError,
  normalizeMobilePhone,
} from "@/features/whatsapp/phone-normalization";

export type MobilePhonePairingInput = {
  countryIso: string;
  nationalNumber: string;
  e164: string;
};

export function getMobileCountry(countryIso: string | null | undefined): MobileCountryRegistryEntry {
  return countryRegistry.find((entry) => entry.countryIso === countryIso?.toUpperCase()) ?? countryRegistry[0];
}

export function getMobileCountryForLocale(locale: string | null | undefined): MobileCountryRegistryEntry {
  const normalized = locale?.toLowerCase().replace("_", "-").split("-")[0];
  return countryRegistry.find((entry) => entry.localeId === normalized) ?? countryRegistry[0];
}

export function searchMobileCountries(query: string) {
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase();
  if (!normalized) return countryRegistry;
  return countryRegistry.filter((entry) => [
    entry.countryName,
    entry.nativeCountryName,
    entry.countryIso,
    entry.callingCode,
    ...entry.aliases,
  ].some((value) => value.toLocaleLowerCase().includes(normalized)));
}

export function normalizeInternationalPhone(countryIso: string, input: string): MobilePhonePairingInput {
  const country = getMobileCountry(countryIso);
  if (country.countryIso !== countryIso.toUpperCase()) throw new Error(translateCurrent("phoneCountryUnsupported"));
  try {
    return normalizeMobilePhone(country, input);
  } catch (error) {
    if (error instanceof MobilePhoneNormalizationError) {
      throw new Error(translateCurrent("internationalPhoneInvalid"));
    }
    throw error;
  }
}

/** Backward-compatible export for older imports. */
export function normalizeTurkishPhone(input: string): string {
  return normalizeInternationalPhone("TR", input).e164;
}
