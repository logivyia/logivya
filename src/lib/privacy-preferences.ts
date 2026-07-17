export const PRIVACY_PREFERENCES_STORAGE_KEY = "logivya.privacy-preferences";
export const PRIVACY_PREFERENCES_VERSION = "2026-07-16-v1";

export type BrowserPrivacyPreferences = {
  version: string;
  necessary: true;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
};

export function defaultBrowserPrivacyPreferences(): BrowserPrivacyPreferences {
  return { version: PRIVACY_PREFERENCES_VERSION, necessary: true, functional: false, analytics: false, marketing: false, updatedAt: new Date(0).toISOString() };
}

export function readBrowserPrivacyPreferences(): BrowserPrivacyPreferences | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PRIVACY_PREFERENCES_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<BrowserPrivacyPreferences>;
      if (parsed.version === PRIVACY_PREFERENCES_VERSION && parsed.necessary === true) return { ...defaultBrowserPrivacyPreferences(), ...parsed, necessary: true };
    } catch {
      localStorage.removeItem(PRIVACY_PREFERENCES_STORAGE_KEY);
    }
  }

  const legacy = localStorage.getItem("logivya.cookie-consent");
  if (!legacy) return null;
  const migrated = { ...defaultBrowserPrivacyPreferences(), functional: legacy === "all", analytics: legacy === "all", marketing: legacy === "all", updatedAt: new Date().toISOString() };
  saveBrowserPrivacyPreferences(migrated);
  localStorage.removeItem("logivya.cookie-consent");
  return migrated;
}

export function saveBrowserPrivacyPreferences(value: BrowserPrivacyPreferences) {
  if (typeof window === "undefined") return;
  const normalized = { ...value, version: PRIVACY_PREFERENCES_VERSION, necessary: true as const, updatedAt: new Date().toISOString() };
  localStorage.setItem(PRIVACY_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("logivya:privacy-preferences", { detail: normalized }));
}

export function openBrowserPrivacyPreferences() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("logivya:open-cookie-preferences"));
}
