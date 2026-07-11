"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, Check, Layers3, LockKeyhole, MessagesSquare, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageSelector } from "@/components/language-selector";
import { useI18n } from "@/i18n/provider";

const featureIconMap = [MessagesSquare, CalendarClock, RefreshCw, Layers3, Zap, ShieldCheck] as const;
const featureKeys = [
  "home.feature.multichannel",
  "home.feature.scheduling",
  "home.feature.recurring",
  "home.feature.groups",
  "home.feature.workflow",
  "home.feature.security",
] as const;

const planKeys = ["trial", "starter", "professional"] as const;
const planFeatureCounts: Record<(typeof planKeys)[number], number> = {
  trial: 7,
  starter: 6,
  professional: 6,
};

export function HomePageClient() {
  const { t } = useI18n();

  return (
    <main className="min-h-screen bg-[#090d19] text-white">
      <header className="mx-auto flex max-w-7xl items-center px-5 py-6">
        <Link href="/">
          <BrandLogo dark className="w-48" />
        </Link>
        <nav className="ms-auto flex items-center gap-3">
          <LanguageSelector dark />
          <Link href="/login" className="rounded-xl px-4 py-2 text-sm text-white/70 hover:text-white">
            {t("home.login")}
          </Link>
          <Link href="/register" className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold">
            {t("home.tryFree")}
          </Link>
        </nav>
      </header>

      <section className="relative overflow-hidden px-5 py-24 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(124,58,237,.4),transparent_35%),radial-gradient(circle_at_75%_35%,rgba(45,212,191,.25),transparent_35%)]" />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center">
          <span className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-orange-300">
            {t("home.trialBadge")}
          </span>
          <BrandLogo dark className="mt-10 w-[360px] max-w-[88vw] sm:w-[520px]" />
          <div className="my-8 h-px w-24 bg-orange-400/70" />
          <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
            {t("home.slogan")}
          </h1>
          <div className="mt-10 flex justify-center gap-3">
            <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 font-semibold">
              {t("home.startNow")}
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/login" className="rounded-xl border border-white/15 px-6 py-3 font-semibold">
              {t("home.login")}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-16 md:grid-cols-3">
        {featureKeys.map((key, index) => {
          const Icon = featureIconMap[index];
          return (
            <article key={key} className="rounded-2xl border border-white/10 bg-white/[.04] p-6">
              <Icon className="size-6 text-orange-400" />
              <h2 className="mt-5 font-semibold">{t(key)}</h2>
              <p className="mt-2 text-sm leading-6 text-white/45">{t("home.feature.description")}</p>
            </article>
          );
        })}
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20">
        <div className="text-center">
          <p className="text-sm font-semibold text-orange-400">{t("home.pricingEyebrow")}</p>
          <h2 className="mt-3 text-4xl font-bold">{t("home.pricingTitle")}</h2>
        </div>
        <div className="mx-auto mt-12 grid max-w-6xl gap-5 md:grid-cols-2 lg:grid-cols-3">
          {planKeys.map((planKey) => {
            const features = Array.from({ length: planFeatureCounts[planKey] }, (_, index) => index + 1)
              .map((index) => t(`home.plan.${planKey}.feature${index}`))
              .filter((feature) => !feature.startsWith("home.plan."));
            const badge = t(`home.plan.${planKey}.badge`);
            return (
              <article
                key={planKey}
                data-pricing-plan={planKey}
                className="relative flex h-full flex-col rounded-2xl border border-white/10 bg-white/[.04] p-6"
              >
                {planKey === "trial" && badge && !badge.startsWith("home.plan.") && (
                  <span className="absolute end-5 top-5 rounded-full bg-orange-500/15 px-3 py-1 text-[10px] font-bold text-orange-300">
                    {badge}
                  </span>
                )}
                <h3 className="text-sm font-bold">{t(`home.plan.${planKey}.name`)}</h3>
                <p className="mt-6 text-2xl font-bold">{t(`home.plan.${planKey}.price`)}</p>
                <p className="mt-1 text-xs text-white/40">{t(`home.plan.${planKey}.period`)}</p>
                <p className="mt-5 min-h-16 text-sm leading-6 text-white/50">{t(`home.plan.${planKey}.description`)}</p>
                <ul className="my-6 flex-1 space-y-3 text-sm text-white/70">
                  {features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-teal-400" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/register" className="block rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-slate-950">
                  {t(`home.plan.${planKey}.cta`)}
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-white/10 px-5 py-8 text-center text-xs text-white/35">
        <LockKeyhole className="mx-auto mb-3 size-4" />
        <p>{t("home.footerText")}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-4">
          <Link href="/privacy-policy">{t("home.link.privacy")}</Link>
          <Link href="/terms-of-service">{t("home.link.terms")}</Link>
          <Link href="/cookie-policy">{t("home.link.cookie")}</Link>
          <Link href="/kvkk">{t("home.link.kvkk")}</Link>
          <Link href="/data-processing-agreement">{t("home.link.dpa")}</Link>
        </div>
      </footer>
    </main>
  );
}
