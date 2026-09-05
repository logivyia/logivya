/** Normalize pasted dialling digits without accepting arbitrary text as a phone number. */
export function normalizeDiallingInput(value: string): string {
  return value.normalize("NFKC")
    .replace(/[\u0660-\u0669]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u200e\u200f\u061c]/g, "")
    .trim();
}

export function normalizeCountrySearch(value: string): string {
  return normalizeDiallingInput(value).normalize("NFKD").toLowerCase()
    .replace(/\p{M}/gu, "").replace(/ı/g, "i");
}

// These territories share their mobile numbering plan with the listed region.
// Country inference alone cannot distinguish them, even for official examples.
const sharedMobilePlans = [
  ["FI", "AX"], ["AU", "CX", "CC"], ["GB", "IM", "GG", "JE"],
  ["GP", "BL", "MF"], ["NO", "SJ"], ["IT", "VA"], ["MA", "EH"],
] as const;
export function phoneCountryMatches(selected: string, inferred: string | undefined): boolean {
  return selected === inferred || Boolean(inferred && sharedMobilePlans.some(plan =>
    (plan as readonly string[]).includes(selected) && (plan as readonly string[]).includes(inferred)));
}
