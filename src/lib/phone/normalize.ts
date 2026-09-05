import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/core";
import phoneMetadata from "libphonenumber-js/min/metadata";
import { z } from "zod";

import { countryRegistry, getCountryByIso } from "@/lib/international/country-registry";
import { normalizeDiallingInput, phoneCountryMatches } from "../../../shared/international-phone-input";

const SAFE_PHONE_INPUT = /^\+?[0-9\s().-]+$/u;

export type PhonePairingPayload = {
  countryIso?: unknown;
  countryCode?: unknown;
  nationalNumber?: unknown;
  phoneNumber?: unknown;
};

export type NormalizedPhonePairing = {
  countryIso: string;
  callingCode: string;
  locale: string;
  nationalNumber: string;
  e164: string;
  digits: string;
};

function parseAndValidate(value: string, countryIso?: string | null) {
  const parsed = countryIso
    ? parsePhoneNumberFromString(value, countryIso as CountryCode, phoneMetadata)
    : parsePhoneNumberFromString(value, phoneMetadata);
  if (!parsed || !parsed.isPossible() || !parsed.isValid()) throw new Error("INVALID_WHATSAPP_PHONE");
  return parsed;
}

export function normalizePhonePairingInput(payload: PhonePairingPayload): NormalizedPhonePairing {
  const rawIso = typeof payload.countryIso === "string"
    ? payload.countryIso
    : typeof payload.countryCode === "string"
      ? payload.countryCode
      : null;
  const structured = typeof payload.nationalNumber === "string";

  if (structured) {
    const country = getCountryByIso(rawIso);
    if (!country) throw new Error("UNSUPPORTED_PHONE_COUNTRY");
    const rawNational = normalizeDiallingInput(String(payload.nationalNumber));
    if (!rawNational || !SAFE_PHONE_INPUT.test(rawNational)) {
      throw new Error("INVALID_WHATSAPP_PHONE");
    }
    const digits = rawNational.replace(/\D/gu, "");
    const callingDigits = country.callingCode.slice(1);
    const internationalValue = rawNational.startsWith("+")
      ? `+${digits}`
      : rawNational.startsWith("00")
        ? `+${digits.slice(2)}`
        : null;
    let parsed;
    try {
      parsed = parseAndValidate(internationalValue ?? digits, internationalValue ? undefined : country.countryIso);
    } catch (error) {
      if (internationalValue || !digits.startsWith(callingDigits)) throw error;
      parsed = parseAndValidate(`+${digits}`);
    }
    if (!phoneCountryMatches(country.countryIso, parsed.country)) throw new Error("PHONE_COUNTRY_MISMATCH");
    return {
      countryIso: country.countryIso,
      callingCode: country.callingCode,
      locale: country.localeId,
      nationalNumber: parsed.nationalNumber,
      e164: parsed.number,
      digits: parsed.number.slice(1),
    };
  }

  if (typeof payload.phoneNumber !== "string") throw new Error("INVALID_WHATSAPP_PHONE");
  const raw = normalizeDiallingInput(payload.phoneNumber);
  if (!raw || !/^\+?[0-9\s().-]+$/u.test(raw)) throw new Error("INVALID_WHATSAPP_PHONE");
  const legacyDigits = raw.replace(/\D/gu, "");
  const legacyCountry = [...countryRegistry]
    .sort((left, right) => right.callingCode.length - left.callingCode.length)
    .find((country) => legacyDigits.startsWith(country.callingCode.slice(1)));
  const legacyValue = raw.startsWith("+")
    ? raw
    : raw.startsWith("00")
      ? `+${raw.slice(2)}`
      : legacyCountry
        ? `+${legacyDigits}`
        : raw;
  // Preserve the legacy Turkish national-number input before interpreting bare
  // international prefixes such as +53, which overlap Turkish mobile numbers.
  let parsed;
  if (!raw.startsWith("+") && !raw.startsWith("00")) {
    try { parsed = parseAndValidate(legacyDigits, "TR"); } catch { /* Try the international form below. */ }
  }
  parsed ??= parseAndValidate(legacyValue, legacyValue.startsWith("+") ? undefined : "TR");
  const country = getCountryByIso(parsed.country);
  if (!country) throw new Error("UNSUPPORTED_PHONE_COUNTRY");
  return {
    countryIso: country.countryIso,
    callingCode: country.callingCode,
    locale: country.localeId,
    nationalNumber: parsed.nationalNumber,
    e164: parsed.number,
    digits: parsed.number.slice(1),
  };
}

export function inferPhoneCountry(value: string | null | undefined) {
  if (!value) return null;
  try {
    const normalized = value.startsWith("+") ? value : `+${value.replace(/\D/gu, "")}`;
    const parsed = parseAndValidate(normalized);
    return getCountryByIso(parsed.country);
  } catch {
    return null;
  }
}

export const whatsappPhoneSchema = z.string().trim().min(7).max(32).transform((value, context) => {
  try {
    return normalizePhonePairingInput({ phoneNumber: value }).digits;
  } catch {
    context.addIssue({ code: "custom", message: "INVALID_WHATSAPP_PHONE" });
    return z.NEVER;
  }
});

export function normalizePhoneNumber(value: string) {
  const parsed = whatsappPhoneSchema.safeParse(value);
  if (!parsed.success) throw new Error("INVALID_WHATSAPP_PHONE");
  return parsed.data;
}

export function supportedPhoneCountries() {
  return countryRegistry;
}
