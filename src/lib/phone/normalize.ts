import { z } from "zod";

const TURKEY_MOBILE_MSISDN_REGEX = /^905\d{9}$/;
const INVALID_TURKEY_MOBILE_PHONE = "Lütfen geçerli bir Türkiye mobil numarası girin.";

function normalizeTurkeyMobilePhone(value: string) {
  const raw = value.trim();
  const digits = raw.replace(/\D/g, "");
  let normalized = "";

  if (raw.startsWith("+")) {
    normalized = digits;
  } else if (digits.startsWith("0090") && digits.length === 14) {
    normalized = digits.slice(2);
  } else if (digits.startsWith("90") && digits.length === 12) {
    normalized = digits;
  } else if (digits.startsWith("0") && digits.length === 11) {
    normalized = `90${digits.slice(1)}`;
  } else if (digits.startsWith("5") && digits.length === 10) {
    normalized = `90${digits}`;
  }

  if (!TURKEY_MOBILE_MSISDN_REGEX.test(normalized)) {
    throw new Error("INVALID_WHATSAPP_PHONE");
  }

  return normalized;
}

export const whatsappPhoneSchema = z.string().trim().min(7).max(32).transform((value, context) => {
  try {
    return normalizeTurkeyMobilePhone(value);
  } catch {
    context.addIssue({ code: "custom", message: INVALID_TURKEY_MOBILE_PHONE });
    return z.NEVER;
  }
});

export function normalizePhoneNumber(value: string) {
  const parsed = whatsappPhoneSchema.safeParse(value);
  if (!parsed.success) throw new Error("INVALID_WHATSAPP_PHONE");
  return parsed.data;
}
