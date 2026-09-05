"use client";

import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
import { LanguageSelector } from "@/components/language-selector";
import { PublicAttributionLink } from "@/components/public-attribution-link";
import { useI18n } from "@/i18n/provider";

export function PublicHeader() {
  const { locale, t } = useI18n();
  const homeLabel = locale === "tr" ? "Logivya ana sayfa" : locale === "ar" ? "صفحة Logivya الرئيسية" : "Logivya home";

  return (
    <header className="mx-auto max-w-7xl px-5 py-5 sm:py-6" data-public-header>
      <div className="grid gap-3 sm:hidden">
        <Link href="/" aria-label={homeLabel} className="mx-auto inline-flex max-w-full">
          <BrandLogo dark className="w-44 max-w-[72vw]" />
        </Link>
        <div className="grid grid-cols-2 items-center gap-3">
          <div className="justify-self-center"><LanguageSelector dark /></div>
          <PublicAttributionLink
            destination="/login"
            className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 hover:text-white"
          >
            {t("home.login")}
          </PublicAttributionLink>
        </div>
        <PublicAttributionLink
          destination="/register"
          className="inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-xl bg-orange-500 px-4 py-2 text-center text-sm font-semibold text-white"
        >
          {t("home.tryFree")}
        </PublicAttributionLink>
      </div>

      <div className="hidden grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-5 sm:grid">
        <div className="flex min-w-0 items-center gap-3 justify-self-start">
          <Link href="/" aria-label={homeLabel} className="inline-flex shrink-0">
            <BrandLogo dark className="w-40 lg:w-48" />
          </Link>
          <nav aria-label={locale === "tr" ? "Genel bağlantılar" : locale === "ar" ? "الروابط العامة" : "Public links"} className="hidden items-center lg:flex">
            <Link href="/canli-lojistik-pazari" className="rounded-xl px-3 py-2 text-sm text-white/75 hover:text-white">
              {t("publicProduct.nav.liveMarket")}
            </Link>
            <Link href="/fiyatlandirma" className="rounded-xl px-3 py-2 text-sm text-white/75 hover:text-white">
              {t("publicProduct.nav.pricing")}
            </Link>
          </nav>
        </div>
        <div className="justify-self-center"><LanguageSelector dark /></div>
        <div className="flex items-center justify-self-end gap-2 lg:gap-3">
          <PublicAttributionLink
            destination="/login"
            className="inline-flex min-h-11 items-center whitespace-nowrap rounded-xl px-3 py-2 text-sm text-white/75 hover:text-white lg:px-4"
          >
            {t("home.login")}
          </PublicAttributionLink>
          <PublicAttributionLink
            destination="/register"
            className="inline-flex min-h-11 max-w-48 items-center justify-center whitespace-nowrap rounded-xl bg-orange-500 px-3 py-2 text-center text-sm font-semibold text-white lg:px-4"
          >
            {t("home.tryFree")}
          </PublicAttributionLink>
        </div>
      </div>
    </header>
  );
}
