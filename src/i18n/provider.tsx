"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fallbackLocale, localeNames, locales, rtlLocales, type Locale } from "@/i18n/config";
import turkishDictionary from "../../locales/tr.json";
import { localeOverrides } from "@/i18n/overrides";

type Dictionary = Record<string, string>;
type I18nContextValue = {
  locale: Locale;
  direction: "ltr" | "rtl";
  localeNames: typeof localeNames;
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: string, variables?: Record<string, string | number>) => string;
};
const I18nContext = createContext<I18nContextValue | null>(null);
async function loadDictionary(locale: Locale) {
  const response = await fetch(`/api/locales/${locale}?v=2`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Locale could not be loaded: ${locale}`);
  return response.json() as Promise<Dictionary>;
}

function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().split("-")[0] as Locale;
  return locales.includes(normalized) ? normalized : null;
}

function readCookieLocale() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)logivya\.locale=([^;]+)/);
  return normalizeLocale(match ? decodeURIComponent(match[1]) : null);
}

function readableMissingTranslation(key: string) {
  const lastSegment = key.split(".").filter(Boolean).at(-1) ?? key;
  return lastSegment
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/^./, (value) => value.toLocaleUpperCase("tr-TR"));
}

export function I18nProvider({ children, initialLocale = fallbackLocale }: { children: React.ReactNode; initialLocale?: Locale }) {
  const safeInitialLocale = normalizeLocale(initialLocale) ?? fallbackLocale;
  const [locale, setLocaleState] = useState<Locale>(safeInitialLocale);
  const [dictionary, setDictionary] = useState<Dictionary>(turkishDictionary);
  const [fallback, setFallback] = useState<Dictionary>(turkishDictionary);
  const loadLocale = useCallback(async (next: Locale) => {
    const [nextDictionary, fallbackDictionary] = await Promise.all([loadDictionary(next), loadDictionary(fallbackLocale)]);
    setDictionary({ ...nextDictionary, ...(localeOverrides[next] ?? {}) });
    setFallback({ ...fallbackDictionary, ...(localeOverrides[fallbackLocale] ?? {}) });
    setLocaleState(next);
    localStorage.setItem("logivya.locale", next);
    document.cookie = `logivya.locale=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    document.documentElement.dir = rtlLocales.includes(next) ? "rtl" : "ltr";
  }, []);
  useEffect(() => {
    const cookieLocale = readCookieLocale();
    const stored = normalizeLocale(localStorage.getItem("logivya.locale"));
    const browserLocale = normalizeLocale(navigator.language);
    const nextLocale = cookieLocale ?? safeInitialLocale ?? stored ?? browserLocale ?? fallbackLocale;
    queueMicrotask(() => void loadLocale(nextLocale));
  }, [loadLocale, safeInitialLocale]);
  const t = useCallback((key: string, variables: Record<string, string | number> = {}) => {
    const template = dictionary[key] ?? fallback[key] ?? turkishDictionary[key as keyof typeof turkishDictionary];
    if (!template && process.env.NODE_ENV === "development") {
      console.warn(`[i18n] missing translation key: ${key}`);
    }
    const safeTemplate = template ?? readableMissingTranslation(key);
    return Object.entries(variables).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), safeTemplate);
  }, [dictionary, fallback]);
  const value = useMemo(() => ({ locale, direction: rtlLocales.includes(locale) ? "rtl" as const : "ltr" as const, localeNames, setLocale: loadLocale, t }), [locale, loadLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
