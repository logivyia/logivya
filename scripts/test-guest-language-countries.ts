import assert from "node:assert/strict";
import { getCountries, getCountryCallingCode, getExampleNumber } from "libphonenumber-js";
import examples from "libphonenumber-js/mobile/examples";
import { countryRegistry, getCountryByIso, getCountryByLocale } from "../src/lib/international/country-registry";
import { normalizePhonePairingInput } from "../src/lib/phone/normalize";
import { normalizeMobilePhone } from "../apps/mobile/src/features/whatsapp/phone-normalization";
import { normalizeCountrySearch } from "../shared/international-phone-input";
import { guestMarketplaceCopy, guestMarketplaceLabels } from "../shared/guest-marketplace-copy";
import { locales } from "../apps/mobile/src/i18n/config";
assert.deepEqual(countryRegistry.map(c=>c.countryIso).sort(), getCountries().sort());
const failures: string[] = [];
let verified = 0;
for (const country of countryRegistry) {
  const iso = country.countryIso as Parameters<typeof getExampleNumber>[0];
  assert.equal(country.callingCode, `+${getCountryCallingCode(iso)}`);
  const example = getExampleNumber(iso, examples);
  assert(example, `${iso} must have an example`);
  for (const input of [example.number, example.formatNational(), String(example.nationalNumber)]) {
    try {
      const web=normalizePhonePairingInput({countryIso: iso, nationalNumber: input});
      const mobile=normalizeMobilePhone(country,input);
      assert.equal(web.e164, example.number);
      assert.equal(mobile.e164, example.number);
      verified++;
    } catch(error) { failures.push(`${iso} ${JSON.stringify(input)}: ${String(error)}`); }
  }
}
assert.deepEqual(failures, [], "Every supported country must accept its official mobile example on web and mobile");
for(const [iso, code] of [['SA','+966'],['SY','+963'],['IQ','+964'],['AE','+971']]) assert.equal(getCountryByIso(iso)?.callingCode,code);
assert.equal(getCountryByLocale('ar')?.countryIso, 'SA');
assert.equal(getCountryByLocale('en')?.countryIso, 'GB');
const sa = getCountryByIso('SA')!;
for(const input of ['٠٥١٢٣٤٥٦٧٨','۰۵۱۲۳۴۵۶۷۸','\u200f+٩٦٦٥١٢٣٤٥٦٧٨']) {
  assert.equal(normalizeMobilePhone(sa,input).e164,'+966512345678');
  assert.equal(normalizePhonePairingInput({countryIso:'SA',nationalNumber:input}).e164,'+966512345678');
}
for(const query of ['Dubai','دبي','BAE','Birleşik Arap Emirlikleri','٩٧١']) {
  const matches=countryRegistry.filter(c=>[c.countryName,c.nativeCountryName,c.callingCode,...c.aliases].some(s=>normalizeCountrySearch(s).includes(normalizeCountrySearch(query))));
  assert(matches.some(c=>c.countryIso==='AE'),query);
}
for(const locale of locales) {
  const guest=guestMarketplaceCopy(locale),labels=guestMarketplaceLabels(locale);
  assert(Object.values(guest).every(v=>typeof v==='string' && v.length>0));
  assert(Object.values(labels.labels).every(v=>typeof v==='string' && v.length>0));
  if(locale!=='en') assert.notEqual(guest.description,guestMarketplaceCopy('en').description);
}
console.log(`Verified ${verified} phone formats across 245 countries, Arabic digits, country aliases and ${locales.length} guest languages.`);
