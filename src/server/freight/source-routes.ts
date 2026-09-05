import { findLogisticsLocationOccurrences, normalizeLogisticsText, type NormalizedLogisticsLocation } from "./location-normalization";

const separator = /(?:→|⇒|➜|➡|▶|►|➔|[-–—]{1,3}\s*>?|=>)/u;
const attributes = /(?:\d|[\p{So}\p{Cs}]|[\n,;|=]|(?:^|[^\p{L}\p{N}])(?:ton|tonne|kg|tir|tente|tenteli|frigo|panelvan|kamyon|kamyonet|kapalı|kapali|açık|acik|yüksek|yuksek|uzun|damperli|dorse|lowbed|yük|yuk|araç|arac|boş|bos|hazır|hazir|lazım|lazim|nakliye|yükleme|yukleme)(?=$|[^\p{L}\p{N}]))/iu;

export type SourceRouteSection = { text: string; origin: NormalizedLogisticsLocation | null; destination: NormalizedLogisticsLocation | null };

function endpoint(location: NormalizedLogisticsLocation, tail: string) {
  const suffix = tail.split(attributes)[0]?.trim().replace(/[-–—:]+$/u, "").trim() ?? "";
  // A short location qualifier is evidence from this endpoint, never another route.
  const district = suffix && /^[\p{L}\s.'’]{1,50}$/u.test(suffix) && suffix.split(/\s/u).length <= 3 ? suffix : "";
  const canonical = `${location.canonical}${district ? ` ${district}` : ""}`;
  return { ...location, canonical, normalized: normalizeLogisticsText(canonical) };
}

export function splitSourceRoutes(value: string): SourceRouteSection[] {
  // This normalization has the same whitespace positions as the occurrence scanner.
  const text = value.normalize("NFKC").replace(/[ـ‌]/gu, " ").replace(/\s+/gu, " ").trim();
  const locations: NormalizedLogisticsLocation[] = [];
  for (const location of findLogisticsLocationOccurrences(text)) {
    const previous = locations.at(-1);
    if (previous && previous.countryCode === location.countryCode && previous.type !== location.type && (previous.type === "COUNTRY" || location.type === "COUNTRY") && /^[\s/,]*$/u.test(text.slice(previous.position + previous.original.length, location.position))) {
      const specific = previous.type === "COUNTRY" ? location : previous;
      locations[locations.length - 1] = { ...specific, position: previous.position, original: text.slice(previous.position, location.position + location.original.length) };
    } else locations.push(location);
  }
  const pairs: Array<{ origin: NormalizedLogisticsLocation; destination: NormalizedLogisticsLocation; separatorIndex: number; destinationStart: number }> = [];
  for (let index = 0; index < locations.length - 1; index++) {
    const origin = locations[index]!;
    const destination = locations[index + 1]!;
    const end = origin.position + origin.original.length;
    const bridge = text.slice(end, destination.position);
    const arrow = separator.exec(bridge);
    if (!arrow || attributes.test(bridge.slice(0, arrow.index)) || bridge.length > 90) continue;
    if (bridge.slice(arrow.index + arrow[0].length).trim()) continue;
    // More than one delimiter without an intervening known endpoint is ambiguous.
    if (separator.test(bridge.slice(arrow.index + arrow[0].length))) continue;
    pairs.push({ origin, destination, separatorIndex: end + arrow.index, destinationStart: destination.position });
    index++;
  }
  if (!pairs.length) {
    // A separator-free message is usable only with one unambiguous pair.
    // Longer location lists go to review instead of borrowing unrelated cities.
    const samePlace = locations.length === 2 && locations[0]!.countryCode === locations[1]!.countryCode && locations.some(location => location.type === "COUNTRY");
    return [{ text, origin: locations.length <= 2 && !samePlace ? locations[0] ?? null : null, destination: locations.length === 2 && !samePlace ? locations[1]! : null }];
  }
  return pairs.slice(0, 25).map((pair, index) => {
    const start = index === 0 && !locations.some(location => location.position < pair.origin.position) ? 0 : pair.origin.position;
    const nextPair = pairs[index + 1]?.origin.position ?? text.length;
    const end = locations.find(location => location.position > pair.destination.position && location.position < nextPair)?.position ?? nextPair;
    return {
      text: text.slice(start, end).trim(),
      origin: endpoint(pair.origin, text.slice(pair.origin.position + pair.origin.original.length, pair.separatorIndex)),
      destination: endpoint(pair.destination, text.slice(pair.destinationStart + pair.destination.original.length, end)),
    };
  });
}
