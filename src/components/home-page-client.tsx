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
const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.logivya.mobile";

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
  ar: {
    alt: "التنزيل من App Store",
    label: "تنزيل Logivya من App Store",
    locale: "en-us",
  },
} as const;

const googlePlayBadgeCopy = {
  tr: {
    alt: "Google Play'den indirin",
    label: "Logivya'yı Google Play'den indirin",
    locale: "tr",
  },
  en: {
    alt: "Get it on Google Play",
    label: "Get Logivya on Google Play",
    locale: "en",
  },
  ar: {
    alt: "تنزيل من Google Play",
    label: "تنزيل Logivya من Google Play",
    locale: "ar",
  },
} as const;

const iyzicoWebPaymentCopy = {
  tr: {
    eyebrow: "Korumalı web ödemesi",
    title: "Ödemeniz iyzico altyapısıyla güvenle işlenir",
    description: "Web abonelik ödemeleri iyzico'nun güvenli ödeme sayfasında işlenir. Kart numarası ve güvenlik kodu Logivya sunucularında tutulmaz.",
    points: ["Şifreli ödeme akışı", "Kart verisi Logivya'da saklanmaz", "İptal ve iade koşullarına kolay erişim"],
    checkoutLogoAlt: "iyzico ile Öde",
    cardsLogoAlt: "iyzico ile Öde; Mastercard, Visa, American Express ve Troy kartları",
    deliveryReturns: "Teslimat ve İade",
  },
  en: {
    eyebrow: "Protected web payment",
    title: "Your payment is securely processed by iyzico",
    description: "Web subscription payments are processed on iyzico's secure checkout. Logivya servers do not store card numbers or security codes.",
    points: ["Encrypted payment flow", "Card data is not stored by Logivya", "Easy access to cancellation and refund terms"],
    checkoutLogoAlt: "Pay with iyzico",
    cardsLogoAlt: "Pay with iyzico; Mastercard, Visa, American Express and Troy cards",
    deliveryReturns: "Delivery and Returns",
  },
  ar: {
    eyebrow: "دفع إلكتروني محمي",
    title: "تتم معالجة دفعتك بأمان عبر بنية iyzico",
    description: "تُعالج مدفوعات اشتراك الويب في صفحة الدفع الآمنة لدى iyzico. لا تحتفظ خوادم Logivya بأرقام البطاقات أو رموز الأمان.",
    points: ["مسار دفع مشفّر", "لا تُخزَّن بيانات البطاقة لدى Logivya", "وصول سهل إلى شروط الإلغاء والاسترداد"],
    checkoutLogoAlt: "الدفع عبر iyzico",
    cardsLogoAlt: "الدفع عبر iyzico باستخدام Mastercard أو Visa أو American Express أو Troy",
    deliveryReturns: "التسليم والاسترداد",
  },
} as const;

export function HomePageClient({ featureStatuses }: { featureStatuses: Partial<Record<ProductFeatureKey, ProductFeatureStatusValue>> }) {
  const { t, locale } = useI18n();
  const copyLocale = locale === "tr" || locale === "ar" ? locale : "en";
  const appStoreBadge = appStoreBadgeCopy[copyLocale];
  const googlePlayBadge = googlePlayBadgeCopy[copyLocale];
  const paymentCopy = iyzicoWebPaymentCopy[copyLocale];
  const productCopy = PRODUCT_CONTENT[copyLocale];
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
            <a
              href={GOOGLE_PLAY_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={googlePlayBadge.label}
              className="inline-flex min-h-12 items-center transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-400"
            >
              {/* Use Google's official localized badge artwork without modification. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://play.google.com/intl/en_us/badges/static/images/badges/${googlePlayBadge.locale}_badge_web_generic.png`}
                alt={googlePlayBadge.alt}
                className="h-[72px] w-auto"
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
                {featureStatuses[card.key] === "COMING_SOON" ? <span className="rounded-full bg-orange-500/15 px-2 py-1 text-[10px] font-bold text-orange-300">{t("publicProduct.status.comingSoon")}</span> : null}
              </div>
              <p className="mt-2 text-sm leading-6 text-white/45">{card.description}</p>
            </article>
          );
        })}
      </section>

      <PublicPricingCards />

      <section
        aria-labelledby="iyzico-web-payment-title"
        className="border-t border-white/10 px-5 py-10"
        data-web-payment-provider="iyzico"
      >
        <div className="mx-auto grid max-w-6xl gap-8 overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,.07),rgba(255,255,255,.025))] p-6 shadow-2xl shadow-black/20 md:grid-cols-[1fr_auto] md:items-center md:p-8">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300">{paymentCopy.eyebrow}</p>
            <h2 id="iyzico-web-payment-title" className="mt-3 text-xl font-semibold text-white sm:text-2xl">
              {paymentCopy.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/55">{paymentCopy.description}</p>
            <ul className="mt-5 grid gap-3 text-sm text-white/75 sm:grid-cols-2">
              {paymentCopy.points.map((point) => (
                <li key={point} className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal-300" aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/teslimat-ve-iade"
              className="mt-4 inline-flex min-h-11 items-center font-semibold text-orange-300 hover:text-orange-200"
            >
              {paymentCopy.deliveryReturns}
            </Link>
          </div>
          <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-white/10 bg-black/15 p-5 md:items-end">
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
          <Link href="/logivya-nedir">{t("publicProduct.footer.whatIs")}</Link>
          <Link href="/sss">{t("publicProduct.footer.faq")}</Link>
          <Link href="/teslimat-ve-iade">{paymentCopy.deliveryReturns}</Link>
        </div>
      </footer>
    </main>
  );
}
