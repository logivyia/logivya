import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/core";
import phoneMetadata from "libphonenumber-js/min/metadata";

export type PhoneCountryDefinition = {
  readonly countryIso: string;
  readonly callingCode: string;
};

export type NormalizedMobilePhone = {
  countryIso: string;
  nationalNumber: string;
  e164: string;
};

export class MobilePhoneNormalizationError extends Error {
  constructor(
    readonly code: "INVALID_PHONE" | "PHONE_COUNTRY_MISMATCH",
  ) {
    super(code);
    this.name = "MobilePhoneNormalizationError";
  }
}

const SAFE_PHONE_INPUT = /^\+?[0-9\s().-]+$/u;

export function normalizeMobilePhone(
  country: PhoneCountryDefinition,
  input: string,
): NormalizedMobilePhone {
  const raw = input.normalize("NFKC").trim();
  if (!raw || !SAFE_PHONE_INPUT.test(raw)) {
    throw new MobilePhoneNormalizationError("INVALID_PHONE");
  }

  const digits = raw.replace(/\D/gu, "");
  const callingDigits = country.callingCode.slice(1);
  const internationalValue = raw.startsWith("+")
    ? `+${digits}`
    : raw.startsWith("00")
      ? `+${digits.slice(2)}`
      : digits.startsWith(callingDigits)
        ? `+${digits}`
        : null;
  const nationalValue = digits.replace(/^0+/, "");
  const parsed = internationalValue
    ? parsePhoneNumberFromString(internationalValue, phoneMetadata)
    : parsePhoneNumberFromString(
        nationalValue,
        country.countryIso as CountryCode,
        phoneMetadata,
      );

  if (!parsed || !parsed.isPossible() || !parsed.isValid()) {
    throw new MobilePhoneNormalizationError("INVALID_PHONE");
  }
  if (parsed.country !== country.countryIso) {
    throw new MobilePhoneNormalizationError("PHONE_COUNTRY_MISMATCH");
  }

  return {
    countryIso: country.countryIso,
    nationalNumber: parsed.nationalNumber,
    e164: parsed.number,
  };
}
