export const APP_LOCK_PIN_LENGTH = 6;
export const APP_LOCK_HASH_ROUNDS = 256;
export const APP_LOCK_MAX_ATTEMPTS = 5;
export const APP_LOCK_AUTO_LOCK_OPTIONS = [0, 60, 300, 900] as const;

export type AppLockAutoLockSeconds = (typeof APP_LOCK_AUTO_LOCK_OPTIONS)[number];

export function normalizeAppLockPin(value: string) {
  return value.replace(/\D/gu, "").slice(0, APP_LOCK_PIN_LENGTH);
}

export function isValidAppLockPin(value: string) {
  return /^\d{6}$/u.test(value);
}

export function isSupportedAutoLockSeconds(value: number): value is AppLockAutoLockSeconds {
  return APP_LOCK_AUTO_LOCK_OPTIONS.includes(value as AppLockAutoLockSeconds);
}

export function shouldLockAfterBackground(backgroundedAt: number | null, now: number, autoLockSeconds: AppLockAutoLockSeconds) {
  if (backgroundedAt === null) return false;
  return now - backgroundedAt >= autoLockSeconds * 1_000;
}

export function getAppLockBlockDurationMs(failedAttempts: number) {
  if (failedAttempts < APP_LOCK_MAX_ATTEMPTS) return 0;
  const escalation = Math.min(failedAttempts - APP_LOCK_MAX_ATTEMPTS, 4);
  return Math.min(5 * 60_000, 30_000 * 2 ** escalation);
}

