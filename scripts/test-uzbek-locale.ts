import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { locales, localeMetadata, normalizeLocale } from "../src/i18n/config";
import { normalizeLocale as normalizeMobileLocale } from "../apps/mobile/src/i18n/config";
import { countryRegistry, getCountryByLocale } from "../src/lib/international/country-registry";
import { countryRegistry as mobileCountries } from "../apps/mobile/src/generated/country-registry";
import { normalizePhonePairingInput } from "../src/lib/phone/normalize";
import { normalizeMobilePhone } from "../apps/mobile/src/features/whatsapp/phone-normalization";
import { normalizeCountrySearch } from "../shared/international-phone-input";
import { guestMarketplaceCopy, guestMarketplaceLabels } from "../shared/guest-marketplace-copy";
import { uzbekTelegramCopy, uzbekTelegramAuthStates } from "../apps/mobile/src/i18n/telegram-uz";
import { translations, translate } from "../apps/mobile/src/i18n/translations";

assert(locales.includes("uz"));
assert.equal(localeMetadata.uz.nativeName,"O‘zbekcha");
assert.equal(localeMetadata.uz.intlLocale,"uz-Latn-UZ");
assert.equal(localeMetadata.uz.direction,"ltr");
for(const variant of ["uz","uz-UZ","uz_Latn_UZ","UZ-latn-uz"]) {
  assert.equal(normalizeLocale(variant),"uz"); assert.equal(normalizeMobileLocale(variant),"uz");
  assert.equal(getCountryByLocale(variant)?.countryIso,"UZ");
}
assert.deepEqual(mobileCountries, countryRegistry);
const uz=countryRegistry.find(c=>c.countryIso==="UZ")!;
assert.equal(uz.callingCode,"+998"); assert.equal(uz.localeId,"uz");
for(const query of ["O‘zbekiston","O'zbekiston","O’zbekiston","Oʻzbekiston","Uzbekistan","Özbekistan","Ўзбекистон","998"]) {
  const found=countryRegistry.filter(c=>[c.countryIso,c.countryName,c.nativeCountryName,c.callingCode,...c.aliases].some(s=>normalizeCountrySearch(s).includes(normalizeCountrySearch(query))));
  assert(found.some(c=>c.countryIso==="UZ"),query);
}
for(const input of ["+998912345678","00998912345678","998912345678","91 234 56 78","912345678"]) {
  assert.equal(normalizePhonePairingInput({countryIso:"UZ",nationalNumber:input}).e164,"+998912345678",input);
  assert.equal(normalizeMobilePhone(uz,input).e164,"+998912345678",input);
}
for(const input of ["91234567","+905551112233"]) {
  assert.throws(()=>normalizePhonePairingInput({countryIso:"UZ",nationalNumber:input}));
  assert.throws(()=>normalizeMobilePhone(uz,input));
}
const web=JSON.parse(readFileSync("packages/locales/uz.json","utf8"));
assert(!Object.values(web).some(v=>/[\u0400-\u04ff]/u.test(String(v))),"Web Uzbek uses Latin script");
assert(!Object.values(translations.uz).some(v=>/[\u0400-\u04ff]/u.test(v)),"Native Uzbek uses Latin script");
assert.equal(translate("uz","register"),"Ro‘yxatdan o‘tish");
assert.equal(translate("uz","login"),"Kirish");
assert.equal(translate("uz","selectCountry"),"Mamlakatni tanlang");
assert.equal(guestMarketplaceCopy("uz").filterListings,"E’lonlarni filtrlash");
assert.notDeepEqual(guestMarketplaceLabels("uz"),guestMarketplaceLabels("en"));
assert.equal(uzbekTelegramAuthStates.WAIT_PHONE_NUMBER,"Telefon raqami kutilmoqda");
assert.equal(uzbekTelegramCopy.title,"Telegram boshqaruvi");
console.log("Uzbek locale, Latin script, guest copy, Telegram copy, UZ +998 defaults/search and phone formats passed.");
