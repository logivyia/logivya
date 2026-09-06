/** Older native clients unconditionally format listing dates and throw on null. */
export function needsListingDateCompatibility(headers: Headers, data: unknown): boolean {
  const platform = headers.get("x-client-platform")?.toUpperCase();
  if (platform !== "ANDROID" && platform !== "IOS") return false;
  const version = Number(headers.get("x-logivya-version-code"));
  if (Number.isSafeInteger(version) && version >= (platform === "ANDROID" ? 227 : 193)) return false;
  const hasUnknownDate = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(hasUnknownDate);
    const row = value as Record<string, unknown>;
    return row.loadingDate === null || row.availableFrom === null || Object.values(row).some(hasUnknownDate);
  };
  return hasUnknownDate(data);
}

const messages: Record<string, string> = {
  tr: "Bu ekranda tarihi belirtilmeyen ilanlar var. Ayrıntıları logivya.com üzerinden görüntüleyin veya uygulamayı güncelleyin.",
  en: "This screen contains listings without a specified date. View the details at logivya.com or update the app.",
  ar: "تحتوي هذه الشاشة على إعلانات دون تاريخ محدد. اعرض التفاصيل على logivya.com أو حدّث التطبيق.",
  ro: "Acest ecran conține anunțuri fără dată specificată. Vedeți detaliile pe logivya.com sau actualizați aplicația.",
  ru: "На этом экране есть объявления без указанной даты. Посмотрите подробности на logivya.com или обновите приложение.",
  az: "Bu ekranda tarixi göstərilməyən elanlar var. Təfərrüatları logivya.com saytında görün və ya tətbiqi yeniləyin.",
  tk: "Bu ekranda senesi görkezilmedik bildirişler bar. Jikme-jiklikleri logivya.com sahypasynda görüň ýa-da programmany täzeläň.",
  de: "Dieser Bildschirm enthält Anzeigen ohne Datumsangabe. Sehen Sie die Details auf logivya.com an oder aktualisieren Sie die App.",
  bg: "На този екран има обяви без посочена дата. Вижте подробностите на logivya.com или актуализирайте приложението.",
  el: "Αυτή η οθόνη περιέχει αγγελίες χωρίς καθορισμένη ημερομηνία. Δείτε τις λεπτομέρειες στο logivya.com ή ενημερώστε την εφαρμογή.",
  sr: "Ovaj ekran sadrži oglase bez navedenog datuma. Pogledajte detalje na logivya.com ili ažurirajte aplikaciju.",
  uz: "Bu ekranda sanasi ko‘rsatilmagan e’lonlar bor. Tafsilotlarni logivya.com saytida ko‘ring yoki ilovani yangilang.",
};
export function listingDateCompatibilityMessage(locale: string): string { return messages[locale] ?? messages.en!; }
