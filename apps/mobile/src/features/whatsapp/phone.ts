export function normalizeTurkishPhone(input: string): string {
  const digits = input.replace(/\D/g, "");

  if (digits.startsWith("0090")) return normalizeTurkishPhone(digits.slice(2));
  if (digits.startsWith("90") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("5")) return `90${digits}`;

  throw new Error("Geçerli bir Türkiye telefon numarası girin.");
}
