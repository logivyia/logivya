import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Prisma } from "@prisma/client";

import { extractFreightCandidates, isProbableFreightMessage } from "../src/server/freight/message-extraction";
import { calculateSmartCandidateMatch } from "../src/server/freight/smart-match-scoring";

const now = new Date("2026-08-26T18:30:00.000Z");
const message = `ADA LOGISTICS
آدانا -> آبادان 25 تن 1 کامیون آماده بارگیری +989227009707
آدانا -> انزلی 25 تن 1 کامیون آماده بارگیری
ساکاریا -> دوغارون 25 تن 1 کامیون آماده بارگیری`;

assert(isProbableFreightMessage(message), "Multilingual freight messages must pass the cheap pre-filter");
const extracted = extractFreightCandidates(message, now);
assert.equal(extracted.length, 3, "One source message must yield multiple route candidates");
assert.equal(extracted[0]?.origin?.countryCode, "TR", "Adana must normalize to Turkey");
assert.equal(extracted[0]?.destination?.countryCode, "IR", "Abadan must normalize to Iran");
assert.equal(extracted[0]?.weight, 25, "Persian tonnage must be extracted");
assert(extracted[0]?.advertisedBusinessContact?.startsWith("+98"), "Only advertised business contact may be retained");
assert.equal(extractFreightCandidates("Bugün hava çok güzel", now).length, 0, "Unrelated chat must not be indexed");

const turkishNeed = extractFreightCandidates("Adana -> Tahran 25 ton yük aranıyor", now);
assert.equal(turkishNeed[0]?.intent, "NEED", "Tonnage must not turn a Turkish demand into an offer");
const englishOffer = extractFreightCandidates("Load ready: Mersin -> Tehran, 24 tons, curtainsider", now);
assert.equal(englishOffer[0]?.intent, "OFFER", "Explicit English ready-load messages must remain offers");
assert.equal(englishOffer[0]?.trailerType, "CURTAINSIDER", "English trailer terminology must normalize");

const demand = {
  kind: "LOAD" as const,
  origin: "Türkiye",
  originNormalized: "türkiye",
  destination: "İran",
  destinationNormalized: "iran",
  location: null,
  locationNormalized: null,
  availableFrom: null,
  availableUntil: null,
  trailerType: null,
  minWeight: new Prisma.Decimal(20),
  maxWeight: new Prisma.Decimal(30),
  keywordsNormalized: [],
  expiresAt: new Date("2026-09-26T00:00:00.000Z"),
  status: "ACTIVE" as const,
};
const candidate = {
  candidateType: "LOAD" as const,
  intent: "OFFER" as const,
  origin: "Adana",
  originNormalized: "adana",
  originCountry: "TR",
  destination: "Abadan",
  destinationNormalized: "abadan",
  destinationCountry: "IR",
  loadingDate: null,
  trailerType: null,
  weight: new Prisma.Decimal(25),
  searchText: "adana abadan",
  sourceMessageTimestamp: now,
  expiresAt: new Date("2026-08-29T18:30:00.000Z"),
  extractionConfidence: 90,
};
const forward = calculateSmartCandidateMatch(demand, candidate, now);
assert(forward && forward.score >= 85, "Turkey to Iran must match the same requested direction");
assert.equal(calculateSmartCandidateMatch(demand, {
  ...candidate,
  origin: "Tahran",
  originNormalized: "tahran",
  originCountry: "IR",
  destination: "Mersin",
  destinationNormalized: "mersin",
  destinationCountry: "TR",
}, now), null, "Iran to Turkey must never match Turkey to Iran");
assert.equal(calculateSmartCandidateMatch(demand, { ...candidate, intent: "NEED" }, now), null, "Two identical needs must not match each other");
assert.equal(calculateSmartCandidateMatch(demand, { ...candidate, expiresAt: new Date("2026-08-25T00:00:00.000Z") }, now), null, "Expired opportunities must be rejected");

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const whatsappWorker = read("src/worker/baileys-provider.ts");
assert(whatsappWorker.includes("shouldCaptureWhatsAppUpsert(type, sourceMessageTimestamp)"), "WhatsApp ingestion must gate every upsert through the bounded capture policy");
assert(whatsappWorker.includes('if (type === "notify") return true'), "Live WhatsApp notifications must always be eligible for ingestion");
assert(whatsappWorker.includes("WHATSAPP_INGESTION_APPEND_MAX_AGE_MS") && whatsappWorker.includes("Math.min(86_400_000"), "Recovery appends must be time-bounded and capped at 24 hours");
assert(read("src/server/freight/smart-ingestion.ts").includes('externalGroupId: input.externalGroupId'), "WhatsApp ingestion must verify an owned group record");
assert(read("src/server/freight/smart-ingestion.ts").includes('type: { in: ["BASIC_GROUP", "SUPERGROUP", "CHANNEL"] }'), "Telegram ingestion must reject private chats");
assert(!read("src/server/freight/smart-ingestion.ts").includes("participant"), "The matching engine must not harvest group participants");
assert(read("src/server/freight/smart-ingestion.ts").includes("rawTextExpiresAt"), "Raw source text must have bounded retention");
assert(read("src/server/telegram/tdlib-client.ts").includes('_: "getChatHistory"'), "Authorized Telegram history must use TDLib instead of browser scraping");
assert(read("src/server/telegram/tdlib-client.ts").includes("7 * 86_400_000"), "Telegram history scan must have a bounded freshness window");
assert(!read("src/server/telegram/tdlib-client.ts").includes("joinChatByInviteLink"), "Smart Matching must never auto-join Telegram groups");
assert(read("src/app/api/mobile/freight/requests/route.ts").includes("enqueueSmartMatchingJob"), "Demand creation must enqueue asynchronous matching");
assert(!read("src/app/api/mobile/freight/requests/route.ts").includes("matchDemandRequestAgainstExistingListings"), "Demand creation must not synchronously scan listings");

console.log("Smart Matching Engine contracts: PASS");
