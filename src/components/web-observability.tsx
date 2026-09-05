"use client";

import { useCallback, useEffect, useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";

import { reportClientError } from "@/client/observability/report-client-error";
import {
  CLIENT_OBSERVABILITY_CONSENT_EVENT,
  readClientObservabilityConsent,
  saveClientObservabilityConsent,
} from "@/lib/client-observability-consent";
import {
  PRIVACY_PREFERENCES_STORAGE_KEY,
  readBrowserPrivacyPreferences,
} from "@/lib/privacy-preferences";

type WebVitalMetric = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];
const SUPPORTED_WEB_VITALS = new Set(["TTFB", "FCP", "LCP", "FID", "CLS", "INP"]);

function postWebVital(metric: WebVitalMetric) {
  if (!SUPPORTED_WEB_VITALS.has(metric.name)) return;
  const payload = JSON.stringify({
    id: metric.id.slice(0, 100),
    name: metric.name,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
    navigationType: metric.navigationType,
    route: window.location.pathname,
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION || "unknown",
  });
  void fetch("/api/observability/web-vitals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}

export function WebObservability() {
  const analyticsAllowed = useRef(false);
  const diagnosticsAllowed = useRef(false);

  const handleWebVital = useCallback((metric: WebVitalMetric) => {
    if (analyticsAllowed.current) postWebVital(metric);
  }, []);
  useReportWebVitals(handleWebVital);

  useEffect(() => {
    let active = true;

    const applyCachedConsent = () => {
      const browser = readBrowserPrivacyPreferences();
      const authenticated = readClientObservabilityConsent();
      analyticsAllowed.current = browser?.analytics === true && authenticated.analytics;
      diagnosticsAllowed.current = authenticated.diagnostics;
    };

    const refreshAuthenticatedConsent = async () => {
      applyCachedConsent();
      const response = await fetch("/api/privacy/overview", { cache: "no-store" }).catch(() => null);
      if (!active || !response?.ok) return;
      const payload = await response.json() as { purposes?: Array<{ code: string; currentStatus: string }> };
      const statuses = new Map((payload.purposes ?? []).map((purpose) => [purpose.code, purpose.currentStatus]));
      saveClientObservabilityConsent({
        analytics: statuses.get("PRODUCT_ANALYTICS") === "GRANTED",
        diagnostics: statuses.get("CRASH_DIAGNOSTICS") === "GRANTED",
      });
      applyCachedConsent();
    };

    const onConsentChange = () => applyCachedConsent();
    const onStorage = (event: StorageEvent) => {
      if (event.key === PRIVACY_PREFERENCES_STORAGE_KEY) applyCachedConsent();
    };
    window.addEventListener("logivya:privacy-preferences", onConsentChange);
    window.addEventListener(CLIENT_OBSERVABILITY_CONSENT_EVENT, onConsentChange);
    window.addEventListener("storage", onStorage);
    void refreshAuthenticatedConsent();

    const recent = new Map<string, number>();
    const reportOnce = (source: "window-error" | "unhandled-rejection", name: string) => {
      if (!diagnosticsAllowed.current) return;
      const key = `${source}:${name}`;
      const now = Date.now();
      if (now - (recent.get(key) ?? 0) < 30_000) return;
      recent.set(key, now);
      reportClientError({ source, name: name.slice(0, 80) });
    };
    const onError = (event: ErrorEvent) => reportOnce("window-error", event.error instanceof Error ? event.error.name : "WindowError");
    const onRejection = (event: PromiseRejectionEvent) => reportOnce("unhandled-rejection", event.reason instanceof Error ? event.reason.name : "UnhandledRejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      active = false;
      window.removeEventListener("logivya:privacy-preferences", onConsentChange);
      window.removeEventListener(CLIENT_OBSERVABILITY_CONSENT_EVENT, onConsentChange);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      recent.clear();
    };
  }, []);
  return null;
}
