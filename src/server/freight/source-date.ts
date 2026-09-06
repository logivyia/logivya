/** Dates in a source message refer to its local calendar day, never the worker's clock. */
export function sourceLoadingDate(text: string, sourceTimestamp: Date, timeZone = "Europe/Istanbul"): Date | null {
  if (!Number.isFinite(sourceTimestamp.getTime())) return null;
  try { new Intl.DateTimeFormat("en", { timeZone }).format(sourceTimestamp); } catch { timeZone = "Europe/Istanbul"; }
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(sourceTimestamp);
  const part = (name: string) => Number(parts.find(p => p.type === name)?.value);
  const base = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  const normalized = text.normalize("NFKC").toLocaleLowerCase("tr")
    // Çarşamba is also a district: a destination must not invent a loading day.
    .replace(/samsun[\s,/→-]+çarşamba/gu, "samsun ilçesi");
  const explicit = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/u.exec(text) ?? /\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/u.exec(text);
  if (explicit) {
    const yearFirst = explicit[1].length === 4;
    const year = Number(explicit[yearFirst ? 1 : 3]), month = Number(explicit[2]), day = Number(explicit[yearFirst ? 3 : 1]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }
  const has = (terms: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${terms})(?=$|[^\\p{L}\\p{N}])`, "u").test(normalized);
  if (has("yarın|yarin|tomorrow|завтра|ertaga|فردا|غدا|غدًا")) return new Date(+base + 86_400_000);
  if (has("bugün|bugun|today|сегодня|bugun|bu gün|امروز|اليوم")) return base;
  const days = ["pazar|sunday|воскресенье|yakshanba|الأحد", "pazartesi|monday|понедельник|dushanba|الاثنين", "salı|sali|tuesday|вторник|seshanba|الثلاثاء", "çarşamba|carsamba|wednesday|среда|chorshanba|الأربعاء", "perşembe|persembe|thursday|четверг|payshanba|الخميس", "cuma|friday|пятница|juma|الجمعة", "cumartesi|saturday|суббота|shanba|السبت"];
  const found = days.flatMap((names, index) => has(names) ? [index] : []);
  if (found.length !== 1) return null;
  let offset = (found[0] - base.getUTCDay() + 7) % 7;
  if (has("gelecek hafta|next week")) offset = 7 - ((base.getUTCDay() + 6) % 7) + ((found[0] + 6) % 7);
  return new Date(+base + offset * 86_400_000);
}
