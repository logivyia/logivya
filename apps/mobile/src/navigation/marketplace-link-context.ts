const MARKETPLACE_IDENTIFIER_MAX_LENGTH = 100;

export function normalizeMarketplaceLinkIdentifier(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MARKETPLACE_IDENTIFIER_MAX_LENGTH) return null;
  if (/\p{C}/u.test(normalized)) return null;
  return normalized;
}

export function parseMarketplaceLinkIdentifier(value: string) {
  return normalizeMarketplaceLinkIdentifier(value) ?? "";
}

export function hasInvalidMarketplaceLinkIdentifier(value: unknown) {
  return value !== undefined && normalizeMarketplaceLinkIdentifier(value) === null;
}
