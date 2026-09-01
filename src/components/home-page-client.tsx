"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarClock, Layers3, LockKeyhole, MessagesSquare, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { PublicAttributionLink } from "@/components/public-attribution-link";
import { PublicHeader } from "@/components/public-header";
import { PublicPricingCards } from "@/components/public-pricing-cards";
import { useI18n } from "@/i18n/provider";
import {
  PRODUCT_CONTENT,
  type ProductFeatureKey,
  type ProductFeatureStatusValue,
} from "@/config/product-content";

const featureIconMap = [MessagesSquare, CalendarClock, RefreshCw, Layers3, Zap, ShieldCheck] as const;

const APP_STORE_URL = "https://apps.apple.com/app/logivya/id6792539737";

const appStoreBadgeCopy = {
  tr: {
    alt: "App Store'dan indirin",
    label: "Logivya'yı App Store'dan indirin",
    locale: "tr-tr",
  },
  en: {
    alt: "Download on the App Store",
    label: "Download Logivya on the App Store",
    locale: "en-us",
  },
} as const;

const iyzicoWebPaymentCopy = {
  tr: {
    title: "Web ödemelerinde güvenli altyapı",
    description: "Web abonelik ödemeleri, iyzico hizmeti etkinleştirildiğinde iyzico'nun güvenli ödeme altyapısı üzerinden işlenir. Kart bilgileri Logivya tarafından saklanmaz.",
    checkoutLogoAlt: "iyzico ile Öde",
    cardsLogoAlt: "iyzico ile Öde; Mastercard, Visa, American Express ve Troy kartları",
    deliveryReturns: "Teslimat ve İade",
  },
  en: {
    title: "Secure infrastructure for web payments",
    description: "Once the iyzico service is activated, web subscription payments are processed through iyzico's secure payment infrastructure. Logivya does not store card details.",
    checkoutLogoAlt: "Pay with iyzico",
    cardsLogoAlt: "Pay with iyzico; Mastercard, Visa, American Express and Troy cards",
    deliveryReturns: "Delivery and Returns",
  },
} as const;

export function HomePageClient({ featureStatuses }: { featureStatuses: Partial<Record<ProductFeatureKey, ProductFeatureStatusValue>> }) {
  const { t, locale } = useI18n();
  const appStoreBadge = locale === "tr" ? appStoreBadgeCopy.tr : appStoreBadgeCopy.en;
  const paymentCopy = locale === "tr" ? iyzicoWebPaymentCopy.tr : iyzicoWebPaymentCopy.en;
  const productCopy = locale === "tr" ? PRODUCT_CONTENT.tr : PRODUCT_CONTENT.en;
  const visibleCards = productCopy.featureCards.filter((card) => {
    const status = featureStatuses[card.key];
    return status === "PUBLIC" || status === "COMING_SOON";
  });

  return (
    <main className="min-h-screen bg-[#090d19] text-white">
      <PublicHeader />

      <section className="relative overflow-hidden px-5 py-24 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(124,58,237,.4),transparent_35%),radial-gradient(circle_at_75%_35%,rgba(45,212,191,.25),transparent_35%)]" />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center">
          <BrandLogo dark className="w-[360px] max-w-[88vw] sm:w-[520px]" />
          <div className="my-8 h-px w-24 bg-orange-400/70" />
          <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
            {productCopy.headline}
          </h1>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <PublicAttributionLink destination="/register" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 font-semibold">
              {productCopy.primaryCta}
              <ArrowRight className="size-4" />
            </PublicAttributionLink>
            <PublicAttributionLink destination="/login" className="inline-flex min-h-12 items-center rounded-xl border border-white/15 px-6 py-3 font-semibold">
              {t("home.login")}
            </PublicAttributionLink>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={appStoreBadge.label}
              className="inline-flex min-h-12 items-center rounded-[10px] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-400"
            >
              {/* Apple requires the official badge artwork to remain unmodified. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/${appStoreBadge.locale}?size=250x83`}
                alt={appStoreBadge.alt}
                className="h-12 w-auto"
              />
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-16 md:grid-cols-3">
        {visibleCards.map((card, index) => {
          const Icon = featureIconMap[index];
          return (
            <article key={`${card.key}:${card.title}`} className="rounded-2xl border border-white/10 bg-white/[.04] p-6">
              <Icon className="size-6 text-orange-400" />
              <div className="mt-5 flex items-center gap-2">
                <h2 className="font-semibold">{card.title}</h2>
                {featureStatuses[card.key] === "COMING_SOON" ? <span className="rounded-full bg-orange-500/15 px-2 py-1 text-[10px] font-bold text-orange-300">{locale === "tr" ? "Yakında" : "Coming soon"}</span> : null}
              </div>
              <p className="mt-2 text-sm leading-6 text-white/45">{card.description}</p>
            </article>
          );
        })}
      </section>

      <section aria-labelledby="logivya-platform-title" className="mx-auto max-w-6xl px-5 pb-16">
        <div className="rounded-3xl border border-white/10 bg-white/[.04] p-6 sm:p-8">
          <p className="text-sm font-semibold text-orange-300">{productCopy.category}</p>
          <h2 id="logivya-platform-title" className="mt-3 text-2xl font-bold sm:text-3xl">
            {locale === "tr" ? "Canlı lojistik operasyonları tek merkezde" : "Live logistics operations in one place"}
          </h2>
          <p className="mt-5 max-w-4xl text-sm leading-7 text-white/60 sm:text-base">{productCopy.extendedDefinition}</p>
          <nav aria-label={locale === "tr" ? "Logivya ürün alanları" : "Logivya product areas"} className="mt-6 flex flex-wrap gap-2">
            {[
              ["/canli-lojistik-pazari", locale === "tr" ? "Canlı Lojistik Pazarı" : "Live Logistics Marketplace"],
              ["/logivya-nedir", locale === "tr" ? "Genel Lojistik" : "General Logistics"],
              ["/evden-eve-nakliyat", locale === "tr" ? "Evden Eve Nakliyat" : "Home Moving"],
              ["/parsiyel-yuk", locale === "tr" ? "Parsiyel Yük" : "Partial Load"],
              ["/agir-nakliyat", locale === "tr" ? "Ağır Nakliyat" : "Heavy Haul"],
              ["/akilli-eslestirme", locale === "tr" ? "Talep ve Akıllı Eşleştirme" : "Demands and Intelligent Matching"],
              ["/whatsapp-yonetimi", locale === "tr" ? "WhatsApp Yönetimi" : "WhatsApp Management"],
              ["/telegram-yonetimi", locale === "tr" ? "Telegram Yönetimi" : "Telegram Management"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="inline-flex min-h-11 items-center rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:border-orange-400/50 hover:text-white">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <PublicPricingCards />

      <section
        aria-labelledby="iyzico-web-payment-title"
        className="border-t border-white/10 px-5 py-10"
        data-web-payment-provider="iyzico"
      >
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 rounded-2xl border border-white/10 bg-white/[.04] p-6 text-center md:flex-row md:text-start">
          <div className="max-w-xl">
            <h2 id="iyzico-web-payment-title" className="text-lg font-semibold text-white">
              {paymentCopy.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/55">{paymentCopy.description}</p>
            <Link
              href="/teslimat-ve-iade"
              className="mt-4 inline-flex min-h-11 items-center font-semibold text-orange-300 hover:text-orange-200"
            >
              {paymentCopy.deliveryReturns}
            </Link>
          </div>
          <div className="flex w-full max-w-md flex-col items-center gap-5 md:items-end">
            <Image
              src={locale === "tr"
                ? "/payments/iyzico/iyzico-ile-ode-white-horizontal.png"
                : "/payments/iyzico/pay-with-iyzico-white-horizontal.png"}
              width={1050}
              height={locale === "tr" ? 155 : 145}
              sizes="(max-width: 768px) 70vw, 280px"
              alt={paymentCopy.checkoutLogoAlt}
              className="h-auto w-full max-w-[280px]"
            />
            <Image
              src="/payments/iyzico/accepted-card-brands-white@2x.png"
              width={912}
              height={64}
              sizes="(max-width: 768px) 88vw, 440px"
              alt={paymentCopy.cardsLogoAlt}
              className="h-auto w-full max-w-[440px]"
            />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-5 py-8 text-center text-xs text-white/70">
        <LockKeyhole className="mx-auto mb-3 size-4" />
        <p>{t("home.footerText")}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-4">
          <Link href="/privacy-policy">{t("home.link.privacy")}</Link>
          <Link href="/terms-of-service">{t("home.link.terms")}</Link>
          <Link href="/cookie-policy">{t("home.link.cookie")}</Link>
          <Link href="/kvkk">{t("home.link.kvkk")}</Link>
          <Link href="/data-processing-agreement">{t("home.link.dpa")}</Link>
          <Link href="/logivya-nedir">{locale === "tr" ? "Logivya Nedir?" : "About Logivya"}</Link>
          <Link href="/sss">{locale === "tr" ? "SSS" : "FAQ"}</Link>
          <Link href="/teslimat-ve-iade">{paymentCopy.deliveryReturns}</Link>
        </div>
      </footer>
    </main>
  );
}
