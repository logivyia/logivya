import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { countryRegistry as mobileRegistry } from "../apps/mobile/src/generated/country-registry";
import { normalizeMobilePhone } from "../apps/mobile/src/features/whatsapp/phone-normalization";
import {
  countryRegistry,
  getCountryByCallingCode,
  getCountryByIso,
  getCountryByLocale,
} from "../src/lib/international/country-registry";
import { inferPhoneCountry, normalizePhonePairingInput } from "../src/lib/phone/normalize";

const cases = [
  ["TR", "5321234567", "+905321234567", "tr"],
  ["GB", "7400123456", "+447400123456", "en"],
  ["RO", "712345678", "+40712345678", "ro"],
  ["RU", "9123456789", "+79123456789", "ru"],
  ["AZ", "501234567", "+994501234567", "az"],
  ["TM", "65123456", "+99365123456", "tk"],
  ["DE", "15123456789", "+4915123456789", "de"],
  ["BG", "871234567", "+359871234567", "bg"],
  ["GR", "6912345678", "+306912345678", "el"],
  ["RS", "601234567", "+381601234567", "sr"],
] as const;

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

assert.equal(countryRegistry.length, 245);
assert.deepEqual(mobileRegistry, countryRegistry, "Mobile generated registry must match the canonical registry exactly.");
assert.equal(new Set(countryRegistry.map((country) => country.countryIso)).size, countryRegistry.length, "Country ISO codes must be unique.");
assert.deepEqual(
  countryRegistry.map((country) => country.sortOrder),
  [...countryRegistry].map((country) => country.sortOrder).sort((left, right) => left - right),
  "Country registry sort order must be deterministic.",
);

for (const [countryIso, nationalNumber, e164, locale] of cases) {
  const normalized = normalizePhonePairingInput({ countryIso, nationalNumber });
  assert.equal(normalized.countryIso, countryIso);
  assert.equal(normalized.e164, e164);
  assert.equal(normalized.digits, e164.slice(1));
  assert.equal(normalized.locale, locale);
  assert.equal(inferPhoneCountry(e164)?.countryIso, countryIso);
  assert.equal(getCountryByIso(countryIso)?.countryIso, countryIso);
  assert.equal(getCountryByCallingCode(normalized.callingCode)?.countryIso, countryIso);
  assert.equal(getCountryByLocale(locale)?.localeId, locale);
}

assert.equal(
  normalizePhonePairingInput({ phoneNumber: "447400123456" }).e164,
  "+447400123456",
  "Legacy digit-only international payloads must remain backward compatible.",
);
assert.equal(normalizePhonePairingInput({ phoneNumber: "0040740012345" }).countryIso, "RO");

const turkishPhoneInputs = [
  "5393565142",
  "05393565142",
  "905393565142",
  "+905393565142",
  "0539 356 51 42",
  "+90 539 356 51 42",
] as const;
const turkishMobileCountry = mobileRegistry.find((country) => country.countryIso === "TR");
assert(turkishMobileCountry, "The generated mobile registry must include Turkey.");
for (const input of turkishPhoneInputs) {
  assert.equal(normalizePhonePairingInput({ phoneNumber: input }).e164, "+905393565142", `Legacy Turkish input: ${input}`);
  assert.equal(
    normalizePhonePairingInput({ countryIso: "TR", nationalNumber: input }).e164,
    "+905393565142",
    `Server pairing must accept ${input}.`,
  );
  assert.equal(
    normalizeMobilePhone(turkishMobileCountry, input).e164,
    "+905393565142",
    `Mobile pairing must accept ${input}.`,
  );
}

assert.throws(
  () => normalizePhonePairingInput({ countryIso: "ZZ", nationalNumber: "2025550123" }),
  /UNSUPPORTED_PHONE_COUNTRY/,
);
assert.throws(
  () => normalizePhonePairingInput({ countryIso: "TR", nationalNumber: "+447400123456" }),
  /PHONE_COUNTRY_MISMATCH/,
);
assert.throws(
  () => normalizePhonePairingInput({ countryIso: "DE", nationalNumber: "telefon" }),
  /INVALID_WHATSAPP_PHONE/,
);
assert.throws(
  () => normalizePhonePairingInput({ countryIso: "GB", nationalNumber: "123" }),
  /INVALID_WHATSAPP_PHONE/,
);

const routeSources = [
  read("src/app/api/accounts/whatsapp/create-pairing-session/route.ts"),
  read("src/app/api/accounts/[id]/pairing-code/route.ts"),
  read("src/app/api/mobile/whatsapp/accounts/phone-code/route.ts"),
];
for (const source of routeSources) {
  assert(source.includes("parsePhonePairingRequest(await request.json())"), "Every phone-code endpoint must use canonical server validation.");
  assert(source.includes("phonePairingErrorCode(error)"), "Every phone-code endpoint must expose structured validation codes.");
  assert(source.includes("persistPhonePairingMetadata"), "Every phone-code endpoint must persist canonical country and locale metadata.");
}

const mobileRoute = routeSources[2];
assert(
  mobileRoute.indexOf("requireMobileAuth(request)") < mobileRoute.indexOf("request.json()"),
  "Mobile authentication must run before parsing untrusted pairing payloads.",
);
const migration = read("prisma/migrations/20260720170000_international_pairing_starter_attribution/migration.sql");
assert(!migration.includes("WHEN \"phoneNumber\" LIKE '+7%'"), "Ambiguous +7 accounts must not be assigned to Russia by SQL prefix alone.");

console.log("Canonical country registry parity (245 countries) and original international E.164 regression checks passed.");
