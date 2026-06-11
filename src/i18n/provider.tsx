"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fallbackLocale, localeNames, locales, rtlLocales, type Locale } from "@/i18n/config";
import turkishDictionary from "../../locales/tr.json";

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
  const response = await fetch(`/api/locales/${locale}`);
  if (!response.ok) throw new Error(`Locale could not be loaded: ${locale}`);
  return response.json() as Promise<Dictionary>;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(fallbackLocale);
  const [dictionary, setDictionary] = useState<Dictionary>(turkishDictionary);
  const [fallback, setFallback] = useState<Dictionary>(turkishDictionary);
  const loadLocale = useCallback(async (next: Locale) => {
    const [nextDictionary, fallbackDictionary] = await Promise.all([loadDictionary(next), loadDictionary(fallbackLocale)]);
    setDictionary(nextDictionary);
    setFallback(fallbackDictionary);
    setLocaleState(next);
    localStorage.setItem("logivya.locale", next);
    document.documentElement.lang = next;
    document.documentElement.dir = rtlLocales.includes(next) ? "rtl" : "ltr";
  }, []);
  useEffect(() => {
    const stored = localStorage.getItem("logivya.locale") as Locale | null;
    const initialLocale = stored && locales.includes(stored) ? stored : fallbackLocale;
    queueMicrotask(() => void loadLocale(initialLocale));
  }, [loadLocale]);
  const t = useCallback((key: string, variables: Record<string, string | number> = {}) => {
    const template = dictionary[key] ?? fallback[key] ?? key;
    return Object.entries(variables).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
  }, [dictionary, fallback]);
  const value = useMemo(() => ({ locale, direction: rtlLocales.includes(locale) ? "rtl" as const : "ltr" as const, localeNames, setLocale: loadLocale, t }), [locale, loadLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
