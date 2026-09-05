import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  fallbackLocale,
  localeMetadata,
  locales,
  normalizeLocale,
} from "../src/i18n/config";
import { formatCurrency, formatDate, formatNumber } from "../src/i18n/format";
import { translateForLocale } from "../src/i18n/server";
import {
  fallbackLocale as mobileFallbackLocale,
  locales as mobileLocales,
  normalizeLocale as normalizeMobileLocale,
} from "../apps/mobile/src/i18n/config";
import { translate as translateMobile, translations } from "../apps/mobile/src/i18n/translations";

const root = process.cwd();
const expectedLocales = ["tr", "en", "ar", "ro", "ru", "az", "tk", "de", "bg", "el", "sr"] as const;
const canonicalAccountLabels = {
  tr: ["1 Hesap", "2 Hesap", "3 Hesap", "{used}/{limit} hesap", "Hesaplar"],
  en: ["1 Account", "2 Accounts", "3 Accounts", "{used}/{limit} accounts", "Accounts"],
  ar: ["حساب واحد", "حسابان", "3 حسابات", "{used}/{limit} حسابات", "الحسابات"],
  ro: ["1 cont", "2 conturi", "3 conturi", "{used}/{limit} conturi", "Conturi"],
  ru: ["1 \u0430\u043a\u043a\u0430\u0443\u043d\u0442", "2 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0430", "3 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0430", "{used}/{limit} \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u043e\u0432", "\u0410\u043a\u043a\u0430\u0443\u043d\u0442\u044b"],
  az: ["1 hesab", "2 hesab", "3 hesab", "{used}/{limit} hesab", "Hesablar"],
  tk: ["1 hasap", "2 hasap", "3 hasap", "{used}/{limit} hasap", "Hasaplar"],
  de: ["1 Konto", "2 Konten", "3 Konten", "{used}/{limit} Konten", "Konten"],
  bg: ["1 \u0430\u043a\u0430\u0443\u043d\u0442", "2 \u0430\u043a\u0430\u0443\u043d\u0442\u0430", "3 \u0430\u043a\u0430\u0443\u043d\u0442\u0430", "{used}/{limit} \u0430\u043a\u0430\u0443\u043d\u0442\u0430", "\u0410\u043a\u0430\u0443\u043d\u0442\u0438"],
  el: ["1 \u03bb\u03bf\u03b3\u03b1\u03c1\u03b9\u03b1\u03c3\u03bc\u03cc\u03c2", "2 \u03bb\u03bf\u03b3\u03b1\u03c1\u03b9\u03b1\u03c3\u03bc\u03bf\u03af", "3 \u03bb\u03bf\u03b3\u03b1\u03c1\u03b9\u03b1\u03c3\u03bc\u03bf\u03af", "{used}/{limit} \u03bb\u03bf\u03b3\u03b1\u03c1\u03b9\u03b1\u03c3\u03bc\u03bf\u03af", "\u039b\u03bf\u03b3\u03b1\u03c1\u03b9\u03b1\u03c3\u03bc\u03bf\u03af"],
  sr: ["1 nalog", "2 naloga", "3 naloga", "{used}/{limit} naloga", "Nalozi"],
} as const;

function placeholders(value: string) {
  return [...value.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
}

async function readDictionary(locale: string) {
  return JSON.parse(await readFile(path.join(root, "packages", "locales", `${locale}.json`), "utf8")) as Record<string, string>;
}

async function main() {
assert.deepEqual(locales, expectedLocales, "Web must expose exactly the approved eleven locales.");
assert.deepEqual(mobileLocales, expectedLocales, "Mobile must expose the same locale list as web.");
assert.equal(fallbackLocale, "en", "Web fallback must be English.");
assert.equal(mobileFallbackLocale, "en", "Mobile fallback must be English.");
assert.equal(normalizeLocale("sr-Latn-RS"), "sr");
assert.equal(normalizeMobileLocale("RO_ro"), "ro");
assert.equal(normalizeLocale("unknown"), null);
assert.equal(localeMetadata.sr.intlLocale, "sr-Latn-RS", "Serbian formatting must use Latin script.");

const english = await readDictionary("en");
const englishKeys = Object.keys(english).sort();
for (const locale of expectedLocales) {
  const dictionary = await readDictionary(locale);
  assert.deepEqual(Object.keys(dictionary).sort(), englishKeys, `${locale} web keys must match English.`);
  for (const key of englishKeys) {
    assert.equal(typeof dictionary[key], "string", `${locale}.${key} must be a string.`);
    assert(dictionary[key].trim(), `${locale}.${key} must not be empty.`);
    assert.deepEqual(placeholders(dictionary[key]), placeholders(english[key]), `${locale}.${key} placeholders must match English.`);
  }
}

const mobileEnglishKeys = Object.keys(translations.en).sort();
for (const locale of expectedLocales) {
  const dictionary = translations[locale];
  assert.deepEqual(Object.keys(dictionary).sort(), mobileEnglishKeys, `${locale} mobile keys must match English.`);
  for (const key of mobileEnglishKeys) {
    assert(dictionary[key].trim(), `${locale} mobile ${key} must not be empty.`);
    assert.deepEqual(placeholders(dictionary[key]), placeholders(translations.en[key]), `${locale} mobile ${key} placeholders must match English.`);
  }
}

for (const locale of expectedLocales) {
  const dictionary = await readDictionary(locale);
  const [trial, starter, professional, mobileCount, mobileLabel] = canonicalAccountLabels[locale];
  assert.equal(dictionary["home.plan.trial.feature1"], trial, `${locale} trial capacity must use account naming.`);
  assert.equal(dictionary["home.plan.starter.feature1"], starter, `${locale} starter capacity must use account naming.`);
  assert.equal(dictionary["home.plan.professional.feature1"], professional, `${locale} professional capacity must use account naming.`);
  assert.equal(translations[locale].seatsCount, mobileCount, `${locale} mobile capacity must use account naming.`);
  assert.equal(translations[locale].userSeats, mobileLabel, `${locale} mobile capacity label must use account naming.`);
}

assert(!Object.values(await readDictionary("sr")).some((value) => /[\u0400-\u04ff]/.test(value)), "Web Serbian must use Latin script only.");
assert(!Object.values(translations.sr).some((value) => /[\u0400-\u04ff]/.test(value)), "Mobile Serbian must use Latin script only.");

assert.equal(await translateForLocale("xx", "auth.loginAction"), english["auth.loginAction"], "Unknown web locales must fall back to English.");
assert.equal(translateMobile("xx", "login"), translations.en.login, "Unknown mobile locales must fall back to English.");
assert.match(await translateForLocale("de", "common.groupCount", { count: 1234 }), /1\.234/, "Web interpolation must format numbers for the active locale.");
assert.match(translateMobile("de", "peopleCount", { count: 1234 }), /1\.234/, "Mobile interpolation must format numbers for the active locale.");

assert.equal(formatNumber(1234.5, "de"), "1.234,5");
assert.match(formatCurrency(280, "TRY", "tr"), /280/);
assert.equal(
  formatDate(new Date("2026-12-31T12:00:00.000Z"), "de", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" }),
  "31.12.2026",
);

const [webProvider, webPreferenceRoute, mobileSettingsStore, mobileApiClient, mobileApp, mobilePreferenceRoute] = await Promise.all([
  readFile(path.join(root, "src/i18n/provider.tsx"), "utf8"),
  readFile(path.join(root, "src/app/api/preferences/locale/route.ts"), "utf8"),
  readFile(path.join(root, "apps/mobile/src/auth/settings-store.ts"), "utf8"),
  readFile(path.join(root, "apps/mobile/src/api/client.ts"), "utf8"),
  readFile(path.join(root, "apps/mobile/App.tsx"), "utf8"),
  readFile(path.join(root, "src/app/api/mobile/preferences/locale/route.ts"), "utf8"),
]);
assert(webProvider.includes('localStorage.setItem("logivya.locale", next)'), "Web locale must persist locally.");
assert(webProvider.includes("document.cookie = `logivya.locale=${next}"), "Web locale must persist in a cookie for SSR.");
assert(webProvider.includes('fetch("/api/preferences/locale"'), "Web locale must synchronize with the profile API.");
assert(webPreferenceRoute.includes("prisma.user.update"), "Web locale preference must be stored on the user profile.");
assert(mobileSettingsStore.includes("persist("), "Mobile locale must use persisted settings storage.");
assert(mobileSettingsStore.includes("locale: state.locale"), "Mobile persistence must include the selected locale.");
assert(mobileApiClient.includes('headers.set("Accept-Language", locale)'), "Mobile API calls must send Accept-Language.");
assert(mobileApiClient.includes('headers.set("X-Logivya-Locale", locale)'), "Mobile API calls must send the explicit locale header.");
assert(mobileApp.includes("applyAccountLocale(accountLocale)"), "Mobile login and session restore must apply the profile locale across devices.");
assert(mobilePreferenceRoute.includes("prisma.user.update"), "Mobile locale preference must be stored on the user profile.");

console.log("Localization contracts passed for web and mobile across 11 locales.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
