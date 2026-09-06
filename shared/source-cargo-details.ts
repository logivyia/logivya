/** Only temperatures explicitly marked with a Celsius unit are presented. */
export function sourceTemperature(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = /(?<![\p{L}\p{N}])([+-]?\d{1,2}(?:[.,]\d)?(?:\s*(?:ile|to|–|…|\.\.|\/)\s*[+-]?\d{1,2}(?:[.,]\d)?)?)\s*(?:°\s*C|℃|derece\s*(?:C|santigrat)|degrees?\s*C)(?![\p{L}])/iu.exec(text);
  return match?.[1] ? `${match[1].replace(/\s+/gu, " ").trim()} °C` : null;
}

const labels: Record<string, string> = {
  tr: "Sıcaklık gereksinimi", en: "Temperature requirement", ar: "درجة الحرارة المطلوبة",
  ro: "Temperatură necesară", ru: "Требуемая температура", az: "Tələb olunan temperatur",
  tk: "Talap edilýän temperatura", de: "Erforderliche Temperatur", bg: "Необходима температура",
  el: "Απαιτούμενη θερμοκρασία", sr: "Potrebna temperatura", uz: "Talab qilinadigan harorat",
};
export function sourceTemperatureLabel(locale: string): string { return labels[locale] ?? "Temperature requirement"; }
