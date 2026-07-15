export type RecurringRule = { frequency: "DAILY" | "WEEKLY" | "MONTHLY"; interval?: number };

export function parseRecurringRule(value: unknown): RecurringRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as { frequency?: unknown; interval?: unknown };
  if (!(["DAILY", "WEEKLY", "MONTHLY"] as const).includes(candidate.frequency as RecurringRule["frequency"])) return null;
  if (candidate.interval !== undefined && (!Number.isInteger(candidate.interval) || Number(candidate.interval) < 1 || Number(candidate.interval) > 365)) return null;
  return {
    frequency: candidate.frequency as RecurringRule["frequency"],
    interval: candidate.interval === undefined ? undefined : Number(candidate.interval),
  };
}

export function recurringDelay(rule: RecurringRule) {
  const interval = Math.max(1, Math.min(rule.interval ?? 1, 365));
  const day = 86_400_000;
  if (rule.frequency === "WEEKLY") return interval * 7 * day;
  if (rule.frequency === "MONTHLY") return interval * 30 * day;
  return interval * day;
}

export function nextRecurringRunAt(rule: RecurringRule, from = Date.now()) {
  return from + recurringDelay(rule);
}

export function nextRecurringRunAfter(rule: RecurringRule, anchor: number, now = Date.now()) {
  const interval = recurringDelay(rule);
  if (anchor > now) return anchor;
  const elapsed = Math.max(0, now - anchor);
  return anchor + (Math.floor(elapsed / interval) + 1) * interval;
}

export function recurringJobId(templateCampaignId: string, runAt: number) {
  const minuteBucket = Math.floor(runAt / 60_000) * 60_000;
  return `recurring-${templateCampaignId}-${minuteBucket}`;
}
