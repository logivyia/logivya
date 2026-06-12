export function normalizeWhatsAppPhoneNumber(value: string, defaultCountryCode = "90") {
  let digits = value.trim().replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);

  // Turkish mobile numbers are commonly entered as 05xx... locally.
  if (defaultCountryCode === "90" && /^0[5-9]\d{9}$/.test(digits)) {
    digits = `90${digits.slice(1)}`;
  }

  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new Error("INVALID_WHATSAPP_PHONE");
  }
  return digits;
}
