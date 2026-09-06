import assert from "node:assert/strict";
import { extractFreightCandidates } from "../src/server/freight/message-extraction";
import { sourceLoadingDate } from "../src/server/freight/source-date";
import { safeAuthReturn } from "../src/lib/auth-return";
import { encodeMatchCursor, decodeMatchCursor, compareMatchPosition } from "../src/server/freight/match-cursor";
import { demandCriteriaVersion } from "../src/server/freight/demand-criteria";
import { productJourneyCopy, validateProductJourneyCopy } from "../shared/product-journey-copy";
import { productStatusCopy, validateProductStatusCopy } from "../shared/product-status-copy";
import { parseMarketplaceFilters, matchesMarketplaceFilters } from "../shared/marketplace-filters";
import { telegramConnectionCopy } from "../shared/telegram-connection-copy";
import { telegramManagementCopy } from "../shared/telegram-management-copy";
import { validateTelegramManagementExtra } from "../shared/telegram-management-extra";
import { localizeListingSummary } from "../shared/localize-listing-summary";
import { catalogFilterWhere } from "../src/server/freight/catalog-filters";
import { sourceTemperature, sourceTemperatureLabel } from "../shared/source-cargo-details";
import { listingDateCompatibilityMessage, needsListingDateCompatibility } from "../src/server/freight/mobile-date-contract";

for (const [platform, previous, current] of [["ANDROID", 226, 227], ["IOS", 190, 193]] as const) {
  const headers = (code: number) => new Headers({ "x-client-platform": platform, "x-logivya-version-code": String(code) });
  assert(needsListingDateCompatibility(headers(previous), { listing: { loadingDate: null } }));
  assert(needsListingDateCompatibility(headers(previous), { listings: [{ availableFrom: null }] }));
  assert(!needsListingDateCompatibility(headers(current), { listing: { loadingDate: null } }));
  assert(!needsListingDateCompatibility(headers(previous), { listing: { loadingDate: "2026-09-07" } }));
  assert(!needsListingDateCompatibility(headers(previous), { listings: [] }));
}
assert(!needsListingDateCompatibility(new Headers(), { listing: { loadingDate: null } }));
for (const locale of ["tr", "en", "ar", "ro", "ru", "az", "tk", "de", "bg", "el", "sr", "uz"]) assert.match(listingDateCompatibilityMessage(locale), /logivya.com/);

const at = new Date("2026-09-05T09:00:00Z");
const parse = (text: string) => extractFreightCandidates(text, at);
assert.equal(sourceTemperature('Yük: Üzüm Sıcaklık: +2°C Tonaj: 21 ton'), '+2 °C');
assert.equal(sourceTemperature('Temperature -18 °C'), '-18 °C');
assert.equal(sourceTemperature('Frigo 21 ton'), null);
assert.equal(sourceTemperature('10 C araç 4 ton'), null);
for(const locale of ['tr','en','ar','ro','ru','az','tk','de','bg','el','sr','uz']) assert(sourceTemperatureLabel(locale));
assert.equal(parse('ÇANKIRI-CİLVEGÖZÜ TENTELİ ARAÇLAR 0-17 TON PAZARTESİ YÜKLEME')[0]?.destination?.canonical,'Cilvegözü');
assert.equal(parse('Mersin Tarsus→Samsun Çarşamba Tenteli TIR 6ton')[0]?.loadingDate,null);
assert.equal(parse('Mersin Tarsus→Samsun Çarşamba Tenteli TIR 6ton Pazartesi yükleme')[0]?.loadingDate?.toISOString().slice(0,10),'2026-09-07');
assert.equal(parse('NİĞDE-ZAĞO 0-25 TON 1-TENTE Paletli motor yağı Gümrük Antep PAZARTESİ YÜKLER')[0]?.destination?.canonical,'Zaho');
assert.equal(parse('Niğde Bilinmeyenşehir 20 ton Gümrük Antep').length,0);
const headed=parse('KAPALI / TENTELİ ARAÇLAR LAZIM\nPazartesi:\nÇorlu → Süleymaniye | 0-25 ton | 5 kapalı/tenteli araç\nÇorlu → Zaho veya Erbil | 0-25 ton | 1 kapalı/tenteli araç\nSalı:\nBandırma → Erbil | 0-25 ton | 2 kapalı/tenteli araç');
assert.deepEqual(headed.map(x=>x.loadingDate?.toISOString().slice(0,10)),['2026-09-07','2026-09-07','2026-09-08']);
assert.deepEqual(parse('İSTANBUL AV. YÜKLEME STAVROPOL BOŞALTMA 3 TON 1 TENT ARAÇ İRAN ÜZERİ.').map(x => [x.origin?.canonical,x.destination?.canonical]), [['İstanbul','Stavropol']]);
assert.deepEqual(parse('İstanbul Petersburg İran Üzeri 020 ton').map(x => [x.origin?.canonical,x.destination?.canonical]), [['İstanbul','St. Petersburg']]);
assert.equal(parse('İstanbul Bilinmeyenşehir İran üzeri 20 ton').length,0);
assert.deepEqual(parse("🇬🇪RUSTAVİ yukleme 🇹🇷ANKARA bosaltma 22 ton 2 tente arac araniyor T1 firma ait Odeme ankara da").map(x => [x.origin?.canonical, x.destination?.canonical]), [["Rustavi", "Ankara"]]);
assert.deepEqual(parse("Yükleme: Aydın Boşaltma: Kuveyt Tonaj: 0-24 ton Araç Tipi: Tenteli Güzergâh: Irak üzerinden").map(x => [x.origin?.canonical, x.destination?.canonical]), [["Aydın", "Kuveyt"]]);
const multi = parse("Pazartesi: Çorlu → Süleymaniye | 0-25 ton | 5 kapalı/tenteli araç\nSalı: Çorlu → Zaho veya Erbil | 0-25 ton | 1 kapalı/tenteli araç\nSalı: Bandırma → Erbil | 0-25 ton | 2 kapalı/tenteli araç");
assert.deepEqual(multi.map(x => [x.origin?.canonical, x.destination?.canonical, x.vehicleCount, x.loadingDate?.toISOString().slice(0,10)]), [["Çorlu", "Süleymaniye",5,"2026-09-07"],["Çorlu","Zaho / Erbil",1,"2026-09-08"],["Bandırma","Erbil",2,"2026-09-08"]]);
assert.equal(parse("Manisa → Moskova frigo Yük türü: Üzüm Sıcaklık: +2°C Tonaj: 21 t İletişim: +905551112233")[0]?.cargoType, "Üzüm");
assert.equal(sourceLoadingDate("Yük hazır", at), null);
assert.equal(sourceLoadingDate("31/02/2026", at), null);
assert.equal(sourceLoadingDate("Yarın", new Date("2026-09-05T22:30:00Z"), "Europe/Istanbul")?.toISOString(), "2026-09-07T00:00:00.000Z");
assert.equal(sourceLoadingDate("Bugün", new Date("2026-09-05T22:30:00Z"), "America/New_York")?.toISOString(), "2026-09-05T00:00:00.000Z");
assert.equal(sourceLoadingDate("gelecek hafta salı", at)?.toISOString(), "2026-09-08T00:00:00.000Z");
for (const value of ["https://evil.example", "//evil.example", "/%2f%2fevil.example", "/%5cevil.example", "javascript:alert(1)"]) assert.equal(safeAuthReturn(value), "/dashboard");
assert.equal(safeAuthReturn("/marketplace/loads/example?scope=GLOBAL"), "/marketplace/loads/example?scope=GLOBAL");
const cursor = {v:1 as const,d:"owned",a:at.toISOString(),s:95,t:at.toISOString(),i:"match1",p:"EXTERNAL"};
assert.deepEqual(decodeMatchCursor(encodeMatchCursor(cursor),"owned"),cursor);
assert.throws(() => decodeMatchCursor(encodeMatchCursor(cursor),"other"),/INVALID/);
assert.throws(() => decodeMatchCursor("m1.invalid","owned"),/INVALID/);
const positions=Array.from({length:50},(_,i)=>({id:String(i).padStart(3,"0"),score:95,matchedAt:at.toISOString(),sourcePlatform:i%2?"TELEGRAM":"LOGIVYA"})).sort(compareMatchPosition);
assert.equal(positions[0]?.id,"049"); assert.equal(compareMatchPosition(positions[0]!,positions[0]!),0);
assert.equal(demandCriteriaVersion({licenseClasses:["C","CE"],matchCount:2}),demandCriteriaVersion({licenseClasses:["CE","C"],matchCount:7}));
assert.notEqual(demandCriteriaVersion({originNormalized:"istanbul"}),demandCriteriaVersion({originNormalized:"izmir"}));
assert(validateProductJourneyCopy());assert(validateProductStatusCopy());
for(const locale of ["tr","en","ar","ro","ru","az","tk","de","bg","el","sr","uz"]) { assert(productJourneyCopy(locale).call);assert(productStatusCopy(locale).publication); }
const filters=parseMarketplaceFilters(new URLSearchParams("kind=DRIVER&driverListingType=DRIVER_WANTED&licenseClass=CE&employmentType=FULL_TIME&adrRequired=true&location=İstanbul"));
assert.deepEqual(catalogFilterWhere(filters,"DRIVER"),{AND:[{location:{contains:"İstanbul",mode:"insensitive"}},{licenseClasses:{has:"CE"}},{employmentType:"FULL_TIME"},{listingType:"DRIVER_WANTED"},{adrCertificate:true}]});
assert.equal(parseMarketplaceFilters(new URLSearchParams("licenseClass=INVALID")).licenseClass,"");
assert(matchesMarketplaceFilters({kind:'DRIVER',origin:'İstanbul',driverListingType:'DRIVER_WANTED',licenseClasses:['CE'],employmentType:'FULL_TIME',adrCertificate:true},filters));
for(const change of [{licenseClasses:['D']},{adrCertificate:false},{driverListingType:'DRIVER_AVAILABLE'},{kind:'LOAD'}]) assert(!matchesMarketplaceFilters({kind:'DRIVER',origin:'İstanbul',driverListingType:'DRIVER_WANTED',licenseClasses:['CE'],employmentType:'FULL_TIME',adrCertificate:true,...change},filters));
assert(validateTelegramManagementExtra());
for(const locale of ['tr','en','ar','ro','ru','az','tk','de','bg','el','sr','uz']) {
 for(const [key,value] of Object.entries(telegramConnectionCopy(locale))) assert(typeof value==='string'&&value.trim(),`${locale} connection.${key}`);
 for(const [key,value] of Object.entries(telegramManagementCopy(locale))) assert(typeof value==='function'||(typeof value==='string'&&value.trim()),`${locale} management.${key}`);
 const summary=localizeListingSummary({publicTitle:'İstanbul → Ankara Tenteli',vehicleDisplayName:'Tenteli',publicAdvertiserName:'WhatsApp İlanı'},locale);
 if(locale!=='tr') { assert.notEqual(summary.vehicleDisplayName,'Tenteli');assert.notEqual(summary.publicAdvertiserName,'WhatsApp İlanı'); }
 assert.equal(localizeListingSummary({publicTitle:'My own title Tenteli',vehicleDisplayName:'Tenteli',publicAdvertiserName:'My Company'},locale).publicTitle,'My own title Tenteli');
}
console.log("Audit journey regressions: PASS (routes, dates, cargo, safe returns, cursors, criteria, 12 locales, driver filters)");
