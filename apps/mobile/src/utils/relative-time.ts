type RelativeUnit = "second" | "minute" | "hour";

export function formatRelativeTime(value: string, locale: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";

  const seconds = Math.round((timestamp - Date.now()) / 1_000);
  const { amount, unit } = relativeAmount(seconds);
  const RelativeTimeFormat =
    typeof Intl !== "undefined" ? Intl.RelativeTimeFormat : undefined;

  if (typeof RelativeTimeFormat === "function") {
    try {
      return new RelativeTimeFormat(locale, { numeric: "auto" }).format(
        amount,
        unit,
      );
    } catch {
      // Some Android/Hermes versions expose Intl incompletely. The dashboard
      // must still render when a live listing arrives.
    }
  }

  return fallbackRelativeTime(amount, unit, locale);
}

function relativeAmount(seconds: number): { amount: number; unit: RelativeUnit } {
  if (Math.abs(seconds) < 60) return { amount: seconds, unit: "second" };
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return { amount: minutes, unit: "minute" };
  return { amount: Math.round(minutes / 60), unit: "hour" };
}

function fallbackRelativeTime(amount: number, unit: RelativeUnit, locale: string) {
  const absolute = Math.abs(amount);
  const isTurkish = locale.toLocaleLowerCase().startsWith("tr");

  if (absolute < 10 && unit === "second") return isTurkish ? "şimdi" : "now";

  if (isTurkish) {
    const labels: Record<RelativeUnit, string> = {
      second: "sn",
      minute: "dk",
      hour: "sa",
    };
    return `${absolute} ${labels[unit]} ${amount > 0 ? "sonra" : "önce"}`;
  }

  const labels: Record<RelativeUnit, string> = {
    second: "s",
    minute: "m",
    hour: "h",
  };
  return amount > 0
    ? `in ${absolute}${labels[unit]}`
    : `${absolute}${labels[unit]} ago`;
}
