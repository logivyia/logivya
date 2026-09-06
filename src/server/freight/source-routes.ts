import { findLogisticsLocationOccurrences, normalizeLogisticsText, type NormalizedLogisticsLocation } from "./location-normalization";

const separator = /(?:→|⇒|➜|➡|▶|►|➔|[-–—]{1,3}\s*>?|=>)/u;
const attributes = /(?:\d|[\p{So}\p{Cs}]|[\n,;|=]|(?:^|[^\p{L}\p{N}])(?:ton|tonne|kg|tir|tente|tenteli|frigo|panelvan|kamyon|kamyonet|kapalı|kapali|açık|acik|yüksek|yuksek|uzun|damperli|dorse|lowbed|yük|yuk|araç|arac|boş|bos|hazır|hazir|lazım|lazim|nakliye|yükleme|yukleme)(?=$|[^\p{L}\p{N}]))/iu;

export type SourceRouteSection = { text: string; origin: NormalizedLogisticsLocation | null; destination: NormalizedLogisticsLocation | null };

function endpoint(location: NormalizedLogisticsLocation, tail: string) {
  // JavaScript's /i does not fold Turkish capital dotted I to i.
  const boundary = tail.replace(/İ/gu, "i").search(attributes);
  const suffix = (boundary < 0 ? tail : tail.slice(0, boundary)).trim().replace(/[-–—:]+$/u, "").trim();
  // A short location qualifier is evidence from this endpoint, never another route.
  const district = suffix && /^[\p{L}\s.'’]{1,50}$/u.test(suffix) && suffix.split(/\s/u).length <= 3 ? suffix : "";
  const canonical = `${location.canonical}${district ? ` ${district}` : ""}`;
  return { ...location, canonical, normalized: normalizeLogisticsText(canonical) };
}

export function splitSourceRoutes(value: string): SourceRouteSection[] {
  // Keep route lines together with their own dates/attributes before whitespace folding.
  const lines = value.split(/\r?\n/u);
  const starts = lines.flatMap((line, index) => findLogisticsLocationOccurrences(line).length >= 2 && (separator.test(line) || /yükleme|yukleme|boşaltma|bosaltma/iu.test(line)) ? [index] : []);
  if (starts.length > 1) {
    const heading = /^[^\p{L}\p{N}]*(?:pazartesi|salı|sali|çarşamba|carsamba|perşembe|persembe|cuma|cumartesi|pazar|bugün|bugun|yarın|yarin|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|dushanba|seshanba|chorshanba|payshanba|juma|shanba|yakshanba|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت|الأحد|20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[/.]\d{1,2}[/.]20\d{2})(?:\s+(?:günü|günü için|yükler|yükleme|loads))?\s*:?[\s*]*$/iu;
    return starts.flatMap((start, index) => {
      const next = starts[index + 1] ?? lines.length;
      const followingHeading = lines.findIndex((line, i) => i > start && i < next && heading.test(line));
      const currentHeading = lines.slice(0, start).findLast(line => heading.test(line));
      const block = lines.slice(index === 0 ? 0 : start, followingHeading < 0 ? next : followingHeading).join("\n");
      return splitRouteBlock(index > 0 && currentHeading ? `${currentHeading}\n${block}` : block);
    }).slice(0, 25);
  }
  return splitRouteBlock(value);
}

function splitRouteBlock(value: string): SourceRouteSection[] {
  // This normalization has the same whitespace positions as the occurrence scanner.
  const text = value.normalize("NFKC").replace(/[ـ‌]/gu, " ").replace(/\s+/gu, " ").trim();
  const locations: NormalizedLogisticsLocation[] = [];
  for (const location of findLogisticsLocationOccurrences(text)) {
    const before = text.slice(Math.max(0, location.position - 25), location.position);
    const after = text.slice(location.position + location.original.length);
    // A transit country is not a loading or unloading endpoint, even when the
    // actual destination is absent from the location registry.
    if (/^\s*(?:üzeri(?:nden)?|uzeri(?:nden)?|transit)(?=$|[^\p{L}])/iu.test(after)
      || /(?:^|[^\p{L}])(?:via|through|через)\s*$/iu.test(before)) continue;
    if (/(?:gümrük|gumruk|customs|ödeme|odeme|payment)\s*:?\s*$/iu.test(before)) continue;
    const previous = locations.at(-1);
    if (previous && previous.countryCode === location.countryCode && previous.type !== location.type && (previous.type === "COUNTRY" || location.type === "COUNTRY") && /^[\s/,]*$/u.test(text.slice(previous.position + previous.original.length, location.position))) {
      const specific = previous.type === "COUNTRY" ? location : previous;
      locations[locations.length - 1] = { ...specific, position: previous.position, original: text.slice(previous.position, location.position + location.original.length) };
    } else locations.push(location);
  }
  // Explicit loading/unloading labels take precedence over transit and payment locations.
  const role = (location: NormalizedLogisticsLocation, pattern: string) => {
    const before = text.slice(Math.max(0, location.position - 36), location.position);
    const after = text.slice(location.position + location.original.length, location.position + location.original.length + 28);
    return new RegExp(`(?:${pattern})\\s*:\\s*(?:[\\p{So}\\s])*?$`, "iu").test(before)
      || new RegExp(`^\\s*(?:(?:av\\.?|avr\\.?|avrupa(?: yakası)?|anadolu(?: yakası)?)\\s+)?(?:${pattern})(?!\\s*:)(?=$|[^\\p{L}])`, "iu").test(after);
  };
  const loading = locations.filter(location => role(location, "yükleme|yukleme|loading|загрузка"));
  const unloading = locations.filter(location => role(location, "boşaltma|bosaltma|teslim|unloading|delivery|выгрузка"));
  if (loading.length === 1 && unloading.length === 1) return [{ text, origin: loading[0], destination: unloading[0] }];
  if (loading.length || unloading.length) return [{ text, origin: loading.length === 1 ? loading[0] : null, destination: unloading.length === 1 ? unloading[0] : null }];
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
    const samePlace = locations.length === 2 && (locations[0]!.normalized === locations[1]!.normalized || (locations[0]!.countryCode === locations[1]!.countryCode && locations.some(location => location.type === "COUNTRY")));
    return [{ text, origin: locations.length <= 2 && !samePlace ? locations[0] ?? null : null, destination: locations.length === 2 && !samePlace ? locations[1]! : null }];
  }
  return pairs.slice(0, 25).map((pair, index) => {
    const start = index === 0 && !locations.some(location => location.position < pair.origin.position) ? 0 : pair.origin.position;
    const nextPair = pairs[index + 1]?.origin.position ?? text.length;
    const following = locations.filter(location => location.position > pair.destination.position && location.position < nextPair);
    const alternative = following[0];
    const alternatives = alternative && /^\s*(?:veya|ya da|or|или|yoki|\/)\s*$/iu.test(text.slice(pair.destination.position + pair.destination.original.length, alternative.position));
    const end = following[alternatives ? 1 : 0]?.position ?? nextPair;
    const target = alternatives ? { ...pair.destination, canonical: `${pair.destination.canonical} / ${alternative.canonical}`, normalized: normalizeLogisticsText(`${pair.destination.canonical} / ${alternative.canonical}`), original: text.slice(pair.destination.position, alternative.position + alternative.original.length) } : pair.destination;
    return {
      text: text.slice(start, end).trim(),
      origin: endpoint(pair.origin, text.slice(pair.origin.position + pair.origin.original.length, pair.separatorIndex)),
      destination: endpoint(target, text.slice(pair.destinationStart + target.original.length, end)),
    };
  });
}
