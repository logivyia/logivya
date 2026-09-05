import type {
  FreightTrailerType,
  LogisticsSectorClassification,
  LogisticsSourceGroupHint,
  MarketplaceScope,
} from "@prisma/client";

import { normalizeLogisticsText } from "@/server/freight/location-normalization";

const HOME_MOVING_SIGNALS = [
  "evden eve", "ev taşıma", "ev tasima", "ev nakliyesi", "ofis taşıma", "ofis tasima",
  "eşya taşıma", "esya tasima", "house moving", "home moving", "office moving", "apartment moving",
  "mobilya taşıma", "mobilya tasima", "asansörlü nakliyat", "asansorlu nakliyat",
  "eşya asansörü", "esya asansoru", "paketleme hizmeti", "ambalajlama hizmeti", "mobilya sökme",
  "mobilya sokme", "mobilya montaj", "şehirler arası ev", "sehirler arasi ev", "parça eşya", "parca esya",
] as const;
const PARTIAL_LOAD_SIGNALS = [
  "parsiyel", "parça yük", "parca yuk", "kısmi yük", "kismi yuk", "groupage", "ltl",
  "pallet freight", "palet yük", "palet yuk", "koli yük", "koli yuk", "partial load",
  "grupaj", "groupage", "parsiyel kapasite", "boş alan", "bos alan", "terminal teslim", "depo teslim",
  "shared capacity", "küp", "metreküp",
] as const;
const HEAVY_HAUL_SIGNALS = [
  "ağır nakliyat", "agir nakliyat", "gabari dışı", "gabari disi", "oversize", "overweight",
  "proje taşıma", "proje tasima", "iş makinesi", "is makinesi", "trafo taşıma", "trafo tasima",
  "vinç", "vinc", "lowbed", "low bed", "heavy haul", "özel izin", "ozel izin",
  "low loader", "uzamalı lowbed", "uzamali lowbed", "modüler dorse", "moduler dorse", "platform dorse",
  "ekskavatör", "ekskavator", "dozer", "loader", "sanayi makinesi", "yol izni", "güzergah etüdü", "guzergah etudu",
] as const;

export const SECTOR_CLASSIFICATION_VERSION = "logistics-sector-v1" as const;

export type SectorClassificationResult = {
  primarySector: LogisticsSectorClassification;
  marketplaceScopes: MarketplaceScope[];
  confidence: number;
  evidence: string[];
  secondarySectors: LogisticsSectorClassification[];
  contradictorySignals: string[];
  manualReviewRequired: boolean;
  classificationVersion: typeof SECTOR_CLASSIFICATION_VERSION;
};

export function classifyLogisticsSector(input: {
  text: string;
  listingType?: string | null;
  trailerType?: FreightTrailerType | null;
  groupHint?: LogisticsSourceGroupHint | null;
}): SectorClassificationResult {
  const normalized = normalizeLogisticsText(input.text);
  const evidence = {
    HOME_MOVING: matchingSignals(normalized, HOME_MOVING_SIGNALS),
    PARTIAL_LOAD: matchingSignals(normalized, PARTIAL_LOAD_SIGNALS),
    HEAVY_HAUL: matchingSignals(normalized, HEAVY_HAUL_SIGNALS),
  };

  if (input.listingType === "PARTIAL_LOAD" && !evidence.PARTIAL_LOAD.includes("listing_type:PARTIAL_LOAD")) {
    evidence.PARTIAL_LOAD.push("listing_type:PARTIAL_LOAD");
  }
  if (input.trailerType === "LOWBED" && !evidence.HEAVY_HAUL.includes("trailer_type:LOWBED")) {
    evidence.HEAVY_HAUL.push("trailer_type:LOWBED");
  }

  const scored = (Object.entries(evidence) as Array<["HOME_MOVING" | "PARTIAL_LOAD" | "HEAVY_HAUL", string[]]>)
    .map(([sector, signals]) => ({ sector, signals, score: signals.length * 30 + hintBonus(input.groupHint, sector) }))
    .filter((item) => item.signals.length > 0)
    .sort((left, right) => right.score - left.score);

  if (!scored.length) {
    return {
      primarySector: "GENERAL_LOGISTICS",
      marketplaceScopes: ["GLOBAL"],
      confidence: 80,
      evidence: [],
      secondarySectors: [],
      contradictorySignals: [],
      manualReviewRequired: false,
      classificationVersion: SECTOR_CLASSIFICATION_VERSION,
    };
  }

  const independentlyRelevant = scored.filter((item) => item.signals.length >= 1 && item.score >= 30);
  const primary = scored[0];
  const marketplaceScopes: MarketplaceScope[] = ["GLOBAL", ...independentlyRelevant.map((item) => item.sector)];
  const uniqueScopes = [...new Set(marketplaceScopes)];
  const primarySector = independentlyRelevant.length > 1 ? "MULTI_SECTOR" : primary.sector;
  const contradictorySignals = input.groupHint
    && !["UNKNOWN", "MIXED", "GENERAL_LOGISTICS", primary.sector].includes(input.groupHint)
    ? [`GROUP_HINT:${input.groupHint}`, `MESSAGE_SIGNAL:${primary.sector}`]
    : [];
  const confidence = Math.min(98, 60 + primary.signals.length * 12 + hintBonus(input.groupHint, primary.sector));
  return {
    primarySector,
    marketplaceScopes: uniqueScopes,
    confidence,
    evidence: scored.flatMap((item) => item.signals.map((signal) => `${item.sector}:${signal}`)),
    secondarySectors: independentlyRelevant.slice(primarySector === "MULTI_SECTOR" ? 0 : 1).map((item) => item.sector),
    contradictorySignals,
    manualReviewRequired: contradictorySignals.length > 0 || (primarySector === "MULTI_SECTOR" && confidence < 84),
    classificationVersion: SECTOR_CLASSIFICATION_VERSION,
  };
}

export function marketplaceScopesForSector(sector: LogisticsSectorClassification): MarketplaceScope[] {
  if (sector === "HOME_MOVING") return ["GLOBAL", "HOME_MOVING"];
  if (sector === "PARTIAL_LOAD") return ["GLOBAL", "PARTIAL_LOAD"];
  if (sector === "HEAVY_HAUL") return ["GLOBAL", "HEAVY_HAUL"];
  return ["GLOBAL"];
}

export function specializedMarketplaceScope(
  sector: LogisticsSectorClassification,
): Exclude<MarketplaceScope, "GLOBAL"> | null {
  if (sector === "HOME_MOVING" || sector === "PARTIAL_LOAD" || sector === "HEAVY_HAUL") return sector;
  return null;
}

export function automaticListingExpiry(sourceTimestamp: Date, _hasExplicitDate = false) {
  return new Date(sourceTimestamp.getTime() + automaticListingDefaultTtlHours() * 60 * 60_000);
}

export function automaticListingDefaultTtlHours() {
  return 36;
}

function matchingSignals(normalized: string, signals: readonly string[]) {
  return signals.filter((signal) => normalized.includes(normalizeLogisticsText(signal)));
}

function hintBonus(hint: LogisticsSourceGroupHint | null | undefined, sector: string) {
  if (!hint || hint === "UNKNOWN" || hint === "MIXED" || hint === "GENERAL_LOGISTICS") return 0;
  return hint === sector ? 8 : 0;
}
