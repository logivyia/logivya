import { z } from "zod";

export const whatsappPhoneSchema = z.string().trim().min(7).max(32).transform((value, context) => {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0[5-9]\d{9}$/.test(digits)) digits = `90${digits.slice(1)}`;
  else if (/^[5-9]\d{9}$/.test(digits)) digits = `90${digits}`;
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    context.addIssue({ code: "custom", message: "Gecerli bir telefon numarasi girin." });
    return z.NEVER;
  }
  return digits;
});

export function normalizePhoneNumber(value: string) {
  const parsed = whatsappPhoneSchema.safeParse(value);
  if (!parsed.success) throw new Error("INVALID_WHATSAPP_PHONE");
  return parsed.data;
}
