"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";

import { PublicAttributionLink } from "@/components/public-attribution-link";
import {
  canonicalSubscriptionPlanCatalog,
  type SubscriptionBillingInterval,
  type SubscriptionPlanCode,
} from "@/config/subscription-plans";
import { formatCurrency } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";

const plans = canonicalSubscriptionPlanCatalog();

export function PublicPricingCards({ embedded = false, showHeading = true }: { embedded?: boolean; showHeading?: boolean }) {
  const { locale, t } = useI18n();
  const [billingInterval, setBillingInterval] = useState<SubscriptionBillingInterval>("MONTHLY");
  const [expandedPlans, setExpandedPlans] = useState<Partial<Record<SubscriptionPlanCode, boolean>>>({});
  const marketingLocale = locale === "tr" ? "tr" : "en";
  const seatHelp = locale === "tr"
    ? "Kullanıcı sayısı, pakete erişebilen ayrı Logivya kullanıcı hesaplarını ifade eder. Her kullanıcı kendi giriş bilgileri ve yetkileriyle giriş yapar. Ortak telefon, ortak parola veya ortak kişisel hesap kullanımı anlamına gelmez."
    : "User count means separate Logivya user accounts that can access the plan. Every user signs in with their own credentials and permissions; it does not mean sharing a phone, password, or personal account.";

  return (
    <section
      aria-labelledby={showHeading ? "public-pricing-title" : undefined}
      className={embedded ? "mt-12" : "mx-auto max-w-7xl px-5 py-20"}
      data-public-pricing
    >
      {showHeading ? (
        <div className="text-center">
          <p className="text-sm font-semibold text-orange-300">{t("home.pricingEyebrow")}</p>
          <h2 id="public-pricing-title" className="mt-3 text-4xl font-bold">{t("home.pricingTitle")}</h2>
        </div>
      ) : null}

      <div className="mx-auto mt-7 grid w-full max-w-xs grid-cols-2 rounded-xl border border-white/15 bg-white/[.04] p-1" role="group" aria-label={t("home.billing.interval")}>
        {(["MONTHLY", "YEARLY"] as const).map((interval) => (
          <button
            key={interval}
            type="button"
            aria-pressed={billingInterval === interval}
            onClick={() => setBillingInterval(interval)}
            className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${billingInterval === interval ? "bg-orange-500 text-white" : "text-white/75 hover:text-white"}`}
          >
            {t(interval === "MONTHLY" ? "home.billing.monthly" : "home.billing.yearly")}
          </button>
        ))}
      </div>

      <p className="mx-auto mt-5 max-w-3xl text-center text-sm leading-6 text-white/70">{seatHelp}</p>

      <div className="mx-auto mt-10 grid max-w-6xl items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const expanded = expandedPlans[plan.slug] === true;
          const isTrial = plan.slug === "trial";
          const summaryGroups = plan.marketingSummaryGroups[marketingLocale];
          const description = plan.marketingDescription[marketingLocale];
          const seatClarification = plan.seatClarification[marketingLocale];
          const features = plan.marketingFeatures[marketingLocale];
          const priceMinor = billingInterval === "YEARLY" ? plan.yearlyPriceMinor : plan.monthlyPriceMinor;
          const price = isTrial ? t("home.plan.trial.period") : formatCurrency(priceMinor / 100, plan.currency, locale);
          const period = isTrial ? null : t(billingInterval === "YEARLY" ? "home.price.perYear" : "home.price.perMonth");
          const titleId = `public-plan-title-${plan.slug}`;

          return (
            <article
              key={plan.slug}
              aria-labelledby={titleId}
              data-pricing-plan={plan.slug}
              data-expanded={expanded}
              className={`relative flex w-full flex-col rounded-2xl border border-white/10 bg-white/[.04] p-6 ${expanded ? "md:col-span-2 lg:col-span-3" : ""}`}
            >
              <h3 id={titleId} className="text-lg font-bold">{t(plan.displayNameKey)}</h3>
              {!isTrial ? (
                <>
                  <p className="mt-2 text-sm font-semibold text-orange-300">{plan.accountLimit} {locale === "tr" ? "kullanıcı" : plan.accountLimit === 1 ? "user" : "users"}</p>
                  <p className="mt-1 min-h-10 text-xs leading-5 text-white/70">{seatClarification}</p>
                </>
              ) : null}
              <p className="mt-6 text-2xl font-bold" aria-label={period ? `${price}, ${period}` : price}>{price}</p>
              {period ? <p className="mt-1 text-xs text-white/70">{period}</p> : null}
              {billingInterval === "YEARLY" && !isTrial ? (
                <p className="mt-2 text-xs font-semibold text-orange-300">
                  {t("home.price.monthlyEquivalent", { price: formatCurrency(plan.yearlyMonthlyEquivalentMinor / 100, plan.currency, locale) })}
                </p>
              ) : null}
              <p className="mt-5 min-h-16 text-sm leading-6 text-white/70">{description}</p>
              <ul className="my-6 flex-1 space-y-4 text-sm text-white/80">
                {summaryGroups.map((group) => (
                  <li key={group.title} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-teal-300" aria-hidden="true" />
                    <div>
                      <h4 className="font-semibold text-white">{group.title}</h4>
                      <span className="mt-1 block text-xs leading-5 text-white/65">{group.description}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <PublicAttributionLink destination="/register" className="block min-h-11 rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-slate-950">
                {t(plan.ctaKey)}
              </PublicAttributionLink>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`public-plan-details-${plan.slug}`}
                onClick={() => setExpandedPlans((current) => ({ ...current, [plan.slug]: !expanded }))}
                className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-orange-300 outline-none hover:text-orange-200 focus-visible:ring-2 focus-visible:ring-orange-400"
              >
                {expanded ? (locale === "tr" ? "Özellikleri gizle" : "Hide features") : (locale === "tr" ? "Tüm özellikleri gör" : "View all features")}
                <ChevronDown className={`size-4 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              {expanded ? (
                <div id={`public-plan-details-${plan.slug}`} className="mt-3 border-t border-white/10 pt-4">
                  <h4 className="sr-only">{locale === "tr" ? "Paket özellikleri" : "Plan features"}</h4>
                  <ul className="space-y-3 text-sm text-white/75">
                    {features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-teal-300" aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
