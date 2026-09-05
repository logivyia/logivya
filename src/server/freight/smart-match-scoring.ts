import "server-only";

import type { FreightOpportunityCandidate, MarketplaceDemandRequest } from "@prisma/client";

import { locationCompatibility, normalizeLogisticsText } from "@/server/freight/location-normalization";
import { specializedMarketplaceScope } from "@/server/freight/sector-classification";

type DemandForScoring = Pick<MarketplaceDemandRequest,
  | "kind" | "origin" | "originNormalized" | "destination" | "destinationNormalized"
  | "location" | "locationNormalized" | "availableFrom" | "availableUntil" | "trailerType"
  | "minWeight" | "maxWeight" | "keywordsNormalized" | "expiresAt" | "status"
  | "primarySector" | "marketplaceScopes"
>;

type CandidateForScoring = Pick<FreightOpportunityCandidate,
  | "candidateType" | "intent" | "origin" | "originNormalized" | "originCountry"
  | "destination" | "destinationNormalized" | "destinationCountry" | "loadingDate"
  | "trailerType" | "weight" | "searchText" | "sourceMessageTimestamp" | "expiresAt"
  | "extractionConfidence"
  | "primarySector" | "marketplaceScopes"
>;

type Dimension = {
  code: string;
  status: "MATCH" | "CLOSE_MATCH" | "NOT_REQUESTED" | "UNKNOWN";
  weight: number;
  score: number;
  requested?: string | number | null;
  candidate?: string | number | null;
};

export type SmartMatchScore = {
  score: number;
  originScore: number;
  destinationScore: number;
  vehicleScore: number;
  weightScore: number;
  dateScore: number;
  freshnessScore: number;
  explanation: Dimension[];
};

export function calculateSmartCandidateMatch(
  demand: DemandForScoring,
  candidate: CandidateForScoring,
  now = new Date(),
): SmartMatchScore | null {
  if (demand.status !== "ACTIVE" || demand.expiresAt <= now) return null;
  if (candidate.intent !== "OFFER" || demand.kind !== candidate.candidateType || candidate.expiresAt <= now) return null;

  const dimensions: Dimension[] = [];
  const requestedSector = specializedMarketplaceScope(demand.primarySector);
  if (requestedSector && !candidate.marketplaceScopes.includes(requestedSector)) return null;
  dimensions.push({
    code: "SECTOR",
    status: requestedSector ? "MATCH" : "NOT_REQUESTED",
    weight: requestedSector ? 25 : 0,
    score: 100,
    requested: requestedSector,
    candidate: candidate.primarySector,
  });
  const originRequested = demand.kind === "DRIVER" ? demand.location ?? demand.locationNormalized : demand.origin ?? demand.originNormalized;
  const originCandidate = demand.kind === "DRIVER"
    ? { normalized: candidate.originNormalized ?? candidate.destinationNormalized, countryCode: candidate.originCountry ?? candidate.destinationCountry }
    : { normalized: candidate.originNormalized, countryCode: candidate.originCountry };
  const origin = locationCompatibility(originRequested, originCandidate);
  if (!origin.compatible) return null;
  dimensions.push({
    code: demand.kind === "DRIVER" ? "LOCATION" : "ORIGIN",
    status: originRequested ? (origin.score === 100 ? "MATCH" : "CLOSE_MATCH") : "NOT_REQUESTED",
    weight: originRequested ? 20 : 0,
    score: origin.score,
    requested: originRequested,
    candidate: originCandidate.normalized,
  });

  const destinationRequested = demand.kind === "DRIVER" ? null : demand.destination ?? demand.destinationNormalized;
  const destination = locationCompatibility(destinationRequested, {
    normalized: candidate.destinationNormalized,
    countryCode: candidate.destinationCountry,
  });
  if (!destination.compatible) return null;
  dimensions.push({
    code: "DESTINATION",
    status: destinationRequested ? (destination.score === 100 ? "MATCH" : "CLOSE_MATCH") : "NOT_REQUESTED",
    weight: destinationRequested ? 20 : 0,
    score: destination.score,
    requested: destinationRequested,
    candidate: candidate.destinationNormalized,
  });

  const vehicleScore = 100;
  if (demand.trailerType) {
    if (!candidate.trailerType || candidate.trailerType !== demand.trailerType) return null;
    dimensions.push({ code: "VEHICLE_TYPE", status: "MATCH", weight: 15, score: 100, requested: demand.trailerType, candidate: candidate.trailerType });
  } else {
    dimensions.push({ code: "VEHICLE_TYPE", status: "NOT_REQUESTED", weight: 0, score: 100, candidate: candidate.trailerType });
  }

  const weightScore = 100;
  const minWeight = demand.minWeight == null ? null : Number(demand.minWeight);
  const maxWeight = demand.maxWeight == null ? null : Number(demand.maxWeight);
  const candidateWeight = candidate.weight == null ? null : Number(candidate.weight);
  if (minWeight != null || maxWeight != null) {
    if (candidateWeight == null) return null;
    if (minWeight != null && candidateWeight < minWeight) return null;
    if (maxWeight != null && candidateWeight > maxWeight) return null;
    dimensions.push({ code: "WEIGHT", status: "MATCH", weight: 10, score: 100, requested: `${minWeight ?? "*"}-${maxWeight ?? "*"}`, candidate: candidateWeight });
  } else {
    dimensions.push({ code: "WEIGHT", status: "NOT_REQUESTED", weight: 0, score: 100, candidate: candidateWeight });
  }

  let dateScore = 100;
  const dateRequested = Boolean(demand.availableFrom || demand.availableUntil);
  if (dateRequested) {
    if (!candidate.loadingDate) {
      dateScore = 50;
      dimensions.push({ code: "DATE", status: "UNKNOWN", weight: 10, score: dateScore, candidate: null });
    } else {
      if (demand.availableFrom && candidate.loadingDate < demand.availableFrom) return null;
      if (demand.availableUntil && candidate.loadingDate > demand.availableUntil) return null;
      dimensions.push({ code: "DATE", status: "MATCH", weight: 10, score: 100, candidate: candidate.loadingDate.toISOString().slice(0, 10) });
    }
  } else {
    dimensions.push({ code: "DATE", status: "NOT_REQUESTED", weight: 0, score: 100, candidate: candidate.loadingDate?.toISOString().slice(0, 10) ?? null });
  }

  if (demand.keywordsNormalized.length) {
    const normalizedSearch = normalizeLogisticsText(candidate.searchText);
    if (!demand.keywordsNormalized.some((keyword) => normalizedSearch.includes(normalizeLogisticsText(keyword)))) return null;
    dimensions.push({ code: "KEYWORDS", status: "MATCH", weight: 10, score: 100, requested: demand.keywordsNormalized.join(", ") });
  } else {
    dimensions.push({ code: "KEYWORDS", status: "NOT_REQUESTED", weight: 0, score: 100 });
  }

  const freshnessScore = calculateFreshnessScore(candidate.sourceMessageTimestamp, now);
  if (freshnessScore <= 0) return null;
  dimensions.push({
    code: "FRESHNESS",
    status: freshnessScore >= 85 ? "MATCH" : "CLOSE_MATCH",
    weight: 15,
    score: freshnessScore,
    candidate: candidate.sourceMessageTimestamp.toISOString(),
  });

  dimensions.push({
    code: "EXTRACTION_CONFIDENCE",
    status: candidate.extractionConfidence >= 75 ? "MATCH" : "CLOSE_MATCH",
    weight: 10,
    score: candidate.extractionConfidence,
    candidate: candidate.extractionConfidence,
  });

  const weighted = dimensions.reduce((total, dimension) => total + dimension.score * dimension.weight, 0);
  const totalWeight = dimensions.reduce((total, dimension) => total + dimension.weight, 0);
  const score = totalWeight ? Math.round(weighted / totalWeight) : 0;
  if (score < 60) return null;
  return {
    score,
    originScore: origin.score,
    destinationScore: destination.score,
    vehicleScore,
    weightScore,
    dateScore,
    freshnessScore,
    explanation: dimensions,
  };
}

export function calculateFreshnessScore(timestamp: Date, now = new Date()) {
  const ageHours = Math.max(0, (now.getTime() - timestamp.getTime()) / 3_600_000);
  if (ageHours <= 6) return 100;
  if (ageHours <= 24) return 90;
  if (ageHours <= 48) return 70;
  if (ageHours <= 72) return 45;
  if (ageHours <= 168) return 20;
  return 0;
}
