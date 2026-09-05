import "server-only";

import { createHash } from "node:crypto";
import { sourceLoadingDate } from "@/server/freight/source-date";
import { splitSourceRoutes } from "@/server/freight/source-routes";
import { boundedDatabaseText } from "@/server/security/database-text";
import type {
  FreightCandidateIntent,
  FreightTrailerType,
  MarketplaceRequestKind,
} from "@prisma/client";

import {
  findLogisticsLocationOccurrences,
  normalizeLogisticsText,
  type NormalizedLogisticsLocation,
} from "@/server/freight/location-normalization";

const FREIGHT_SIGNALS = [
  "yük", "yuk", "tır", "tir", "kamyon", "araç", "arac", "ton", "tente", "tenteli", "frigo",
  "lowbed", "konteyner", "lojistik", "nakliye", "yükleme", "yükler", "boş", "freight", "cargo",
  "truck", "trailer", "load", "vehicle", "driver", "бар", "груз", "грузоперевозки", "фура",
  "машина", "тонна", "тонны", "водитель", "загрузка", "yuklash", "mashina", "haydovchi",
  "tonna", "maşın", "qoşqu", "sürücü", "boş maşın", "بار", "کامیون", "تریلی", "ماشین", "تن",
  "راننده", "حمولة", "شحنة", "شاحنة", "سائق", "تحميل", "طن",
] as const;
const NEED_SIGNALS = [
  "lazım", "lazim", "aranıyor", "araniyor", "arıyoruz", "istiyoruz", "needed", "required", "need",
  "нужен", "нужна", "нужно", "требуется", "kerak", "axtarılır", "axtarilir", "lazımdır", "نیاز",
  "لازم", "میخواهیم", "می خواهیم", "مطلوب", "نحتاج",
] as const;
const AVAILABLE_VEHICLE_SIGNALS = [
  "boş araç", "bos arac", "boş tır", "bos tir", "boş kamyon", "available truck", "empty truck",
  "empty vehicle", "свободная машина", "свободная фура", "пустая машина", "bo'sh mashina", "bo‘sh mashina",
  "boş maşın", "ماشین خالی", "کامیون خالی", "شاحنة فارغة", "سيارة فارغة",
] as const;
const DRIVER_SIGNALS = ["şoför", "sofor", "driver", "водитель", "haydovchi", "sürücü", "راننده", "سائق"] as const;
const LOAD_OFFER_SIGNALS = [
  "yük hazır", "yuk hazir", "yükleme hazır", "yukleme hazir", "yük için araç", "yuk icin arac",
  "load ready", "cargo ready", "freight ready", "груз готов", "готов к загрузке", "yuk tayyor",
  "yük hazırdır", "بار آماده", "بارگیری آماده", "بار فعال", "الحمولة جاهزة", "جاهز للتحميل",
] as const;

const TRAILER_TERMS: ReadonlyArray<[FreightTrailerType, readonly string[]]> = [
  ["CURTAINSIDER", ["tenteli", "tente", "curtainsider", "tautliner", "چادری", "ترانزیت چادری"]],
  ["REFRIGERATED", ["frigo", "frigorifik", "reefer", "refrigerated", "реф", "рефрижератор", "soyuducu", "مبرد", "مبردة", "یخچالی"]],
  ["OPEN_TRAILER", ["açık dorse", "acik dorse", "open trailer", "открытый прицеп", "مقطورة مفتوحة", "کفی"]],
  ["CLOSED_TRAILER", ["kapalı dorse", "kapali dorse", "closed trailer", "закрытый прицеп", "مقطورة مغلقة"]],
  ["CONTAINER", ["konteyner", "container", "контейнер", "حاوية", "کانتینر"]],
  ["LOWBED", ["lowbed", "low bed", "لوبد"]],
  ["VAN", ["panelvan", "cargo van", "delivery van", "фургон"]],
  ["TRUCK", ["kamyon", "truck", "грузовик", "شاحنة", "کامیون"]],
] as const;

export type ExtractedFreightCandidate = {
  candidateType: MarketplaceRequestKind;
  intent: FreightCandidateIntent;
  origin: NormalizedLogisticsLocation | null;
  destination: NormalizedLogisticsLocation | null;
  loadingDate: Date | null;
  cargoType: string | null;
  weight: number | null;
  trailerType: FreightTrailerType | null;
  vehicleCount: number | null;
  priceAmount: number | null;
  currency: string | null;
  customsInformation: string | null;
  companyName: string | null;
  advertisedBusinessContact: string | null;
  sourceExcerpt: string;
  confidence: number;
  duplicateKey: string;
};

export function isProbableFreightMessage(text: string) {
  const normalized = normalizeLogisticsText(text);
  if (normalized.length < 8 || normalized.length > 12_000) return false;
  const signalCount = FREIGHT_SIGNALS.reduce((count, signal) => count + (containsSignal(normalized, signal) ? 1 : 0), 0);
  const locations = findLogisticsLocationOccurrences(text);
  const hasRoute = locations.length >= 2 || /(?:→|->|=>|\/)/u.test(text);
  const hasWeight = /\d{1,3}(?:[.,]\d{1,2})?\s*(?:ton|tonne|tons?|tonna|тонн?а?|тонны|тонн|t|تن|طن)(?![\p{L}\p{N}])/iu.test(text);
  return signalCount >= 2 || (signalCount >= 1 && (hasRoute || hasWeight));
}

export function extractFreightCandidates(text: string, timestamp: Date, timeZone = "Europe/Istanbul"): ExtractedFreightCandidate[] {
  if (!isProbableFreightMessage(text)) return [];
  const sections = splitSourceRoutes(text);
  const candidates: ExtractedFreightCandidate[] = [];
  for (const { text: section, origin, destination } of sections) {
    if ((!origin || !destination) && !hasDriverSignal(section)) continue;
    const candidateType = classifyCandidateType(section);
    const intent = classifyIntent(section, candidateType);
    const weight = extractWeight(section);
    const trailerType = extractTrailerType(section);
    const vehicleCount = extractVehicleCount(section);
    const loadingDate = sourceLoadingDate(section, timestamp, timeZone);
    const contact = extractAdvertisedContact(section) ?? extractAdvertisedContact(text);
    const price = extractPrice(section);
    const confidence = extractionConfidence({ origin, destination, weight, trailerType, contact, candidateType, section });
    if (confidence < 45) continue;
    const duplicateMaterial = [
      candidateType,
      intent,
      origin?.canonical ?? "?",
      destination?.canonical ?? "?",
      trailerType ?? "?",
      weight ?? "?",
      vehicleCount ?? "?",
      contact ?? "?",
      timestamp.toISOString().slice(0, 10),
    ].join("|");
    candidates.push({
      candidateType,
      intent,
      origin,
      destination,
      loadingDate,
      cargoType: extractCargoType(section),
      weight,
      trailerType,
      vehicleCount,
      priceAmount: price?.amount ?? null,
      currency: price?.currency ?? null,
      customsInformation: extractCustomsInformation(section),
      companyName: extractCompanyName(text),
      advertisedBusinessContact: contact,
      sourceExcerpt: boundedDatabaseText(section, 2_000),
      confidence,
      duplicateKey: sha256(duplicateMaterial),
    });
  }
  return deduplicateExtractedCandidates(candidates);
}

export function sourceTextHash(text: string) {
  return sha256(normalizeLogisticsText(text));
}

function classifyCandidateType(text: string): MarketplaceRequestKind {
  const normalized = normalizeLogisticsText(text);
  if (hasDriverSignal(normalized)) return "DRIVER";
  if (containsAnySignal(normalized, AVAILABLE_VEHICLE_SIGNALS)) return "VEHICLE";
  return "LOAD";
}

function classifyIntent(text: string, type: MarketplaceRequestKind): FreightCandidateIntent {
  const normalized = normalizeLogisticsText(text);
  const need = containsAnySignal(normalized, NEED_SIGNALS);
  if (!need) return "OFFER";
  if (type === "LOAD" && containsAnySignal(normalized, LOAD_OFFER_SIGNALS)) {
    return "OFFER";
  }
  return "NEED";
}

function hasDriverSignal(text: string) {
  const normalized = normalizeLogisticsText(text);
  return containsAnySignal(normalized, DRIVER_SIGNALS);
}

function extractWeight(text: string) {
  const match = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:ton|tonne|tons?|tonna|тонн?а?|тонны|тонн|t|تن|طن)(?![\p{L}\p{N}])/iu.exec(text);
  if (!match?.[1]) {
    const kilograms = /(\d{1,3}(?:[. ]\d{3})+|\d{1,6})(?:[.,](\d{1,2}))?\s*(?:kg|kilogram)(?![\p{L}\p{N}])/iu.exec(text);
    if (!kilograms?.[1]) return null;
    const value = Number(`${kilograms[1].replace(/[. ]/gu, "")}.${kilograms[2] ?? "0"}`) / 1_000;
    return value > 0 && value <= 200 ? value : null;
  }
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 && value <= 200 ? value : null;
}

function extractTrailerType(text: string) {
  const normalized = normalizeLogisticsText(text);
  return TRAILER_TERMS.find(([, terms]) => containsAnySignal(normalized, terms))?.[0] ?? null;
}

function extractVehicleCount(text: string) {
  const match = /(\d{1,2})\s*(?:(?:adet|dona|ədəd|штук|шт|عدد|دستگاه)\s*)?(?:(?:kapalı|kapali|açık|acik|tenteli|frigo|soğutuculu|sogutuculu)[/\s]*)*(?:araç|arac|tır|tir|kamyon|truck|vehicle|машин[аы]?|фур[аы]?|mashina|maşın|شاحنة|سيارة|کامیون|ماشین|تریلی)(?![\p{L}\p{N}])/iu.exec(text);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 && value <= 100 ? value : null;
}

function extractLoadingDate(text: string, sourceTimestamp: Date) {
  return sourceLoadingDate(text, sourceTimestamp);
}

function extractAdvertisedContact(text: string) {
  const phone = /(?:\+|00)?\d[\d\s().-]{7,20}\d/u.exec(text)?.[0]?.replace(/[\s().-]/gu, "") ?? null;
  if (phone && phone.replace(/\D/gu, "").length >= 8) return phone.startsWith("00") ? `+${phone.slice(2)}` : phone;
  return /@[A-Za-z0-9_]{4,32}/u.exec(text)?.[0] ?? null;
}

function extractPrice(text: string) {
  const match = /(\d{2,9}(?:[.,]\d{1,2})?)\s*(try|tl|usd|eur|irr|rub|azn|uzs|aed|sar|toman|₺|\$|€|₽|تومان|ریال|دلار|یورو|روبل|درهم|ريال)(?![\p{L}\p{N}])/iu.exec(text);
  if (!match?.[1] || !match[2]) return null;
  const amount = Number(match[1].replace(",", "."));
  const currencyToken = normalizeLogisticsText(match[2]);
  const currency = ["tl", "try", "₺"].includes(currencyToken) ? "TRY"
    : ["usd", "$", "دلار"].includes(currencyToken) ? "USD"
      : ["eur", "€", "یورو"].includes(currencyToken) ? "EUR"
        : ["rub", "₽", "روبل"].includes(currencyToken) ? "RUB"
          : currencyToken === "azn" ? "AZN"
            : currencyToken === "uzs" ? "UZS"
              : ["aed", "درهم"].includes(currencyToken) ? "AED"
                : ["sar", "ريال"].includes(currencyToken) ? "SAR" : "IRR";
  return Number.isFinite(amount) && amount > 0 ? { amount, currency } : null;
}

function extractCustomsInformation(text: string) {
  const line = text.split(/\n/gu).find((value) => /gümrük|gumruk|customs|گمرک/iu.test(value));
  return line?.trim().slice(0, 240) ?? null;
}

function extractCargoType(text: string) {
  const match = /(?:^|[^\p{L}\p{N}])(?:yük(?:\s+(?:türü|cinsi))?|yuk(?:\s+(?:turu|cinsi))?|cargo(?:\s+type)?|load(?:\s+type)?|груз|حمولة|شحنة|بار)\s*:\s*([^\n,;]{2,80})/iu.exec(text)?.[1]?.trim();
  if (!match || /hazır|hazir|ready|آماده/iu.test(match)) return null;
  return match.split(/(?:[\p{So}\uFE0F]|(?:sıcaklık|sicaklik|temperature|tonaj|tonnage|iletişim|iletisim|contact|araç tipi|arac tipi|yükleme|yukleme|boşaltma|bosaltma)\s*:|[+−-]?\d+\s*°)/iu)[0].trim().slice(0, 80).toWellFormed() || null;
}

function extractCompanyName(text: string) {
  const firstLines = text.split(/\n/gu).map((line) => line.trim()).filter(Boolean).slice(0, 3);
  const company = firstLines.find((line) => /logistics|lojistik|transport|nakliyat|логистик|транспорт|ترابری|حمل|نقل/iu.test(line) && line.length <= 120);
  return company ?? null;
}

function extractionConfidence(input: {
  origin: NormalizedLogisticsLocation | null;
  destination: NormalizedLogisticsLocation | null;
  weight: number | null;
  trailerType: FreightTrailerType | null;
  contact: string | null;
  candidateType: MarketplaceRequestKind;
  section: string;
}) {
  let score = 20;
  if (input.origin) score += 20;
  if (input.destination) score += 20;
  if (input.weight != null) score += 10;
  if (input.trailerType) score += 10;
  if (input.contact) score += 10;
  if (input.candidateType === "DRIVER" || containsAnySignal(normalizeLogisticsText(input.section), FREIGHT_SIGNALS)) score += 10;
  return Math.min(100, score);
}

function containsAnySignal(normalizedText: string, signals: readonly string[]) {
  return signals.some((signal) => containsSignal(normalizedText, signal));
}

function containsSignal(normalizedText: string, signal: string) {
  const normalizedSignal = normalizeLogisticsText(signal);
  if (!normalizedSignal) return false;
  const escaped = normalizedSignal.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u").test(normalizedText);
}

function deduplicateExtractedCandidates(candidates: ExtractedFreightCandidate[]) {
  const unique = new Map<string, ExtractedFreightCandidate>();
  for (const candidate of candidates) if (!unique.has(candidate.duplicateKey)) unique.set(candidate.duplicateKey, candidate);
  return [...unique.values()];
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}
