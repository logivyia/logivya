import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { fallbackLocale, locales } from "@/i18n/config";

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const safeLocale = locales.includes(locale as never) ? locale : fallbackLocale;
  const dictionary = await readFile(path.join(process.cwd(), "locales", `${safeLocale}.json`), "utf8");
  return new NextResponse(dictionary, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
