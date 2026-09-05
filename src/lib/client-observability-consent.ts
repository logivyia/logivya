export const CLIENT_OBSERVABILITY_CONSENT_KEY = "logivya.observability-consent";
export const CLIENT_OBSERVABILITY_CONSENT_EVENT = "logivya:observability-consent";

export type ClientObservabilityConsent = {
  analytics: boolean;
  diagnostics: boolean;
  updatedAt: string;
};

export function readClientObservabilityConsent(): ClientObservabilityConsent {
  if (typeof window === "undefined") return { analytics: false, diagnostics: false, updatedAt: "" };
  try {
    const value = JSON.parse(localStorage.getItem(CLIENT_OBSERVABILITY_CONSENT_KEY) || "null") as Partial<ClientObservabilityConsent> | null;
    return {
      analytics: value?.analytics === true,
      diagnostics: value?.diagnostics === true,
      updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : "",
    };
  } catch {
    return { analytics: false, diagnostics: false, updatedAt: "" };
  }
}

export function saveClientObservabilityConsent(value: Pick<ClientObservabilityConsent, "analytics" | "diagnostics">) {
  if (typeof window === "undefined") return;
  const next = { ...value, updatedAt: new Date().toISOString() };
  localStorage.setItem(CLIENT_OBSERVABILITY_CONSENT_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(CLIENT_OBSERVABILITY_CONSENT_EVENT, { detail: next }));
}

export function isClientDiagnosticsAllowed() {
  return readClientObservabilityConsent().diagnostics;
}
