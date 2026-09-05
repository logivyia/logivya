export function normalizeTelegramPhone(value: string) {
  const normalized = value.trim().replace(/[\s()-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error("TELEGRAM_PHONE_INVALID");
  return normalized;
}

export function maskTelegramPhone(value: string) {
  const clean = normalizeTelegramPhone(value);
  return `${clean.slice(0, Math.min(4, clean.length - 4))}${"*".repeat(Math.max(4, clean.length - 7))}${clean.slice(-3)}`;
}

