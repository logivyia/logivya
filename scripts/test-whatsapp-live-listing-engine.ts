import assert from "node:assert/strict";

import { extractFreightCandidates, isProbableFreightMessage } from "@/server/freight/message-extraction";
import { findLogisticsLocations, normalizeLogisticsText, normalizeSingleLogisticsLocation } from "@/server/freight/location-normalization";
import { normalizeFreightPhone } from "@/server/freight/service";
import { extractListingsWithLogivyaAi, logivyaAiListingSchema, validateLogivyaAiEvidence, type LogivyaAiListing } from "@/server/whatsapp-ingestion/ai-extraction";
import { ingestionJobId, nextWhatsAppIngestionStage, WHATSAPP_INGESTION_STAGES } from "@/server/whatsapp-ingestion/contracts";
import { recommendLogisticsWhatsAppGroup } from "@/server/whatsapp-ingestion/group-recommendation";
import { extractionEngineAllowsAutomaticPublication } from "@/server/whatsapp-ingestion/processor";
import { readFileSync } from "node:fs";

async function main() {
const sourceTimestamp = new Date("2026-08-28T09:00:00.000Z");
const sourceMessageId = "message-test-1";
const sourceText = "İstanbul Anadolu Yakası -> Krasnodar / Moskva / Minsk, 20 ton tenteli, 29.08.2026, +90 555 000 11 22";

function listing(overrides: Partial<LogivyaAiListing> = {}): LogivyaAiListing {
  return logivyaAiListingSchema.parse({
    isLogisticsListing: true,
    listingType: "LOAD",
    sourceLanguage: "tr",
    title: "Provider-generated title",
    normalizedDescription: "Provider-generated description",
    originCountry: "Türkiye",
    originCity: "İstanbul Asiya",
    originDistrict: null,
    originFacility: null,
    destinationCountry: "Rusya",
    destinationCity: "Moskva",
    destinationDistrict: null,
    destinationFacility: null,
    customsCity: null,
    routeDescription: null,
    transitCountries: [],
    cargoType: null,
    cargoDescription: null,
    tonnageMin: 20,
    tonnageMax: 20,
    volumeM3: null,
    vehicleCount: null,
    vehicleCategory: null,
    vehicleTypeSpecified: true,
    trailerType: "CURTAINSIDER",
    bodyType: null,
    vehicleLength: null,
    plateCountryRequirement: null,
    loadingDate: "2026-08-29",
    loadingStatus: null,
    readyToLoad: null,
    urgent: null,
    freightAmount: null,
    freightCurrency: null,
    paymentType: null,
    contactPhone: "+90 555 999 99 99",
    contactName: null,
    companyName: null,
    notes: null,
    confidenceScore: 98,
    missingCriticalFields: [],
    extractedFromText: true,
    extractedFromMedia: false,
    sourceMessageId,
    contradictionDetected: false,
    ...overrides,
  });
}

const canonical = validateLogivyaAiEvidence(listing(), {
  text: sourceText,
  sourceMessageId,
  sourceTimestamp,
  defaultCountry: "TR",
  attachmentKinds: [],
});
assert(canonical, "Evidence-backed listing should be accepted");
assert.equal(canonical.originCity, "İstanbul Anadolu Yakası");
assert.equal(canonical.destinationCity, "Moskova");
assert.equal(canonical.tonnageMin, 20);
assert.equal(canonical.loadingDate, "2026-08-29");
assert.equal(canonical.trailerType, "CURTAINSIDER");
assert.equal(canonical.contactPhone, "+905550001122", "The explicit source number, not the provider number, must be used");
assert.equal(canonical.normalizedDescription, sourceText, "Public description must remain source-grounded");
assert.equal(canonical.title, "Yük · İstanbul Anadolu Yakası → Moskova");

const hallucinated = validateLogivyaAiEvidence(listing({
  tonnageMin: 24,
  tonnageMax: 24,
  loadingDate: "2026-08-30",
  freightAmount: 1_500,
  freightCurrency: "USD",
  contactPhone: "+90 555 999 99 99",
}), {
  text: "Mersin -> Astana, 20 ton tenteli, 29.08.2026, navlun 1000 USD",
  sourceMessageId,
  sourceTimestamp,
  defaultCountry: "TR",
  attachmentKinds: [],
});
assert(hallucinated);
assert.equal(hallucinated.tonnageMin, null, "Invented tonnage must be removed");
assert.equal(hallucinated.loadingDate, null, "Invented date must be removed");
assert.equal(hallucinated.freightAmount, null, "Invented freight amount must be removed");
assert.equal(hallucinated.contactPhone, null, "A sender/provider phone must not replace an absent public phone");
assert(hallucinated.missingCriticalFields.includes("publicContactPhone"));

const driver = validateLogivyaAiEvidence(listing({
  listingType: "DRIVER",
  originCity: "İstanbul",
  destinationCountry: null,
  destinationCity: null,
  tonnageMin: null,
  tonnageMax: null,
  trailerType: null,
  vehicleTypeSpecified: false,
  loadingDate: "2026-08-28",
  driverListingType: "DRIVER_AVAILABLE",
  driverLicenseClasses: ["CE"],
  driverExperienceYears: 5,
  driverEmploymentType: "FULL_TIME",
  driverInternationalExperience: true,
  driverAdrCertificate: true,
  driverSrcCertificate: true,
  driverPsychotechnicalCertificate: true,
}), {
  text: "İstanbul şoför iş arıyor, CE, 5 yıl, tam zamanlı, uluslararası, ADR, SRC, psikoteknik, bugün, +90 555 000 11 22",
  sourceMessageId,
  sourceTimestamp,
  defaultCountry: "TR",
  attachmentKinds: [],
});
assert(driver);
assert.equal(driver.driverListingType, "DRIVER_AVAILABLE");
assert.deepEqual(driver.driverLicenseClasses, ["CE"]);
assert.equal(driver.driverExperienceYears, 5);
assert.equal(driver.driverEmploymentType, "FULL_TIME");
assert.equal(driver.loadingDate, "2026-08-28");
assert.equal(driver.missingCriticalFields.length, 0);

assert.equal(validateLogivyaAiEvidence(listing({ sourceMessageId: "wrong-message" }), {
  text: sourceText,
  sourceMessageId,
  sourceTimestamp,
  defaultCountry: "TR",
  attachmentKinds: [],
}), null, "A provider response cannot change the source message identity");

assert.throws(() => logivyaAiListingSchema.parse({ ...listing(), unsupportedField: "blocked" }), /unrecognized_keys/u);

assert.equal(normalizeSingleLogisticsLocation("Moskva")?.canonical, "Moskova");
assert.equal(normalizeSingleLogisticsLocation("بازرگان")?.canonical, "Bazargan");
assert.equal(normalizeSingleLogisticsLocation("İstanbul Asiya")?.canonical, "İstanbul Anadolu Yakası");
assert.deepEqual(findLogisticsLocations("تهران به تبریز").map((item) => item.canonical), ["Tahran", "Tebriz"]);
assert.equal(normalizeLogisticsText("  МОСКВА  "), "москва");
assert.equal(normalizeSingleLogisticsLocation("Toshkent")?.canonical, "Taşkent", "Uzbek location alias must normalize");
assert.equal(normalizeSingleLogisticsLocation("الرياض")?.canonical, "Riyad", "Arabic location alias must normalize");
assert.equal(normalizeSingleLogisticsLocation("Bakı")?.canonical, "Bakü", "Azerbaijani location alias must normalize");
assert.equal(normalizeSingleLogisticsLocation("Moscow")?.canonical, "Moskova", "English location alias must normalize");
assert.equal(normalizeSingleLogisticsLocation("Краснодар")?.canonical, "Krasnodar", "Russian location alias must normalize");

const localFixtures = [
  { text: "Mersin -> Astana yük hazır 20 ton tenteli, yarın, +90 555 000 11 22", type: "LOAD", origin: "Mersin", destination: "Astana", weight: 20, trailer: "CURTAINSIDER" },
  { text: "Москва -> Краснодар груз 20 тонн рефрижератор, завтра, +7 999 111 22 33", type: "LOAD", origin: "Moskova", destination: "Krasnodar", weight: 20, trailer: "REFRIGERATED" },
  { text: "Toshkent -> Samarqand bo'sh mashina, ertaga, +998 90 111 22 33", type: "VEHICLE", origin: "Taşkent", destination: "Semerkant", weight: null, trailer: null },
  { text: "Bakı -> Tbilisi boş maşın, sabah, +994 50 111 22 33", type: "VEHICLE", origin: "Bakü", destination: "Tiflis", weight: null, trailer: null },
  { text: "الرياض -> دبي شحنة 18 طن شاحنة مبردة اليوم +971 50 111 2233", type: "LOAD", origin: "Riyad", destination: "Dubai", weight: 18, trailer: "REFRIGERATED" },
  { text: "تهران -> تبریز بار آماده 22 تن چادری فردا +98 912 111 2233", type: "LOAD", origin: "Tahran", destination: "Tebriz", weight: 22, trailer: "CURTAINSIDER" },
] as const;

for (const fixture of localFixtures) {
  assert.equal(isProbableFreightMessage(fixture.text), true, `Local engine must classify: ${fixture.text}`);
  const candidate = extractFreightCandidates(fixture.text, sourceTimestamp)[0];
  assert(candidate, `Local engine must extract: ${fixture.text}`);
  assert.equal(candidate.candidateType, fixture.type);
  assert.equal(candidate.origin?.canonical, fixture.origin);
  assert.equal(candidate.destination?.canonical, fixture.destination);
  assert.equal(candidate.weight, fixture.weight);
  assert.equal(candidate.trailerType, fixture.trailer);
}
assert.equal(isProbableFreightMessage("Bugün toplantıya katılır mısın?"), false, "Short signal fragments inside ordinary words must not create listings");
assert.equal(extractionEngineAllowsAutomaticPublication({ extractionEngine: "LOGIVYA_LOCAL_RULE_ENGINE", extractionModel: "logivya-local-rules-v2" }), true);
assert.equal(extractionEngineAllowsAutomaticPublication({ extractionEngine: "LOGIVYA_LOCAL_RULE_ENGINE", extractionModel: "unknown" }), false);
assert.equal(extractionEngineAllowsAutomaticPublication({ extractionEngine: "LOGIVYA_AI", contradictionDetected: false }), true);
assert.equal(extractionEngineAllowsAutomaticPublication({ extractionEngine: "LOGIVYA_AI", contradictionDetected: true }), false);
assert.equal(normalizeFreightPhone("+90 552 004 81 07", "TR"), "+905520048107");

assert.equal(recommendLogisticsWhatsAppGroup("Uluslararası Lojistik ve Nakliye").recommended, true);
assert.equal(recommendLogisticsWhatsAppGroup("DOĞUŞ ÇAY YÜK PAYLAŞIM GRUBU").recommended, true);
assert.equal(recommendLogisticsWhatsAppGroup("Грузоперевозки из России").recommended, true);
assert.equal(recommendLogisticsWhatsAppGroup("اعلام بار سراسری").recommended, true);
assert.equal(recommendLogisticsWhatsAppGroup("E-FATURA E-ARŞİV FATURA").recommended, false);
assert.equal(recommendLogisticsWhatsAppGroup("2.el alım satım grubu").recommended, false);
assert.equal(recommendLogisticsWhatsAppGroup("KKTC Mezunum Satıyorum").recommended, false);
assert.equal(
  recommendLogisticsWhatsAppGroup("Genel Sohbet", "Nakliye, yük, kamyon ve lojistik ilanları").recommended,
  false,
  "A generic group name must not become a source candidate from description text alone",
);

const baileysProviderSource = readFileSync("src/worker/baileys-provider.ts", "utf8");
const ingestionProcessorSource = readFileSync("src/server/whatsapp-ingestion/processor.ts", "utf8");
const liveFeedSource = readFileSync("src/server/freight/live-feed.ts", "utf8");
const liveFeedRouteSource = readFileSync("src/app/api/mobile/freight/listings/live/route.ts", "utf8");
assert(baileysProviderSource.includes("shouldCaptureWhatsAppUpsert(type, sourceMessageTimestamp)"), "Recent append events must be eligible for live-listing capture after reconnect");
assert(!baileysProviderSource.includes('!externalGroupId?.endsWith("@g.us") || !sourceMessageId || message.key.fromMe'), "Approved source posts sent by the linked account must not be discarded");
assert(ingestionProcessorSource.includes('"PENDING_REVIEW",\n  "AUTO_PUBLISHED",'), "Published or reviewable messages must continue through matching and notification stages");
assert.equal((ingestionProcessorSource.match(/status: \{ in: PIPELINE_ACTIVE_STATUSES \}/gu) || []).length, 3, "Claim, final failure handling and recovery must use the same active pipeline statuses");
assert(ingestionProcessorSource.includes('job.stage === "DEMAND_MATCHING" || job.stage === "NOTIFICATION_DELIVERY"'), "Post-publication stages must preserve AUTO_PUBLISHED or PENDING_REVIEW status");
assert(liveFeedSource.includes("includeActiveSnapshot"), "The initial dashboard request must be able to load currently active listings");
assert(liveFeedSource.includes("includeActiveSnapshot || new Date(event.cursor) > after"), "Active snapshot rows must not be removed by the incremental cursor filter");
assert(liveFeedRouteSource.includes("context.user.id, !afterValue"), "A cursorless live-feed request must return an active listing snapshot");
assert.equal(recommendLogisticsWhatsAppGroup("Aile Sohbeti").recommended, false);

assert.equal(WHATSAPP_INGESTION_STAGES.length, 11);
assert.equal(nextWhatsAppIngestionStage("WHATSAPP_INBOUND"), "CONTENT_NORMALIZATION");
assert.equal(nextWhatsAppIngestionStage("NOTIFICATION_DELIVERY"), "COMPLETED");
assert.equal(
  ingestionJobId({ inboundMessageId: "inbound-1", stage: "AI_CLASSIFICATION", stageVersion: 1 }),
  ingestionJobId({ inboundMessageId: "inbound-1", stage: "AI_CLASSIFICATION", stageVersion: 1 }),
  "Queue job IDs must be deterministic",
);

const previousEndpoint = process.env.LOGIVYA_AI_EXTRACTION_URL;
const previousMode = process.env.LOGIVYA_EXTRACTION_MODE;
const previousFetch = globalThis.fetch;
process.env.LOGIVYA_EXTRACTION_MODE = "LOCAL_RULES";
process.env.LOGIVYA_AI_EXTRACTION_URL = "http://localhost:8787/extract";
let externalFetchCalled = false;
globalThis.fetch = async () => {
  externalFetchCalled = true;
  throw new Error("LOCAL_RULES_MUST_NOT_CALL_EXTERNAL_AI");
};
const localResult = await extractListingsWithLogivyaAi({
  text: sourceText,
  sourceMessageId,
  sourceTimestamp,
  defaultCountry: "TR",
  attachmentKinds: [],
});
assert.equal(localResult.provider, "LOGIVYA_LOCAL_RULE_ENGINE");
assert.equal(localResult.model, "logivya-local-rules-v2");
assert.equal(externalFetchCalled, false, "Local mode must never call the external AI endpoint");

process.env.LOGIVYA_EXTRACTION_MODE = "REMOTE_GATEWAY";
globalThis.fetch = async () => new Response(JSON.stringify({
  listings: [
    listing({ destinationCity: "Krasnodar" }),
    listing({ destinationCity: "Moskva" }),
    listing({ destinationCountry: "Belarus", destinationCity: "Minsk" }),
  ],
}), { status: 200, headers: { "Content-Type": "application/json" } });

try {
  const result = await extractListingsWithLogivyaAi({
    text: sourceText,
    sourceMessageId,
    sourceTimestamp,
    defaultCountry: "TR",
    attachmentKinds: ["IMAGE"],
  });
  assert.equal(result.configured, true);
  assert.equal(result.listings.length, 3, "Three independent routes must remain three independent listings");
  assert.deepEqual(result.listings.map((item) => item.destinationCity), ["Krasnodar", "Moskova", "Minsk"]);
  assert(result.listings.every((item) => item.extractedFromMedia));
} finally {
  if (previousEndpoint === undefined) delete process.env.LOGIVYA_AI_EXTRACTION_URL;
  else process.env.LOGIVYA_AI_EXTRACTION_URL = previousEndpoint;
  if (previousMode === undefined) delete process.env.LOGIVYA_EXTRACTION_MODE;
  else process.env.LOGIVYA_EXTRACTION_MODE = previousMode;
  globalThis.fetch = previousFetch;
}

console.info("WhatsApp live listing engine contract checks passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
