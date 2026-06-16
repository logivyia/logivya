import { config } from "@/constants/config";

declare const require: (name: string) => unknown;

type SentryModule = {
  init?: (options: Record<string, unknown>) => void;
  captureException?: (error: unknown, context?: Record<string, unknown>) => void;
  setUser?: (user: Record<string, unknown> | null) => void;
  wrap?: <T>(component: T) => T;
};

let sentry: SentryModule | null | undefined;

export function getSentry() {
  if (sentry !== undefined) return sentry;
  try {
    sentry = require("@sentry/react-native") as SentryModule;
  } catch {
    sentry = null;
  }
  return sentry;
}

export function initCrashReporting() {
  const instance = getSentry();
  if (!instance?.init || !config.sentryDsn) return;
  instance.init({
    dsn: config.sentryDsn,
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
    environment: __DEV__ ? "development" : "production"
  });
}

export function captureAppError(error: unknown, context?: Record<string, unknown>) {
  getSentry()?.captureException?.(error, { extra: context });
}

export function setCrashUser(user: { id?: string; email?: string } | null) {
  getSentry()?.setUser?.(user);
}

export function wrapWithCrashReporting<T>(component: T): T {
  return getSentry()?.wrap?.(component) ?? component;
}
