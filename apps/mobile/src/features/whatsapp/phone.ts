import { translateCurrent } from "@/i18n/runtime";

const TURKEY_MOBILE_E164_REGEX = /^\+905\d{9}$/;

export function normalizeTurkishPhone(input: string): string {
  const raw = input.trim();
  const digits = raw.replace(/\D/g, "");
  let normalized = "";

  if (raw.startsWith("+")) {
    normalized = `+${digits}`;
  } else if (digits.startsWith("0090") && digits.length === 14) {
    normalized = `+${digits.slice(2)}`;
  } else if (digits.startsWith("90") && digits.length === 12) {
    normalized = `+${digits}`;
  } else if (digits.startsWith("0") && digits.length === 11) {
    normalized = `+90${digits.slice(1)}`;
  } else if (digits.startsWith("5") && digits.length === 10) {
    normalized = `+90${digits}`;
  }

  if (!TURKEY_MOBILE_E164_REGEX.test(normalized)) {
    throw new Error(translateCurrent("turkeyMobilePhoneInvalid"));
  }

  return normalized;
}
