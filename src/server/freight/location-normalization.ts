// Pure normalization helpers are shared with the standalone WhatsApp worker.
// Do not import Next.js' `server-only` sentinel here: it throws in a valid
// non-Next server runtime and would stop live group ingestion from starting.

export type LogisticsLocationType = "COUNTRY" | "CITY" | "DISTRICT" | "BORDER_GATE" | "CUSTOMS";

export type NormalizedLogisticsLocation = {
  canonical: string;
  countryCode: string;
  type: LogisticsLocationType;
  original: string;
  normalized: string;
  position: number;
};

type RegistryLocation = Omit<NormalizedLogisticsLocation, "original" | "normalized" | "position"> & {
  aliases: readonly string[];
};

const LOCATIONS: readonly RegistryLocation[] = [
  { canonical: "Kuveyt", countryCode: "KW", type: "COUNTRY", aliases: ["kuveyt", "kuwait", "الكويت"] },
  { canonical: "Rustavi", countryCode: "GE", type: "CITY", aliases: ["rustavi", "rustavı", "рустави", "რუსთავი"] },
  { canonical: "Süleymaniye", countryCode: "IQ", type: "CITY", aliases: ["süleymaniye", "suleymaniye", "sulaymaniyah", "sulaimani", "السليمانية"] },
  { canonical: "Zaho", countryCode: "IQ", type: "CITY", aliases: ["zaho", "zakho", "zağo", "zago", "زاخو"] },
  { canonical: "Çorlu", countryCode: "TR", type: "DISTRICT", aliases: ["çorlu", "corlu"] },
  { canonical: "Bandırma", countryCode: "TR", type: "DISTRICT", aliases: ["bandırma", "bandirma"] },
  { canonical: "St. Petersburg", countryCode: "RU", type: "CITY", aliases: ["st. petersburg", "saint petersburg", "sankt peterburg", "санкт-петербург", "petersburg", "peterburg", "петербург"] },
  { canonical: "Stavropol", countryCode: "RU", type: "CITY", aliases: ["stavropol", "ставрополь"] },
  { canonical: "Türkiye", countryCode: "TR", type: "COUNTRY", aliases: ["türkiye", "turkiye", "turkey", "ترکیه", "تركيه"] },
  { canonical: "İran", countryCode: "IR", type: "COUNTRY", aliases: ["iran", "iran'a", "irana", "iran'a", "ایران", "ايران"] },
  { canonical: "Afganistan", countryCode: "AF", type: "COUNTRY", aliases: ["afganistan", "afghanistan", "افغانستان"] },
  { canonical: "Azerbaycan", countryCode: "AZ", type: "COUNTRY", aliases: ["azerbaycan", "azerbaijan", "آذربایجان", "اذربایجان"] },
  { canonical: "Gürcistan", countryCode: "GE", type: "COUNTRY", aliases: ["gürcistan", "gurcistan", "georgia", "گرجستان"] },
  { canonical: "Rusya", countryCode: "RU", type: "COUNTRY", aliases: ["rusya", "russia", "روسیه"] },
  { canonical: "Irak", countryCode: "IQ", type: "COUNTRY", aliases: ["ırak", "irak", "iraq", "عراق"] },
  { canonical: "Suriye", countryCode: "SY", type: "COUNTRY", aliases: ["suriye", "syria", "سوریه"] },
  { canonical: "Belarus", countryCode: "BY", type: "COUNTRY", aliases: ["belarus", "beyaz rusya", "беларусь", "белоруссия", "بلاروس"] },
  { canonical: "Kazakistan", countryCode: "KZ", type: "COUNTRY", aliases: ["kazakistan", "kazakhstan", "қазақстан", "казахстан", "قزاقستان"] },
  { canonical: "Özbekistan", countryCode: "UZ", type: "COUNTRY", aliases: ["özbekistan", "ozbekistan", "uzbekistan", "oʻzbekiston", "узбекистан", "ازبکستان"] },
  { canonical: "Türkmenistan", countryCode: "TM", type: "COUNTRY", aliases: ["türkmenistan", "turkmenistan", "туркменистан", "ترکمنستان"] },
  { canonical: "Kırgızistan", countryCode: "KG", type: "COUNTRY", aliases: ["kırgızistan", "kirgizistan", "kyrgyzstan", "кыргызстан", "قرقیزستان"] },
  { canonical: "Tacikistan", countryCode: "TJ", type: "COUNTRY", aliases: ["tacikistan", "tajikistan", "таджикистан", "تاجیکستان"] },
  { canonical: "Ukrayna", countryCode: "UA", type: "COUNTRY", aliases: ["ukrayna", "ukraine", "украина", "اوکراین"] },
  { canonical: "Bulgaristan", countryCode: "BG", type: "COUNTRY", aliases: ["bulgaristan", "bulgaria", "болгария", "بلغارستان"] },
  { canonical: "Romanya", countryCode: "RO", type: "COUNTRY", aliases: ["romanya", "romania", "румыния", "رومانی"] },
  { canonical: "Suudi Arabistan", countryCode: "SA", type: "COUNTRY", aliases: ["suudi arabistan", "saudi arabia", "السعودية", "عربستان سعودی"] },
  { canonical: "Birleşik Arap Emirlikleri", countryCode: "AE", type: "COUNTRY", aliases: ["bae", "united arab emirates", "uae", "الإمارات", "امارات"] },
  { canonical: "Katar", countryCode: "QA", type: "COUNTRY", aliases: ["katar", "qatar", "قطر"] },
  { canonical: "İstanbul Anadolu Yakası", countryCode: "TR", type: "DISTRICT", aliases: ["istanbul anadolu yakası", "istanbul anadolu yakasi", "istanbul asya", "istanbul asiya", "asian side istanbul", "استانبول آسیایی"] },
  { canonical: "İstanbul Avrupa Yakası", countryCode: "TR", type: "DISTRICT", aliases: ["istanbul avrupa yakası", "istanbul avrupa yakasi", "istanbul avrupa", "european side istanbul", "استانبول اروپایی"] },
  { canonical: "İstanbul", countryCode: "TR", type: "CITY", aliases: ["istanbul", "استانبول"] },
  { canonical: "Mersin", countryCode: "TR", type: "CITY", aliases: ["mersin", "مرسین"] },
  { canonical: "Adana", countryCode: "TR", type: "CITY", aliases: ["adana", "آدانا", "ادانا"] },
  { canonical: "Kocaeli", countryCode: "TR", type: "CITY", aliases: ["kocaeli"] },
  { canonical: "Kocaeli İzmit", countryCode: "TR", type: "DISTRICT", aliases: ["kocaeli izmit"] },
  { canonical: "Kocaeli Dilovası", countryCode: "TR", type: "DISTRICT", aliases: ["kocaeli dilovası", "kocaeli dilovasi"] },
  { canonical: "İzmit", countryCode: "TR", type: "DISTRICT", aliases: ["izmit", "ازمیت"] },
  { canonical: "Sakarya", countryCode: "TR", type: "CITY", aliases: ["sakarya", "ساکاریا"] },
  { canonical: "Ankara", countryCode: "TR", type: "CITY", aliases: ["ankara", "آنکارا", "انکارا"] },
  { canonical: "İzmir", countryCode: "TR", type: "CITY", aliases: ["izmir", "ازمیر"] },
  { canonical: "Bursa", countryCode: "TR", type: "CITY", aliases: ["bursa", "بورسا"] },
  { canonical: "Kayseri", countryCode: "TR", type: "CITY", aliases: ["kayseri", "قیصریه", "کایسری"] },
  { canonical: "Gaziantep", countryCode: "TR", type: "CITY", aliases: ["gaziantep", "antep", "غازی عینتاب"] },
  { canonical: "Konya", countryCode: "TR", type: "CITY", aliases: ["konya", "قونیه"] },
  { canonical: "Hatay", countryCode: "TR", type: "CITY", aliases: ["hatay", "هاتای"] },
  { canonical: "İskenderun", countryCode: "TR", type: "DISTRICT", aliases: ["iskenderun", "اسکندرون"] },
  { canonical: "Dilovası", countryCode: "TR", type: "DISTRICT", aliases: ["dilovası", "dilovasi"] },
  { canonical: "Doğubayazıt", countryCode: "TR", type: "DISTRICT", aliases: ["doğubayazıt", "dogubayazit", "دوعوبایزید"] },
  { canonical: "Cilvegözü", countryCode: "TR", type: "BORDER_GATE", aliases: ["cilvegözü", "cilvegozu", "جلوه گوزو"] },
  { canonical: "Öncüpınar", countryCode: "TR", type: "BORDER_GATE", aliases: ["öncüpınar", "oncupinar", "اونجوپینار"] },
  { canonical: "Gürbulak", countryCode: "TR", type: "BORDER_GATE", aliases: ["gürbulak", "gurbulak", "گوربولاغ"] },
  { canonical: "Tahran", countryCode: "IR", type: "CITY", aliases: ["tahran", "tehran", "تهران"] },
  { canonical: "Tebriz", countryCode: "IR", type: "CITY", aliases: ["tebriz", "tabriz", "تبریز"] },
  { canonical: "Abadan", countryCode: "IR", type: "CITY", aliases: ["abadan", "آبادان", "ابادان"] },
  { canonical: "Bandar Anzali", countryCode: "IR", type: "CITY", aliases: ["bandar anzali", "bandar-e anzali", "anzali", "انزلی", "بندر انزلی"] },
  { canonical: "Maku", countryCode: "IR", type: "CITY", aliases: ["maku", "makü", "ماکو"] },
  { canonical: "İsfahan", countryCode: "IR", type: "CITY", aliases: ["isfahan", "esfahan", "اصفهان"] },
  { canonical: "Meşhed", countryCode: "IR", type: "CITY", aliases: ["meşhed", "meshed", "mashhad", "مشهد"] },
  { canonical: "Şiraz", countryCode: "IR", type: "CITY", aliases: ["şiraz", "shiraz", "شیراز"] },
  { canonical: "Bandar Abbas", countryCode: "IR", type: "CITY", aliases: ["bandar abbas", "bender abbas", "بندرعباس", "بندر عباس"] },
  { canonical: "Bazargan", countryCode: "IR", type: "BORDER_GATE", aliases: ["bazargan", "bazarkan", "بازرگان"] },
  { canonical: "Doğarun", countryCode: "IR", type: "BORDER_GATE", aliases: ["doğarun", "dogharun", "dogharoun", "دوغارون"] },
  { canonical: "Culfa", countryCode: "IR", type: "BORDER_GATE", aliases: ["culfa", "julfa", "جلفا"] },
  { canonical: "İslam Kale", countryCode: "AF", type: "BORDER_GATE", aliases: ["islam kale", "islam qala", "islam qaleh", "اسلام قلعه"] },
  { canonical: "Moskova", countryCode: "RU", type: "CITY", aliases: ["moskova", "moscow", "moskva", "москва", "مسکو"] },
  { canonical: "Krasnodar", countryCode: "RU", type: "CITY", aliases: ["krasnodar", "краснодар", "کراسنودار"] },
  { canonical: "Rostov-na-Donu", countryCode: "RU", type: "CITY", aliases: ["rostov", "rostov-na-donu", "ростов-на-дону", "روستوف"] },
  { canonical: "Minsk", countryCode: "BY", type: "CITY", aliases: ["minsk", "мінск", "минск", "مینسک"] },
  { canonical: "Astana", countryCode: "KZ", type: "CITY", aliases: ["astana", "nur-sultan", "nursultan", "астана", "آستانه"] },
  { canonical: "Almatı", countryCode: "KZ", type: "CITY", aliases: ["almatı", "almati", "almaty", "алматы", "آلماتی"] },
  { canonical: "Taşkent", countryCode: "UZ", type: "CITY", aliases: ["taşkent", "taskent", "tashkent", "toshkent", "ташкент", "تاشکند"] },
  { canonical: "Semerkant", countryCode: "UZ", type: "CITY", aliases: ["semerkant", "samarkand", "samarqand", "самарканд", "سمرقند"] },
  { canonical: "Bakü", countryCode: "AZ", type: "CITY", aliases: ["bakü", "baku", "bakı", "баку", "باکو"] },
  { canonical: "Tiflis", countryCode: "GE", type: "CITY", aliases: ["tiflis", "tbilisi", "тбилиси", "تفلیس"] },
  { canonical: "Erbil", countryCode: "IQ", type: "CITY", aliases: ["erbil", "arbīl", "أربيل", "اربیل"] },
  { canonical: "Bağdat", countryCode: "IQ", type: "CITY", aliases: ["bağdat", "bagdat", "baghdad", "بغداد"] },
  { canonical: "Dubai", countryCode: "AE", type: "CITY", aliases: ["dubai", "دبي", "دبی"] },
  { canonical: "Riyad", countryCode: "SA", type: "CITY", aliases: ["riyad", "riyadh", "الرياض", "ریاض"] },
] as const;

export function normalizeLogisticsText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[يى]/gu, "ی")
    .replace(/ك/gu, "ک")
    .replace(/[ـ‌]/gu, " ")
    .replace(/İ/gu, "i")
    .replace(/I/gu, "ı")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("tr-TR");
}

export function findLogisticsLocations(value: string): NormalizedLogisticsLocation[] {
  const normalizedText = normalizeLogisticsText(value);
  const matches: NormalizedLogisticsLocation[] = [];
  for (const location of LOCATIONS) {
    let best: { alias: string; position: number } | null = null;
    for (const rawAlias of location.aliases) {
      const alias = normalizeLogisticsText(rawAlias);
      const position = normalizedText.indexOf(alias);
      if (position >= 0 && (!best || position < best.position || (position === best.position && alias.length > best.alias.length))) {
        best = { alias, position };
      }
    }
    if (!best) continue;
    matches.push({
      canonical: location.canonical,
      countryCode: location.countryCode,
      type: location.type,
      original: value.slice(best.position, best.position + best.alias.length),
      normalized: normalizeLogisticsText(location.canonical),
      position: best.position,
    });
  }
  return matches
    .sort((left, right) => left.position - right.position || right.normalized.length - left.normalized.length)
    .filter((item, index, all) => !all.slice(0, index).some((previous) => previous.position === item.position && previous.countryCode === item.countryCode));
}

export function normalizeSingleLogisticsLocation(value: string | null | undefined) {
  if (!value) return null;
  const matches = findLogisticsLocationOccurrences(value);
  if (matches.length === 1) return matches[0];
  const exact = matches.find((match) => match.normalized === normalizeLogisticsText(value));
  return exact ?? matches[0] ?? null;
}

/** Occurrences, including repeated cities, for independent source-route parsing.
 * Positions refer to normalizeLogisticsText(value); overlapping aliases and
 * embedded words (e.g. Van inside panelvan) are excluded.
 */
export function findLogisticsLocationOccurrences(value: string): NormalizedLogisticsLocation[] {
  const text = normalizeLogisticsText(value);
  const found: NormalizedLogisticsLocation[] = [];
  for (const location of [...LOCATIONS, ...additionalTurkishCities]) {
    for (const rawAlias of location.aliases) {
      const alias = normalizeLogisticsText(rawAlias);
      let position = text.indexOf(alias);
      while (position !== -1) {
        const before = text[position - 1] ?? "";
        const after = text[position + alias.length] ?? "";
        if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) {
          found.push({ ...location, original: alias, normalized: normalizeLogisticsText(location.canonical), position });
        }
        position = text.indexOf(alias, position + alias.length);
      }
    }
  }
  const ordered = found.sort((a, b) => a.position - b.position || b.original.length - a.original.length);
  const result: NormalizedLogisticsLocation[] = [];
  for (const item of ordered) {
    const previous = result.at(-1);
    if (!previous || item.position >= previous.position + previous.original.length) result.push(item);
  }
  return result;
}

const additionalTurkishCities: RegistryLocation[] = [
  "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Antalya", "Artvin", "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur",
  "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Giresun", "Gümüşhane", "Hakkari",
  "Isparta", "Kars", "Kastamonu", "Kırklareli", "Kırşehir", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir",
  "Niğde", "Ordu", "Rize", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Yozgat", "Zonguldak",
  "Van", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce",
].map((canonical) => ({ canonical, countryCode: "TR", type: "CITY", aliases: [canonical, canonical.normalize("NFD").replace(/\p{M}/gu, "").replace(/ı/gu, "i")] }));

export function logisticsCountrySearchTerms(countryCode: string) {
  return [...new Set([...LOCATIONS, ...additionalTurkishCities].filter((item) => item.countryCode === countryCode).flatMap((item) => [item.canonical, ...item.aliases]))];
}

export function locationCompatibility(
  requested: string | null | undefined,
  candidate: { normalized?: string | null; countryCode?: string | null },
) {
  if (!requested) return { compatible: true, score: 100, level: "NOT_REQUESTED" } as const;
  if (!candidate.normalized && !candidate.countryCode) return { compatible: false, score: 0, level: "UNKNOWN" } as const;
  const requestLocation = normalizeSingleLogisticsLocation(requested);
  const requestNormalized = normalizeLogisticsText(requested);
  const candidateNormalized = normalizeLogisticsText(candidate.normalized ?? "");
  if (requestLocation?.type === "COUNTRY" && requestLocation.countryCode === candidate.countryCode) {
    return { compatible: true, score: 90, level: "COUNTRY_CONTAINS" } as const;
  }
  if (requestLocation && requestLocation.normalized === candidateNormalized) {
    return { compatible: true, score: 100, level: "EXACT" } as const;
  }
  if (requestLocation?.countryCode && requestLocation.countryCode === candidate.countryCode
    && (requestLocation.type === "COUNTRY" || candidateNormalized.includes(requestLocation.normalized))) {
    return { compatible: true, score: 90, level: "HIERARCHICAL" } as const;
  }
  if (candidateNormalized.includes(requestNormalized) || requestNormalized.includes(candidateNormalized)) {
    return { compatible: true, score: 80, level: "TEXT" } as const;
  }
  return { compatible: false, score: 0, level: "MISMATCH" } as const;
}
