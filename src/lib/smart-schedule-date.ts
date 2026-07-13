export const DEFAULT_SCHEDULE_TIME_ZONE = "Europe/Istanbul";

export type SmartScheduleQuickAction = "today" | "tomorrow" | "nextMonday" | "nextWeek" | "custom";

type DateParts = { year: number; month: number; day: number };
type TimeParts = { hour: number; minute: number };
const TURKISH_FOLD_MAP: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

type ParseOptions = {
  now?: Date;
  rejectPast?: boolean;
  timeZone?: string | null;
};

export type SmartScheduleDateTime = {
  date: Date;
  iso: string;
  canonical: string;
  timeZone: string;
};

export class SmartScheduleDateError extends Error {
  code: "EMPTY" | "INVALID_DATE" | "INVALID_TIME" | "UNPARSABLE" | "PAST";
  userMessage: string;

  constructor(code: SmartScheduleDateError["code"], userMessage: string) {
    super(userMessage);
    this.name = "SmartScheduleDateError";
    this.code = code;
    this.userMessage = userMessage;
  }
}

export function isSmartScheduleDateError(error: unknown): error is SmartScheduleDateError {
  return error instanceof SmartScheduleDateError;
}

export function normalizeScheduleTimeZone(value?: string | null) {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_SCHEDULE_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_SCHEDULE_TIME_ZONE;
  }
}

export function getBrowserScheduleTimeZone() {
  if (typeof Intl === "undefined") return DEFAULT_SCHEDULE_TIME_ZONE;
  return normalizeScheduleTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export function normalizeNativeDateTimeInput(value: string) {
  return value.trim().replace("T", " ");
}

export function getQuickScheduleInput(action: SmartScheduleQuickAction, options: ParseOptions = {}) {
  if (action === "custom") return "";
  const timeZone = normalizeScheduleTimeZone(options.timeZone);
  const now = options.now ?? new Date();
  const today = getZonedDateParts(now, timeZone);

  if (action === "today") {
    const current = getZonedTimeParts(now, timeZone);
    const nextHour = current.hour + 1;
    if (nextHour <= 23) return `${formatDateParts(today)} ${pad(nextHour)}:00`;
    return `${formatDateParts(addDays(today, 1))} 09:00`;
  }

  if (action === "tomorrow") return `${formatDateParts(addDays(today, 1))} 09:00`;
  if (action === "nextWeek") return `${formatDateParts(addDays(today, 7))} 09:00`;

  const daysUntilMonday = daysUntilNextWeekday(today, 1);
  const monday = addDays(today, daysUntilMonday);
  return `${formatDateParts(monday)} 09:00`;
}

export function parseSmartScheduleDateTime(input: unknown, options: ParseOptions = {}): SmartScheduleDateTime {
  const timeZone = normalizeScheduleTimeZone(options.timeZone);
  const now = options.now ?? new Date();
  const rejectPast = options.rejectPast ?? true;

  if (input instanceof Date) {
    return finalizeDate(input, getZonedDateParts(input, timeZone), getZonedTimeParts(input, timeZone), timeZone, now, rejectPast);
  }

  if (typeof input !== "string" || !input.trim()) {
    throw new SmartScheduleDateError("EMPTY", "composer.dateNotUnderstood");
  }

  const raw = collapseWhitespace(input);
  const explicitIso = parseExplicitIso(raw, timeZone, now, rejectPast);
  if (explicitIso) return explicitIso;

  const { time, dateText } = extractTime(raw);
  const resolvedDate = resolveDate(dateText, timeZone, now);
  const resolvedTime = time ?? resolvedDate.defaultTime;
  if (!resolvedTime) {
    throw new SmartScheduleDateError("UNPARSABLE", "composer.invalidDate");
  }

  const date = makeDateInTimeZone({ ...resolvedDate.date, ...resolvedTime }, timeZone);
  return finalizeDate(date, resolvedDate.date, resolvedTime, timeZone, now, rejectPast);
}

function finalizeDate(date: Date, dateParts: DateParts, timeParts: TimeParts, timeZone: string, now: Date, rejectPast: boolean) {
  if (Number.isNaN(date.getTime())) {
    throw new SmartScheduleDateError("INVALID_DATE", "composer.invalidDate");
  }
  if (rejectPast && date.getTime() <= now.getTime()) {
    throw new SmartScheduleDateError("PAST", "composer.scheduleFuture");
  }
  return {
    date,
    iso: date.toISOString(),
    canonical: `${formatDateParts(dateParts)} ${pad(timeParts.hour)}:${pad(timeParts.minute)}`,
    timeZone,
  };
}

function parseExplicitIso(raw: string, timeZone: string, now: Date, rejectPast: boolean) {
  const zonedIso = raw.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/i);
  if (zonedIso) {
    const date = new Date(raw);
    return finalizeDate(date, getZonedDateParts(date, timeZone), getZonedTimeParts(date, timeZone), timeZone, now, rejectPast);
  }

  const localIso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T\s]+(\d{1,2})[:.](\d{1,2})(?::\d{1,2}(?:\.\d{1,3})?)?$/);
  if (!localIso) return null;

  const [, year, month, day, hour, minute] = localIso;
  const dateParts = validateDateParts(toInt(year), toInt(month), toInt(day));
  const timeParts = validateTimeParts(toInt(hour), toInt(minute));
  const date = makeDateInTimeZone({ ...dateParts, ...timeParts }, timeZone);
  return finalizeDate(date, dateParts, timeParts, timeZone, now, rejectPast);
}

function resolveDate(input: string, timeZone: string, now: Date) {
  const text = cleanupDateText(input);
  const folded = foldTurkish(text);
  const today = getZonedDateParts(now, timeZone);

  if (/\b(yarin|tomorrow)\b/.test(folded)) {
    return { date: addDays(today, 1), defaultTime: { hour: 9, minute: 0 } };
  }
  if (/\b(bugun|today)\b/.test(folded)) {
    return { date: today, defaultTime: null };
  }
  if (/\b(gelecek hafta|next week)\b/.test(folded)) {
    return { date: addDays(today, 7), defaultTime: { hour: 9, minute: 0 } };
  }
  if (/\b(gelecek pazartesi|next monday)\b/.test(folded)) {
    return { date: addDays(today, daysUntilNextWeekday(today, 1)), defaultTime: { hour: 9, minute: 0 } };
  }
  if (/\b(bu aksam|aksam)\b/.test(folded)) {
    return { date: today, defaultTime: { hour: 20, minute: 0 } };
  }
  if (/\b(bu gece|gece)\b/.test(folded)) {
    return { date: today, defaultTime: { hour: 23, minute: 0 } };
  }
  if (/\b(ogleden sonra)\b/.test(folded)) {
    return { date: today, defaultTime: { hour: 15, minute: 0 } };
  }
  if (/\b(sabah)\b/.test(folded)) {
    return { date: today, defaultTime: { hour: 9, minute: 0 } };
  }

  const numeric = parseNumericDate(text);
  if (numeric) return { date: numeric, defaultTime: null };

  throw new SmartScheduleDateError("UNPARSABLE", "composer.dateNotUnderstood");
}

function parseNumericDate(input: string) {
  const tokens = input.match(/\d{1,4}/g)?.map(toInt) ?? [];
  if (tokens.length !== 3) return null;
  const [first, second, third] = tokens;
  const rawTokens = input.match(/\d{1,4}/g) ?? [];

  if ((rawTokens[0] ?? "").length === 4) {
    const year = first;
    if (second > 12 && third <= 12) return validateDateParts(year, third, second);
    return validateDateParts(year, second, third);
  }

  if ((rawTokens[2] ?? "").length === 4) {
    return validateDateParts(third, second, first);
  }

  return null;
}

function extractTime(input: string) {
  const trailing = input.match(/(?:\s|T|^)(\d{1,2})\s*[:.]\s*(\d{1,2})\s*$/);
  if (!trailing) return { dateText: input, time: null as TimeParts | null };
  const hour = toInt(trailing[1]);
  const minute = toInt(trailing[2]);
  const time = validateTimeParts(hour, minute);
  const dateText = `${input.slice(0, trailing.index)} ${input.slice((trailing.index ?? 0) + trailing[0].length)}`;
  return { dateText, time };
}

function validateTimeParts(hour: number, minute: number): TimeParts {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new SmartScheduleDateError("INVALID_TIME", "composer.invalidDate");
  }
  return { hour, minute };
}

function validateDateParts(year: number, month: number, day: number): DateParts {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || year < 1970 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new SmartScheduleDateError("INVALID_DATE", "composer.invalidDate");
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new SmartScheduleDateError("INVALID_DATE", "composer.invalidDate");
  }
  return { year, month, day };
}

function makeDateInTimeZone(parts: DateParts & TimeParts, timeZone: string) {
  const targetUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
  let utcMs = targetUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const zoned = getZonedParts(new Date(utcMs), timeZone);
    const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
    const offset = zonedAsUtc - targetUtc;
    if (offset === 0) break;
    utcMs -= offset;
  }
  const date = new Date(utcMs);
  const roundTrip = getZonedParts(date, timeZone);
  if (
    roundTrip.year !== parts.year ||
    roundTrip.month !== parts.month ||
    roundTrip.day !== parts.day ||
    roundTrip.hour !== parts.hour ||
    roundTrip.minute !== parts.minute
  ) {
    throw new SmartScheduleDateError("INVALID_DATE", "composer.invalidDate");
  }
  return date;
}

function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: toInt(byType.year),
    month: toInt(byType.month),
    day: toInt(byType.day),
    hour: toInt(byType.hour),
    minute: toInt(byType.minute),
    second: toInt(byType.second),
  };
}

function getZonedDateParts(date: Date, timeZone: string): DateParts {
  const parts = getZonedParts(date, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

function getZonedTimeParts(date: Date, timeZone: string): TimeParts {
  const parts = getZonedParts(date, timeZone);
  return { hour: parts.hour, minute: parts.minute };
}

function daysUntilNextWeekday(date: DateParts, targetDay: number) {
  const currentDay = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  const diff = (targetDay - currentDay + 7) % 7;
  return diff === 0 ? 7 : diff;
}

function addDays(date: DateParts, days: number): DateParts {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days, 12));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function cleanupDateText(input: string) {
  return collapseWhitespace(input.replace(/\bsaat\b/gi, " ").replace(/[.,/\\-]+$/g, " "));
}

function collapseWhitespace(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function foldTurkish(input: string) {
  return input
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]/g, (char) => TURKISH_FOLD_MAP[char] ?? char)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatDateParts(date: DateParts) {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toInt(value: string | number | undefined) {
  return Number.parseInt(String(value ?? ""), 10);
}
