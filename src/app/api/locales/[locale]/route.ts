import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { fallbackLocale, locales } from "@/i18n/config";

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const safeLocale = locales.includes(locale as never) ? locale : fallbackLocale;
  const [fallbackSource, localeSource] = await Promise.all([
    readFile(path.join(process.cwd(), "locales", `${fallbackLocale}.json`), "utf8"),
    readFile(path.join(process.cwd(), "locales", `${safeLocale}.json`), "utf8"),
  ]);
  const dictionary = { ...JSON.parse(fallbackSource), ...JSON.parse(localeSource) };
  return NextResponse.json(dictionary, {
    headers: { "Cache-Control": "no-store, max-age=0", "Content-Language": safeLocale, Vary: "Accept-Language" },
  });
}
