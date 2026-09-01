import { normalizeLogisticsText } from "@/server/freight/location-normalization";

const LOGISTICS_GROUP_SIGNAL_ROOTS = [
  "lojistik", "nakliy", "yük", "yuk", "tır", "tir", "kamyon", "dorse", "damper", "panelvan", "minivan", "kargo",
  "freight", "cargo", "transport", "truck", "load", "vehicle", "бар", "груз", "логист", "بار", "کامیون", "ترابر", "لجستیک", "حمل", "نقل",
] as const;

function logisticsSignalMatches(value: string) {
  const tokens = normalizeLogisticsText(value).match(/[\p{L}\p{N}]+/gu) ?? [];
  return LOGISTICS_GROUP_SIGNAL_ROOTS.filter((rawSignal) => {
    const signal = normalizeLogisticsText(rawSignal);
    return tokens.some((token) => token === signal || token.startsWith(signal));
  });
}

export function recommendLogisticsWhatsAppGroup(name: string, description?: string | null) {
  const nameMatches = logisticsSignalMatches(name);
  const descriptionMatches = logisticsSignalMatches(description ?? "")
    .filter((signal) => !nameMatches.includes(signal));
  // A description can improve an already credible recommendation, but it must
  // never turn a generic/social group name into an ingestion source candidate.
  const confidence = nameMatches.length === 0
    ? 10
    : Math.min(98, 55 + nameMatches.length * 12 + Math.min(2, descriptionMatches.length) * 6);
  return { recommended: confidence >= 67, confidence };
}
