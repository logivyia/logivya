import { readFile } from "node:fs/promises";
import path from "node:path";
import { cookies, headers } from "next/headers";
import { fallbackLocale, intlLocale, normalizeLocale, type Locale } from "@/i18n/config";

export type Dictionary = Record<string, string>;
export type Translator = (key: string, variables?: Record<string, string | number>) => string;
const dictionaryCache = new Map<Locale, Dictionary>();

function readableMissingTranslation(key: string, locale: Locale) {
  const lastSegment = key.split(".").filter(Boolean).at(-1) ?? key;
  const readable = lastSegment
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim();
  return readable.replace(/^./, (value) => value.toLocaleUpperCase(intlLocale(locale)));
}

function interpolate(template: string, variables: Record<string, string | number> = {}, locale: Locale = fallbackLocale) {
  return Object.entries(variables).reduce(
    (text, [name, value]) => text.replaceAll(
      `{${name}}`,
      typeof value === "number" ? new Intl.NumberFormat(intlLocale(locale)).format(value) : String(value),
    ),
    template,
  );
}

export async function loadServerDictionary(locale: Locale): Promise<Dictionary> {
  const cached = dictionaryCache.get(locale);
  if (cached) return cached;
  const [englishSource, localeSource] = await Promise.all([
    readFile(path.join(process.cwd(), "packages", "locales", `${fallbackLocale}.json`), "utf8"),
    readFile(path.join(process.cwd(), "packages", "locales", `${locale}.json`), "utf8"),
  ]);
  const dictionary = { ...JSON.parse(englishSource), ...JSON.parse(localeSource) } as Dictionary;
  dictionaryCache.set(locale, dictionary);
  return dictionary;
}

export async function getServerLocale(): Promise<Locale> {
  const requestHeaders = await headers();
  const explicit = normalizeLocale(requestHeaders.get("x-logivya-locale"));
  if (explicit) return explicit;

  const cookieLocale = normalizeLocale((await cookies()).get("logivya.locale")?.value);
  if (cookieLocale) return cookieLocale;

  const accepted = requestHeaders.get("accept-language")
    ?.split(",")
    .map((entry) => entry.split(";")[0]?.trim())
    .map(normalizeLocale)
    .find((locale): locale is Locale => Boolean(locale));
  return accepted ?? fallbackLocale;
}

export async function getRequestLocale(preferredLocale?: string | null): Promise<Locale> {
  const preferred = normalizeLocale(preferredLocale);
  if (preferred) return preferred;

  const requestHeaders = await headers();
  const explicit = normalizeLocale(requestHeaders.get("x-logivya-locale"));
  if (explicit) return explicit;

  const cookieLocale = normalizeLocale((await cookies()).get("logivya.locale")?.value);
  if (cookieLocale) return cookieLocale;

  const accepted = requestHeaders.get("accept-language")
    ?.split(",")
    .map((entry) => entry.split(";")[0]?.trim())
    .map(normalizeLocale)
    .find((locale): locale is Locale => Boolean(locale));
  return accepted ?? fallbackLocale;
}

export async function getServerTranslator(locale?: Locale): Promise<{ locale: Locale; t: Translator }> {
  const resolvedLocale = locale ?? await getServerLocale();
  const dictionary = await loadServerDictionary(resolvedLocale);
  return {
    locale: resolvedLocale,
    t: (key, variables) => interpolate(dictionary[key] ?? readableMissingTranslation(key, resolvedLocale), variables, resolvedLocale),
  };
}

export async function translateForLocale(locale: string | null | undefined, key: string, variables?: Record<string, string | number>) {
  const resolvedLocale = normalizeLocale(locale) ?? fallbackLocale;
  const dictionary = await loadServerDictionary(resolvedLocale);
  return interpolate(dictionary[key] ?? (await loadServerDictionary(fallbackLocale))[key] ?? readableMissingTranslation(key, resolvedLocale), variables, resolvedLocale);
}
