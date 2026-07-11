export const TRIAL_DURATION_DAYS = 7;
export const DAY_IN_MILLISECONDS = 86_400_000;

export function trialEndsAt(startedAt: Date) {
  return new Date(startedAt.getTime() + TRIAL_DURATION_DAYS * DAY_IN_MILLISECONDS);
}

export function remainingDaysUntil(endsAt?: Date | null, now = new Date()) {
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / DAY_IN_MILLISECONDS));
}
