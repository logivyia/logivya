import { config } from "@/constants/config";
import { redactSensitive, serializeLogError } from "@logivya/logging";
import { useSettingsStore } from "@/auth/settings-store";
import {
  getCurrentMobileRoute,
  rememberMobileRecoveryIncident,
} from "@/services/mobile-recovery-context";
import { getMobilePlatform } from "@/utils/device";

declare const require: (name: string) => unknown;

type SentryModule = {
  init?: (options: Record<string, unknown>) => void;
  captureException?: (error: unknown, context?: Record<string, unknown>) => void;
  setUser?: (user: Record<string, unknown> | null) => void;
  wrap?: <T>(component: T) => T;
  close?: () => Promise<void>;
};

type SentryEvent = Record<string, unknown>;

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
  if (!useSettingsStore.getState().diagnosticsEnabled) return;
  const instance = getSentry();
  if (!instance?.init || !config.sentryDsn) return;
  try {
    instance.init({
      dsn: config.sentryDsn,
      tracesSampleRate: config.environment === "production" ? 0.05 : 0,
      enableAutoSessionTracking: true,
      sendDefaultPii: false,
      attachStacktrace: true,
      environment: config.environment,
      release: `com.logivya.mobile@${config.appVersion}`,
      dist: String(config.versionCode),
      beforeSend: (event: SentryEvent) => redactSensitive(event)
    });
  } catch {
    sentry = null;
  }
}

export function captureAppError(error: unknown, context?: Record<string, unknown>) {
  if (!config.sentryDsn || !useSettingsStore.getState().diagnosticsEnabled) return;

  try {
    getSentry()?.captureException?.(error, {
      extra: redactSensitive({
        ...context,
        appVersion: config.appVersion,
        versionCode: config.versionCode,
        buildMarker: config.buildMarker,
        safeError: serializeLogError(error)
      })
    });
  } catch {
    sentry = null;
  }
}

function recoveryDigest(error: unknown) {
  const safe = serializeLogError(error);
  const source = `${safe.name || "Error"}:${safe.stack?.split("\n")[1] || ""}`;
  let hash = 2_166_136_261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `mobile.${(hash >>> 0).toString(16)}`;
}

export function reportMobileRecoveryIncident(
  error: unknown,
  recoveryId: string,
  failureStage: string,
) {
  rememberMobileRecoveryIncident(recoveryId);
  const platform = getMobilePlatform().toLowerCase();
  const errorName =
    error instanceof Error && error.name
      ? error.name.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 80)
      : "Error";
  const body = {
    digest: recoveryDigest(error),
    name: errorName || "Error",
    source: "mobile-root-boundary",
    route: getCurrentMobileRoute(),
    platform: platform === "ios" ? "ios" : "android",
    appVersion: config.appVersion,
    recoveryId,
    failureStage: failureStage.slice(0, 80),
    buildNumber: String(config.versionCode),
  };

  void fetch(`${config.apiBaseUrl}/api/observability/client-events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Correlation-Id": recoveryId,
      "X-Request-Id": recoveryId,
      "X-Client-Recovery-Id": recoveryId,
      "X-Client-Platform": platform,
      "X-Logivya-App-Version": config.appVersion,
      "X-Logivya-Version-Code": String(config.versionCode),
      "X-Logivya-Build-Marker": config.buildMarker,
    },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

export function setCrashUser(user: { id?: string } | null) {
  if (!config.sentryDsn || !useSettingsStore.getState().diagnosticsEnabled) return;

  try {
    getSentry()?.setUser?.(user?.id ? { id: user.id } : null);
  } catch {
    sentry = null;
  }
}

export function wrapWithCrashReporting<T>(component: T): T {
  if (!config.sentryDsn || !useSettingsStore.getState().diagnosticsEnabled) return component;

  try {
    return getSentry()?.wrap?.(component) ?? component;
  } catch {
    sentry = null;
    return component;
  }
}

export async function configureCrashReporting(enabled: boolean) {
  if (enabled) {
    initCrashReporting();
    return;
  }
  await getSentry()?.close?.().catch(() => undefined);
  sentry = undefined;
}
