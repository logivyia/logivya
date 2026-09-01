import "server-only";

import { z } from "zod";

import { normalizePhonePairingInput } from "@/lib/phone/normalize";
import { findLogisticsLocations, normalizeLogisticsText, normalizeSingleLogisticsLocation } from "@/server/freight/location-normalization";

const nullableText = z.string().trim().max(2_000).nullable();
const nullableShortText = z.string().trim().max(240).nullable();
const nullableNumber = z.number().finite().nonnegative().nullable();

export const logivyaAiListingSchema = z.object({
  isLogisticsListing: z.boolean(),
  listingType: z.enum(["LOAD", "VEHICLE", "PARTIAL_LOAD", "DRIVER", "NON_LOGISTICS", "UNKNOWN"]),
  sourceLanguage: z.enum(["tr", "fa", "az", "ru", "uz", "ar", "en", "und"]),
  title: nullableShortText,
  normalizedDescription: nullableText,
  originCountry: nullableShortText,
  originCity: nullableShortText,
  originDistrict: nullableShortText,
  originFacility: nullableShortText,
  destinationCountry: nullableShortText,
  destinationCity: nullableShortText,
  destinationDistrict: nullableShortText,
  destinationFacility: nullableShortText,
  customsCity: nullableShortText,
  routeDescription: nullableShortText,
  transitCountries: z.array(z.string().trim().min(1).max(120)).max(20),
  cargoType: nullableShortText,
  cargoDescription: nullableText,
  tonnageMin: nullableNumber,
  tonnageMax: nullableNumber,
  volumeM3: nullableNumber,
  vehicleCount: z.number().int().min(1).max(100).nullable(),
  vehicleCategory: nullableShortText,
  vehicleTypeSpecified: z.boolean(),
  trailerType: z.enum(["CURTAINSIDER", "REFRIGERATED", "OPEN_TRAILER", "CLOSED_TRAILER", "CONTAINER", "LOWBED", "VAN", "TRUCK"]).nullable(),
  bodyType: nullableShortText,
  vehicleLength: nullableNumber,
  plateCountryRequirement: nullableShortText,
  loadingDate: z.string().date().nullable(),
  loadingStatus: nullableShortText,
  readyToLoad: z.boolean().nullable(),
  urgent: z.boolean().nullable(),
  freightAmount: nullableNumber,
  freightCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/u).nullable(),
  paymentType: nullableShortText,
  contactPhone: nullableShortText,
  contactName: nullableShortText,
  companyName: nullableShortText,
  driverListingType: z.enum(["DRIVER_AVAILABLE", "DRIVER_WANTED"]).nullable().optional().default(null),
  driverLicenseClasses: z.array(z.enum(["B", "C", "CE", "D", "DE"])).max(5).optional().default([]),
  driverExperienceYears: z.number().int().min(0).max(60).nullable().optional().default(null),
  driverEmploymentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "DAILY"]).nullable().optional().default(null),
  driverInternationalExperience: z.boolean().nullable().optional().default(null),
  driverAdrCertificate: z.boolean().nullable().optional().default(null),
  driverSrcCertificate: z.boolean().nullable().optional().default(null),
  driverPsychotechnicalCertificate: z.boolean().nullable().optional().default(null),
  notes: nullableText,
  confidenceScore: z.number().int().min(0).max(100),
  missingCriticalFields: z.array(z.string().trim().min(1).max(80)).max(30),
  extractedFromText: z.boolean(),
  extractedFromMedia: z.boolean(),
  sourceMessageId: z.string().trim().min(1).max(240),
  contradictionDetected: z.boolean().default(false),
}).strict();

const gatewayResponseSchema = z.object({
  listings: z.array(logivyaAiListingSchema).max(25),
}).strict();

export type LogivyaAiListing = z.infer<typeof logivyaAiListingSchema>;

export type LogivyaAiExtractionResult = {
  configured: boolean;
  provider: string;
  model: string | null;
  listings: LogivyaAiListing[];
};

export async function extractListingsWithLogivyaAi(input: {
  text: string;
  sourceMessageId: string;
  sourceTimestamp: Date;
  defaultCountry: string;
  attachmentKinds: string[];
}): Promise<LogivyaAiExtractionResult> {
  const mode = (process.env.LOGIVYA_EXTRACTION_MODE?.trim() || "LOCAL_RULES").toUpperCase();
  if (mode === "LOCAL_RULES") {
    return {
      configured: false,
      provider: "LOGIVYA_LOCAL_RULE_ENGINE",
      model: "logivya-local-rules-v2",
      listings: [],
    };
  }
  if (mode !== "REMOTE_GATEWAY") throw new Error("LOGIVYA_EXTRACTION_MODE_INVALID");
  const endpoint = process.env.LOGIVYA_AI_EXTRACTION_URL?.trim();
  if (!endpoint) return { configured: false, provider: "REMOTE_GATEWAY_UNCONFIGURED", model: null, listings: [] };
  assertSafeAiEndpoint(endpoint);
  const model = process.env.LOGIVYA_AI_EXTRACTION_MODEL?.trim() || "logivya-logistics-extraction-v1";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), aiTimeoutMs());
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(process.env.LOGIVYA_AI_EXTRACTION_API_KEY ? { Authorization: `Bearer ${process.env.LOGIVYA_AI_EXTRACTION_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model,
        task: "LOGIVYA_WHATSAPP_LOGISTICS_EXTRACTION",
        schemaVersion: 1,
        responseSchema: z.toJSONSchema(gatewayResponseSchema),
        instructions: [
          "Return JSON only and follow the supplied schema.",
          "Split every independent route into a separate listing.",
          "Never infer or invent a value absent from the source message; use null.",
          "Never use the WhatsApp sender identity as contactPhone.",
          "NON_LOGISTICS and UNKNOWN messages must not contain logistics details.",
        ],
        context: {
          sourceMessageId: input.sourceMessageId,
          sourceTimestamp: input.sourceTimestamp.toISOString(),
          attachmentKinds: input.attachmentKinds,
        },
        message: input.text,
      }),
    });
    if (!response.ok) throw new Error(`LOGIVYA_AI_HTTP_${response.status}`);
    const rawBody = await response.text();
    if (rawBody.length > 1_500_000) throw new Error("LOGIVYA_AI_RESPONSE_TOO_LARGE");
    const parsed = gatewayResponseSchema.parse(JSON.parse(stripJsonFence(rawBody)));
    const listings = parsed.listings.map((listing) => validateLogivyaAiEvidence(listing, input)).filter((listing): listing is LogivyaAiListing => Boolean(listing));
    return { configured: true, provider: "LOGIVYA_AI_GATEWAY", model, listings };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("LOGIVYA_AI_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function validateLogivyaAiEvidence(listing: LogivyaAiListing, input: {
  text: string;
  sourceMessageId: string;
  sourceTimestamp: Date;
  defaultCountry: string;
  attachmentKinds: string[];
}): LogivyaAiListing | null {
  if (listing.sourceMessageId !== input.sourceMessageId) return null;
  if (!listing.isLogisticsListing || ["NON_LOGISTICS", "UNKNOWN"].includes(listing.listingType)) {
    return {
      ...emptyListing(listing.sourceLanguage, input.sourceMessageId),
      listingType: listing.listingType,
      isLogisticsListing: false,
      confidenceScore: listing.confidenceScore,
      extractedFromMedia: input.attachmentKinds.length > 0,
    } satisfies LogivyaAiListing;
  }

  const sourceNormalized = normalizeLogisticsText(input.text);
  const detectedLocations = findLogisticsLocations(input.text);
  const canonical = (value: string | null) => {
    if (!value) return null;
    const match = normalizeSingleLogisticsLocation(value);
    if (!match) return null;
    const present = detectedLocations.some((item) => item.canonical === match.canonical);
    return present ? match.canonical : null;
  };
  const originCity = canonical(listing.originCity ?? listing.originDistrict ?? listing.originFacility);
  const destinationCity = canonical(listing.destinationCity ?? listing.destinationDistrict ?? listing.destinationFacility);
  const explicitPhone = extractExplicitPhone(input.text);
  const normalizedPhone = listing.contactPhone && explicitPhone
    ? normalizeExplicitPhone(explicitPhone, input.defaultCountry)
    : null;
  const explicitWeights = extractExplicitTonnages(input.text);
  const explicitPrices = extractExplicitPrices(input.text);
  const explicitDates = extractExplicitLoadingDates(input.text, input.sourceTimestamp);
  const explicitVehicleCounts = extractExplicitVehicleCounts(input.text);
  const explicitVolumes = extractExplicitVolumes(input.text);
  const explicitLengths = extractExplicitVehicleLengths(input.text);
  const tonnageMin = numberAppears(listing.tonnageMin, explicitWeights) ? listing.tonnageMin : null;
  const tonnageMax = numberAppears(listing.tonnageMax, explicitWeights) ? listing.tonnageMax : null;
  const priceEvidence = explicitPrices.find((item) => numbersEqual(item.amount, listing.freightAmount)
    && (!listing.freightCurrency || item.currency === listing.freightCurrency));
  const loadingDate = listing.loadingDate && explicitDates.includes(listing.loadingDate) ? listing.loadingDate : null;
  const trailerSupported = listing.trailerType ? trailerEvidence(listing.trailerType, sourceNormalized) : null;
  const driverListingType = listing.listingType === "DRIVER" ? explicitDriverListingType(sourceNormalized, listing.driverListingType) : null;
  const driverLicenseClasses = listing.listingType === "DRIVER" ? explicitDriverLicenseClasses(sourceNormalized, listing.driverLicenseClasses) : [];
  const driverExperienceYears = listing.listingType === "DRIVER" ? explicitDriverExperienceYears(input.text, listing.driverExperienceYears) : null;
  const driverEmploymentType = listing.listingType === "DRIVER" ? explicitDriverEmploymentType(sourceNormalized, listing.driverEmploymentType) : null;
  const sourceContains = (value: string | null) => value && sourceNormalized.includes(normalizeLogisticsText(value)) ? value : null;
  const detectedCountryNames = new Set(detectedLocations.filter((item) => item.type === "COUNTRY").map((item) => item.canonical));
  const missing = new Set(listing.missingCriticalFields);
  if (!originCity) missing.add("origin");
  if (listing.listingType !== "DRIVER" && !destinationCity) missing.add("destination");
  if (!normalizedPhone) missing.add("publicContactPhone");
  if (!trailerSupported && listing.listingType !== "DRIVER") missing.add("trailerType");
  if (!loadingDate && listing.listingType !== "DRIVER") missing.add("loadingDate");
  if (!tonnageMin && listing.listingType !== "VEHICLE" && listing.listingType !== "DRIVER") missing.add("tonnage");
  if (listing.listingType === "DRIVER") {
    if (!driverListingType) missing.add("driverListingType");
    if (!driverLicenseClasses.length) missing.add("driverLicenseClasses");
    if (driverExperienceYears == null) missing.add("driverExperienceYears");
    if (!driverEmploymentType) missing.add("driverEmploymentType");
    if (!loadingDate) missing.add("loadingDate");
  }

  return {
    ...listing,
    title: evidenceTitle(listing.listingType, originCity, destinationCity),
    normalizedDescription: input.text.trim().slice(0, 2_000) || null,
    originCity,
    originCountry: originCity ? detectedLocations.find((item) => item.canonical === originCity)?.countryCode ?? null : null,
    originDistrict: null,
    originFacility: null,
    destinationCity,
    destinationCountry: destinationCity ? detectedLocations.find((item) => item.canonical === destinationCity)?.countryCode ?? null : null,
    destinationDistrict: null,
    destinationFacility: null,
    customsCity: null,
    routeDescription: originCity && destinationCity ? `${originCity} → ${destinationCity}` : originCity,
    transitCountries: listing.transitCountries.filter((value) => {
      const normalized = normalizeSingleLogisticsLocation(value);
      return normalized?.type === "COUNTRY" && detectedCountryNames.has(normalized.canonical);
    }),
    cargoType: sourceContains(listing.cargoType),
    cargoDescription: sourceContains(listing.cargoDescription),
    tonnageMin,
    tonnageMax,
    volumeM3: numberAppears(listing.volumeM3, explicitVolumes) ? listing.volumeM3 : null,
    vehicleCount: listing.vehicleCount != null && explicitVehicleCounts.includes(listing.vehicleCount) ? listing.vehicleCount : null,
    vehicleCategory: sourceContains(listing.vehicleCategory),
    trailerType: trailerSupported,
    vehicleTypeSpecified: Boolean(trailerSupported),
    bodyType: sourceContains(listing.bodyType),
    vehicleLength: numberAppears(listing.vehicleLength, explicitLengths) ? listing.vehicleLength : null,
    plateCountryRequirement: sourceContains(listing.plateCountryRequirement),
    loadingDate,
    loadingStatus: sourceContains(listing.loadingStatus),
    readyToLoad: hasExplicitBooleanSignal(sourceNormalized, ["yüklemeye hazır", "yuklemeye hazir", "ready to load", "готов к загрузке", "آماده بارگیری"]) ? listing.readyToLoad : null,
    urgent: hasExplicitBooleanSignal(sourceNormalized, ["acil", "urgent", "срочно", "فوری", "فوراً"]) ? listing.urgent : null,
    freightAmount: priceEvidence ? listing.freightAmount : null,
    freightCurrency: priceEvidence ? priceEvidence.currency : null,
    paymentType: sourceContains(listing.paymentType),
    contactPhone: normalizedPhone,
    contactName: sourceContains(listing.contactName),
    companyName: sourceContains(listing.companyName),
    driverListingType,
    driverLicenseClasses,
    driverExperienceYears,
    driverEmploymentType,
    driverInternationalExperience: listing.listingType === "DRIVER" && hasExplicitBooleanSignal(sourceNormalized, ["uluslararası", "uluslararasi", "international", "международ", "بین المللی", "بین‌المللی"]),
    driverAdrCertificate: listing.listingType === "DRIVER" && hasExplicitBooleanSignal(sourceNormalized, ["adr"]),
    driverSrcCertificate: listing.listingType === "DRIVER" && hasExplicitBooleanSignal(sourceNormalized, ["src"]),
    driverPsychotechnicalCertificate: listing.listingType === "DRIVER" && hasExplicitBooleanSignal(sourceNormalized, ["psikoteknik", "psychotechnical", "психотех"]),
    notes: null,
    confidenceScore: Math.min(listing.confidenceScore, evidenceConfidenceCap({ originCity, destinationCity, normalizedPhone, trailerSupported })),
    missingCriticalFields: [...missing],
    extractedFromMedia: input.attachmentKinds.length > 0,
  } satisfies LogivyaAiListing;
}

function emptyListing(sourceLanguage: LogivyaAiListing["sourceLanguage"], sourceMessageId: string): LogivyaAiListing {
  return {
    isLogisticsListing: false, listingType: "NON_LOGISTICS", sourceLanguage, title: null, normalizedDescription: null,
    originCountry: null, originCity: null, originDistrict: null, originFacility: null,
    destinationCountry: null, destinationCity: null, destinationDistrict: null, destinationFacility: null,
    customsCity: null, routeDescription: null, transitCountries: [], cargoType: null, cargoDescription: null,
    tonnageMin: null, tonnageMax: null, volumeM3: null, vehicleCount: null, vehicleCategory: null,
    vehicleTypeSpecified: false, trailerType: null, bodyType: null, vehicleLength: null,
    plateCountryRequirement: null, loadingDate: null, loadingStatus: null, readyToLoad: null, urgent: null,
    freightAmount: null, freightCurrency: null, paymentType: null, contactPhone: null, contactName: null,
    companyName: null, driverListingType: null, driverLicenseClasses: [], driverExperienceYears: null,
    driverEmploymentType: null, driverInternationalExperience: null, driverAdrCertificate: null,
    driverSrcCertificate: null, driverPsychotechnicalCertificate: null, notes: null, confidenceScore: 0, missingCriticalFields: [], extractedFromText: true,
    extractedFromMedia: false, sourceMessageId, contradictionDetected: false,
  };
}

function trailerEvidence(type: NonNullable<LogivyaAiListing["trailerType"]>, normalized: string) {
  const synonyms: Record<typeof type, string[]> = {
    CURTAINSIDER: ["tenteli", "tente", "curtainsider", "tautliner", "чадър", "چادری"],
    REFRIGERATED: ["frigo", "frigorifik", "reefer", "refrigerated", "реф", "یخچالی"],
    OPEN_TRAILER: ["açık dorse", "acik dorse", "open trailer", "کفی"],
    CLOSED_TRAILER: ["kapalı dorse", "kapali dorse", "closed trailer"],
    CONTAINER: ["konteyner", "container", "контейнер", "کانتینر"],
    LOWBED: ["lowbed", "low bed", "لوبد"],
    VAN: ["panelvan", "van", "фургон"],
    TRUCK: ["kamyon", "truck", "грузовик", "کامیون"],
  };
  return synonyms[type].some((term) => normalized.includes(normalizeLogisticsText(term))) ? type : null;
}

function extractExplicitPhone(text: string) {
  for (const match of text.matchAll(/(?:\+|00)?\d[\d\s().-]{8,24}\d/gu)) {
    const value = match[0].trim();
    const digits = value.replace(/\D/gu, "");
    if (digits.length >= 10 && digits.length <= 15) return value;
  }
  return null;
}

function normalizeExplicitPhone(value: string, defaultCountry: string) {
  try {
    return normalizePhonePairingInput({ countryIso: defaultCountry, nationalNumber: value }).e164;
  } catch {
    return null;
  }
}

function extractExplicitTonnages(text: string) {
  const normalized = normalizeNumerals(text);
  return [...normalized.matchAll(/(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:metric\s*)?(?:ton|tonne|tons?|تن)(?![\p{L}\p{N}])/giu)]
    .map((match) => localizedNumber(match[1]))
    .filter((value): value is number => value != null && value > 0 && value <= 200);
}

function extractExplicitVehicleCounts(text: string) {
  const normalized = normalizeNumerals(text);
  return [...normalized.matchAll(/(?:^|\s)(\d{1,3})\s*(?:araç|arac|tır|tir|kamyon|vehicle|truck|машин|грузовик|کامیون|تریلی)(?![\p{L}\p{N}])/giu)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value) && value > 0 && value <= 100);
}

function extractExplicitVolumes(text: string) {
  const normalized = normalizeNumerals(text);
  return [...normalized.matchAll(/(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:m3|m³|metreküp|cubic\s*met(?:er|re)s?)(?![\p{L}\p{N}])/giu)]
    .map((match) => localizedNumber(match[1]))
    .filter((value): value is number => value != null && value > 0);
}

function extractExplicitVehicleLengths(text: string) {
  const normalized = normalizeNumerals(text);
  return [...normalized.matchAll(/(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:m|metre|meter|meters|metres)\s*(?:uzunluk|length|kasa|body)?(?![\p{L}\p{N}])/giu)]
    .map((match) => localizedNumber(match[1]))
    .filter((value): value is number => value != null && value > 0 && value <= 40);
}

function extractExplicitPrices(text: string) {
  const normalized = normalizeNumerals(text);
  const results: Array<{ amount: number; currency: "TRY" | "USD" | "EUR" | "IRR" }> = [];
  for (const match of normalized.matchAll(/(\d{2,9}(?:[.,]\d{1,2})?)\s*(try|tl|₺|usd|\$|eur|€|irr|rial|riyal|ریال|دلار|یورو)(?![\p{L}\p{N}])/giu)) {
    const amount = localizedNumber(match[1]);
    const currency = normalizeCurrencyEvidence(match[2]);
    if (amount != null && amount > 0 && currency) results.push({ amount, currency });
  }
  return results;
}

function extractExplicitLoadingDates(text: string, sourceTimestamp: Date) {
  const normalized = normalizeNumerals(text);
  const dates = new Set<string>();
  for (const match of normalized.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/gu)) {
    const value = safeDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
    if (value) dates.add(value);
  }
  for (const match of normalized.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/gu)) {
    const value = safeDateParts(Number(match[3]), Number(match[2]), Number(match[1]));
    if (value) dates.add(value);
  }
  const languageNeutral = normalizeLogisticsText(normalized);
  if (["bugün", "bugun", "today", "сегодня", "امروز"].some((token) => languageNeutral.includes(token))) dates.add(utcDateOnly(sourceTimestamp, 0));
  if (["yarın", "yarin", "tomorrow", "завтра", "فردا"].some((token) => languageNeutral.includes(token))) dates.add(utcDateOnly(sourceTimestamp, 1));
  return [...dates];
}

function normalizeNumerals(value: string) {
  const source = "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩";
  return value.replace(/[۰-۹٠-٩]/gu, (digit) => String(source.indexOf(digit) % 10));
}

function localizedNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCurrencyEvidence(value: string | undefined) {
  const normalized = value?.toLocaleLowerCase("en-US");
  if (["try", "tl", "₺"].includes(normalized ?? "")) return "TRY" as const;
  if (["usd", "$", "دلار"].includes(normalized ?? "")) return "USD" as const;
  if (["eur", "€", "یورو"].includes(normalized ?? "")) return "EUR" as const;
  if (["irr", "rial", "riyal", "ریال"].includes(normalized ?? "")) return "IRR" as const;
  return null;
}

function numberAppears(value: number | null, evidence: number[]) {
  return value != null && evidence.some((candidate) => numbersEqual(candidate, value));
}

function numbersEqual(left: number | null, right: number | null) {
  return left != null && right != null && Math.abs(left - right) < 0.001;
}

function safeDateParts(year: number, month: number, day: number) {
  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return null;
  return value.toISOString().slice(0, 10);
}

function utcDateOnly(source: Date, offsetDays: number) {
  const value = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate() + offsetDays));
  return value.toISOString().slice(0, 10);
}

function evidenceTitle(type: LogivyaAiListing["listingType"], origin: string | null, destination: string | null) {
  const label = type === "VEHICLE" ? "Araç" : type === "PARTIAL_LOAD" ? "Parsiyel yük" : type === "DRIVER" ? "Şoför" : "Yük";
  return [label, origin && destination ? `${origin} → ${destination}` : origin || destination].filter(Boolean).join(" · ").slice(0, 240);
}

function hasExplicitBooleanSignal(normalizedSource: string, signals: string[]) {
  return signals.some((signal) => normalizedSource.includes(normalizeLogisticsText(signal)));
}

function explicitDriverListingType(source: string, proposed: LogivyaAiListing["driverListingType"]) {
  if (!proposed) return null;
  const available = ["şoför iş arıyor", "sofor is ariyor", "şoför müsait", "sofor musait", "driver available", "driver looking for work", "водитель ищет работу", "راننده آماده کار"];
  const wanted = ["şoför aranıyor", "sofor araniyor", "şoför lazım", "sofor lazim", "driver wanted", "driver needed", "требуется водитель", "راننده نیاز"];
  const evidence = proposed === "DRIVER_AVAILABLE" ? available : wanted;
  return hasExplicitBooleanSignal(source, evidence) ? proposed : null;
}

function explicitDriverLicenseClasses(source: string, proposed: LogivyaAiListing["driverLicenseClasses"]) {
  return proposed.filter((license) => {
    const escaped = license.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "iu").test(source);
  });
}

function explicitDriverExperienceYears(text: string, proposed: LogivyaAiListing["driverExperienceYears"]) {
  if (proposed == null) return null;
  const normalized = normalizeNumerals(text);
  const years = [...normalized.matchAll(/(\d{1,2})\s*(?:yıl|yil|years?|лет|سال)(?![\p{L}\p{N}])/giu)].map((match) => Number(match[1]));
  return years.includes(proposed) ? proposed : null;
}

function explicitDriverEmploymentType(source: string, proposed: LogivyaAiListing["driverEmploymentType"]) {
  if (!proposed) return null;
  const signals: Record<NonNullable<LogivyaAiListing["driverEmploymentType"]>, string[]> = {
    FULL_TIME: ["tam zamanlı", "tam zamanli", "full time", "full-time", "полный рабочий день", "تمام وقت"],
    PART_TIME: ["yarı zamanlı", "yari zamanli", "part time", "part-time", "неполный рабочий день", "پاره وقت"],
    CONTRACT: ["sözleşmeli", "sozlesmeli", "contract", "контракт", "قراردادی"],
    DAILY: ["günlük", "gunluk", "daily", "поденно", "روزانه"],
  };
  return hasExplicitBooleanSignal(source, signals[proposed]) ? proposed : null;
}

function evidenceConfidenceCap(input: { originCity: string | null; destinationCity: string | null; normalizedPhone: string | null; trailerSupported: string | null }) {
  let cap = 55;
  if (input.originCity) cap += 10;
  if (input.destinationCity) cap += 10;
  if (input.normalizedPhone) cap += 10;
  if (input.trailerSupported) cap += 10;
  return Math.min(95, cap);
}

function stripJsonFence(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("```") ? trimmed.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "") : trimmed;
}

function assertSafeAiEndpoint(value: string) {
  const url = new URL(value);
  if (url.protocol === "https:") return;
  if (url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return;
  throw new Error("LOGIVYA_AI_ENDPOINT_REQUIRES_HTTPS");
}

function aiTimeoutMs() {
  return Math.min(120_000, Math.max(5_000, Number(process.env.LOGIVYA_AI_EXTRACTION_TIMEOUT_MS || 25_000)));
}
