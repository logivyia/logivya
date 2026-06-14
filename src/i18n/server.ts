import { cookies } from "next/headers";
import { fallbackLocale, locales, type Locale } from "@/i18n/config";

export async function getServerLocale(): Promise<Locale> {
  const cookieLocale = (await cookies()).get("logivya.locale")?.value;
  return locales.includes(cookieLocale as Locale) ? (cookieLocale as Locale) : fallbackLocale;
}
