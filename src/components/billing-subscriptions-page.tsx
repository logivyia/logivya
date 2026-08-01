"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";
import { CreditCard, FileText, LoaderCircle } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { formatCurrency, formatDate } from "@/i18n/format";
import { statusLabel } from "@/i18n/status";

type Data = {
  subscription?: { id: string; status: string; billingPeriod: string; startsAt?: string; endsAt?: string; trialStartsAt?: string; trialEndsAt?: string; currentPeriodEndsAt?: string; remainingDays: number; isTrial: boolean; isActive: boolean; cancelAtPeriodEnd: boolean; plan: { name: string; slug: string; description?: string } };
  entitlements?: { emailVerificationRequired?: boolean; trialEligibilityStatus?: string | null; trialDecisionCode?: string | null };
  plans: Array<{ id: string; name: string; slug: string; description?: string; monthlyPrice: string; yearlyPrice: string; trialDays: number; isPopular: boolean }>;
  payments: Array<{ id: string; status: string; amount: string; currency: string; paidAt?: string; paymentMethod: string }>;
  invoices: Array<{ id: string; status: string; totalAmount: string; currency: string; createdAt: string; pdfUrl?: string }>;
  events: Array<{ id: string; type: string; message: string; createdAt: string }>;
};

const panel = "rounded-2xl border bg-card p-6 shadow-[0_18px_60px_rgba(0,0,0,.06)]";
const button = "rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50";

function periodLabel(value: string | undefined, t: ReturnType<typeof useI18n>["t"]) {
  return value ? t(`billing.period.${value.toLowerCase()}`) : "-";
}

function paymentMethodLabel(value: string, t: ReturnType<typeof useI18n>["t"]) {
  return t(`billing.paymentMethod.${value.toLowerCase()}`);
}

export function BillingSubscriptionsPage() {
  const { locale, t } = useI18n();
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const [subscription, payments, invoices] = await Promise.all([
      fetch("/api/billing/subscription").then((response) => response.json()),
      fetch("/api/billing/payments").then((response) => response.json()),
      fetch("/api/billing/invoices").then((response) => response.json()),
    ]);
    const plans = await fetch("/api/billing/plans").then((response) => response.json());
    setData({ subscription: subscription.subscription, entitlements: subscription.entitlements, plans: plans.plans, payments: payments.payments, invoices: invoices.invoices, events: subscription.subscription?.events || [] });
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function request(planSlug: string, billingPeriod: "MONTHLY" | "YEARLY" = "MONTHLY") {
    const response = await fetch("/api/billing/request-upgrade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planSlug, billingPeriod }),
    });
    const value = await response.json();
    setStatus(value.message || value.error);
    void load();
  }

  async function mutate(action: string) {
    const response = await fetch(`/api/billing/${action}`, { method: "POST" });
    const value = await response.json();
    setStatus(response.ok ? t("billing.actionCompleted") : value.error);
    void load();
  }

  if (!data) return <LoaderCircle className="size-7 animate-spin text-primary" />;
  const sub = data.subscription;
  const subscriptionEnd = sub?.endsAt;

  return (
    <>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{t("billing.eyebrow")}</p>
        <h2 className="mt-2 text-3xl font-semibold">{t("billing.subscriptionsPayments")}</h2>
        <p className="mt-2 text-sm text-muted">{t("billing.subscriptionsDescription")}</p>
      </header>

      {status && <p className="mb-5 rounded-xl border bg-card p-4 text-sm">{status}</p>}

      {data.entitlements?.trialEligibilityStatus === "PENDING_IDENTITY" ? (
        <section className={`${panel} mb-6`}>
          <h3 className="font-semibold">{t("billing.trialReadyTitle")}</h3>
          <p className="mt-2 text-sm text-muted">{t("billing.trialReadyDescription")}</p>
        </section>
      ) : data.entitlements?.trialEligibilityStatus === "INELIGIBLE" ? (
        <section className={`${panel} mb-6`}>
          <h3 className="font-semibold">{t("billing.trialIneligibleTitle")}</h3>
          <p className="mt-2 text-sm text-muted">{t("billing.trialIdentityUsedDescription")}</p>
        </section>
      ) : data.entitlements?.trialEligibilityStatus === "BLOCKED" ? (
        <section className={`${panel} mb-6`}>
          <h3 className="font-semibold">{t("billing.trialReviewTitle")}</h3>
          <p className="mt-2 text-sm text-muted">{t("billing.trialReviewDescription")}</p>
        </section>
      ) : null}

      <section className={panel}>
        <div className="flex flex-wrap justify-between gap-5">
          <div>
            <p className="text-xs text-muted">{t("subscription.activePlanLabel")}</p>
            <h3 className="mt-1 text-2xl font-semibold">{sub?.plan.name || "-"}</h3>
            <p className="mt-2 text-sm text-muted">{sub ? statusLabel(t, "subscription", sub.status) : "-"} · {periodLabel(sub?.billingPeriod, t)}</p>
            <div className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-3">
              <span>{t("subscription.remainingDays")}: {sub?.remainingDays ?? "-"}</span>
              <span>{t("subscription.start")}: {sub?.startsAt ? formatDate(sub.startsAt, locale) : "-"}</span>
              <span>{t("subscription.end")}: {subscriptionEnd ? formatDate(subscriptionEnd, locale) : "-"}</span>
            </div>
          </div>
          {sub ? <button className={button} onClick={() => void mutate(sub.cancelAtPeriodEnd ? "reactivate" : "cancel")}>{sub.cancelAtPeriodEnd ? t("settings.reactivateSubscription") : t("settings.cancelAtPeriodEnd")}</button> : null}
        </div>
      </section>

      <div className="my-6 grid gap-4 lg:grid-cols-4">
        {data.plans.map((plan) => (
          <article key={plan.id} className={`${panel} ${plan.isPopular ? "border-primary" : ""}`}>
            <CreditCard className="size-5 text-primary" />
            {plan.isPopular && <span className="mt-4 inline-block rounded-full bg-primary px-2 py-1 text-[10px] font-bold text-white">{t("billing.mostPopular")}</span>}
            <h3 className="mt-4 font-semibold">{t(`home.plan.${plan.slug}.name`)}</h3>
            <p className="mt-2 text-sm text-muted">{t(`home.plan.${plan.slug}.description`)}</p>
            <p className="mt-4 text-2xl font-bold">{formatCurrency(Number(plan.monthlyPrice), "TRY", locale)} / {t("settings.month")}</p>
            <p className="text-xs text-muted">{Number(plan.yearlyPrice) > 0 ? `${formatCurrency(Number(plan.yearlyPrice), "TRY", locale)} / ${t("settings.year")}` : plan.slug === "trial" ? t("settings.trialDays", { days: plan.trialDays }) : t("settings.custom")}</p>
            {(plan.slug === "starter" || plan.slug === "professional") && <button onClick={() => void request(plan.slug)} className={`${button} mt-5 w-full`}>{t("billing.selectPlan")}</button>}
          </article>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={panel}>
          <h3 className="font-semibold">{t("billing.paymentHistory")}</h3>
          {data.payments.length ? data.payments.map((payment) => (
            <div key={payment.id} className="mt-4 flex justify-between border-t pt-4 text-sm">
              <span>{paymentMethodLabel(payment.paymentMethod, t)} · {statusLabel(t, "payment", payment.status)}</span>
              <b>{formatCurrency(Number(payment.amount), payment.currency, locale)}</b>
            </div>
          )) : <p className="mt-4 text-sm text-muted">{t("billing.noPayments")}</p>}
        </section>

        <section className={panel}>
          <h3 className="font-semibold">{t("billing.invoiceHistory")}</h3>
          {data.invoices.length ? data.invoices.map((invoice) => (
            <div key={invoice.id} className="mt-4 flex justify-between border-t pt-4 text-sm">
              <span><FileText className="me-2 inline size-4" />{statusLabel(t, "invoice", invoice.status)} · {formatDate(invoice.createdAt, locale)}</span>
              <b>{formatCurrency(Number(invoice.totalAmount), invoice.currency, locale)}</b>
            </div>
          )) : <p className="mt-4 text-sm text-muted">{t("billing.noInvoices")}</p>}
        </section>
      </div>
    </>
  );
}
