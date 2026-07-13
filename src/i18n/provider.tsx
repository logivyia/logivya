"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  fallbackLocale,
  localeMetadata,
  localeNames,
  normalizeLocale,
  type Locale,
} from "@/i18n/config";
import englishDictionary from "../../locales/en.json";
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
  const response = await fetch(`/api/locales/${locale}?v=3`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Locale could not be loaded: ${locale}`);
  return response.json() as Promise<Dictionary>;
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
    .replace(/^./, (value) => value.toLocaleUpperCase("en-US"));
}

function builtInInitialDictionary(locale: Locale): Dictionary {
  return locale === "tr" ? turkishDictionary : englishDictionary;
}

export function I18nProvider({
  children,
  initialLocale = fallbackLocale,
  initialDictionary,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
  initialDictionary?: Dictionary;
}) {
  const safeInitialLocale = normalizeLocale(initialLocale) ?? fallbackLocale;
  const [locale, setLocaleState] = useState<Locale>(safeInitialLocale);
  const [dictionary, setDictionary] = useState<Dictionary>(() => ({
    ...builtInInitialDictionary(safeInitialLocale),
    ...(initialDictionary ?? {}),
  }));
  const [fallback, setFallback] = useState<Dictionary>(englishDictionary);
  const localeRef = useRef(safeInitialLocale);

  const applyLocale = useCallback(async (next: Locale, persistToProfile: boolean) => {
    const [nextDictionary, fallbackDictionary] = await Promise.all([
      loadDictionary(next),
      next === fallbackLocale ? Promise.resolve(englishDictionary as Dictionary) : loadDictionary(fallbackLocale),
    ]);
    const mergedDictionary = { ...fallbackDictionary, ...nextDictionary, ...(localeOverrides[next] ?? {}) };
    setDictionary(mergedDictionary);
    setFallback({ ...fallbackDictionary, ...(localeOverrides[fallbackLocale] ?? {}) });
    setLocaleState(next);
    localeRef.current = next;
    localStorage.setItem("logivya.locale", next);
    document.cookie = `logivya.locale=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    document.documentElement.dir = localeMetadata[next].direction;

    if (persistToProfile) {
      await fetch("/api/preferences/locale", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Accept-Language": next, "X-Logivya-Locale": next },
        body: JSON.stringify({ locale: next }),
      }).catch(() => undefined);
    }
  }, []);

  const setLocale = useCallback((next: Locale) => applyLocale(next, true), [applyLocale]);

  useEffect(() => {
    let cancelled = false;
    const stored = normalizeLocale(localStorage.getItem("logivya.locale"));
    const cookieLocale = readCookieLocale();
    const browserLocale = normalizeLocale(navigator.language);
    const localPreference = stored ?? cookieLocale ?? browserLocale ?? safeInitialLocale;

    const initializationTimer = window.setTimeout(() => {
      if (cancelled) return;
      void applyLocale(localPreference, false).then(async () => {
        const response = await fetch("/api/preferences/locale", {
          cache: "no-store",
          headers: { "Accept-Language": localPreference, "X-Logivya-Locale": localPreference },
        }).catch(() => null);
        if (!response?.ok || cancelled) return;
        const payload = await response.json() as { locale?: string };
        const profileLocale = normalizeLocale(payload.locale);
        if (profileLocale && profileLocale !== localeRef.current && !cancelled) {
          await applyLocale(profileLocale, false);
        }
      }).catch(() => undefined);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(initializationTimer);
    };
  }, [applyLocale, safeInitialLocale]);

  const t = useCallback((key: string, variables: Record<string, string | number> = {}) => {
    const template = dictionary[key] ?? fallback[key] ?? englishDictionary[key as keyof typeof englishDictionary];
    if (!template && process.env.NODE_ENV === "development") {
      console.warn(`[i18n] missing translation key: ${key}`);
    }
    const safeTemplate = template ?? readableMissingTranslation(key);
    return Object.entries(variables).reduce(
      (text, [name, value]) => text.replaceAll(
        `{${name}}`,
        typeof value === "number" ? new Intl.NumberFormat(localeMetadata[locale].intlLocale).format(value) : String(value),
      ),
      safeTemplate,
    );
  }, [dictionary, fallback, locale]);

  const value = useMemo(() => ({
    locale,
    direction: localeMetadata[locale].direction,
    localeNames,
    setLocale,
    t,
  }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
