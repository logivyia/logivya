export type RecurringRule = { frequency: "DAILY" | "WEEKLY" | "MONTHLY"; interval?: number };
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

export function recurringJobId(templateCampaignId: string, runAt: number) {
  const minuteBucket = Math.floor(runAt / 60_000) * 60_000;
  return `recurring-${templateCampaignId}-${minuteBucket}`;
}
