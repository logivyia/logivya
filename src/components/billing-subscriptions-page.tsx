"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";
import { CreditCard, FileText, LoaderCircle } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { getInvoiceStatusLabel, getPaymentStatusLabel, getSubscriptionStatusLabel } from "@/lib/i18n/status-labels";

type Data = {
  subscription?: { id: string; status: string; billingPeriod: string; startsAt?: string; endsAt?: string; trialStartsAt?: string; trialEndsAt?: string; currentPeriodEndsAt?: string; remainingDays: number; isTrial: boolean; isActive: boolean; cancelAtPeriodEnd: boolean; plan: { name: string; slug: string; description?: string } };
  plans: Array<{ id: string; name: string; slug: string; description?: string; monthlyPrice: string; yearlyPrice: string; trialDays: number; isPopular: boolean }>;
  payments: Array<{ id: string; status: string; amount: string; currency: string; paidAt?: string; paymentMethod: string }>;
  invoices: Array<{ id: string; status: string; totalAmount: string; currency: string; createdAt: string; pdfUrl?: string }>;
  events: Array<{ id: string; type: string; message: string; createdAt: string }>;
};

const panel = "rounded-2xl border bg-card p-6 shadow-[0_18px_60px_rgba(0,0,0,.06)]";
const button = "rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50";

function periodLabel(value: string | undefined, isTr: boolean) {
  const labels: Record<string, string> = isTr
    ? { MONTHLY: "Aylık", YEARLY: "Yıllık", CUSTOM: "Özel", TRIAL: "Deneme" }
    : { MONTHLY: "Monthly", YEARLY: "Yearly", CUSTOM: "Custom", TRIAL: "Trial" };
  return value ? labels[value] ?? (isTr ? "Özel" : "Custom") : "-";
}

function paymentMethodLabel(value: string, isTr: boolean) {
  const labels: Record<string, string> = isTr
    ? { MANUAL_BANK_TRANSFER: "Banka transferi", MANUAL: "Manuel", FREE_PROMO: "Ücretsiz / Promo", OTHER: "Diğer", STRIPE: "Stripe", PAYTR: "PayTR", IYZICO: "Iyzico" }
    : { MANUAL_BANK_TRANSFER: "Bank transfer", MANUAL: "Manual", FREE_PROMO: "Free / Promo", OTHER: "Other", STRIPE: "Stripe", PAYTR: "PayTR", IYZICO: "Iyzico" };
  return labels[value] ?? (isTr ? "Ödeme yöntemi" : "Payment method");
}

function formatDate(value: string | undefined, locale: string) {
  return value ? new Date(value).toLocaleDateString(locale) : "-";
}

export function BillingSubscriptionsPage() {
  const { locale } = useI18n();
  const isTr = locale === "tr";
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState("");
  const dateLocale = isTr ? "tr-TR" : "en-US";

  const load = useCallback(async () => {
    const [subscription, payments, invoices] = await Promise.all([
      fetch("/api/billing/subscription").then((response) => response.json()),
      fetch("/api/billing/payments").then((response) => response.json()),
      fetch("/api/billing/invoices").then((response) => response.json()),
    ]);
    const plans = await fetch("/api/billing/plans").then((response) => response.json());
    setData({ subscription: subscription.subscription, plans: plans.plans, payments: payments.payments, invoices: invoices.invoices, events: subscription.subscription?.events || [] });
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
    setStatus(response.ok ? (isTr ? "İşlem tamamlandı." : "Action completed.") : value.error);
    void load();
  }

  if (!data) return <LoaderCircle className="size-7 animate-spin text-primary" />;
  const sub = data.subscription;
  const subscriptionEnd = sub?.endsAt;

  return (
    <>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{isTr ? "Faturalama" : "Billing"}</p>
        <h2 className="mt-2 text-3xl font-semibold">{isTr ? "Abonelikler ve Ödemeler" : "Subscriptions and Payments"}</h2>
        <p className="mt-2 text-sm text-muted">{isTr ? "Paketinizi, ödeme ve fatura geçmişinizi yönetin." : "Manage your plan, payments, and invoice history."}</p>
      </header>

      {status && <p className="mb-5 rounded-xl border bg-card p-4 text-sm">{status}</p>}

      <section className={panel}>
        <div className="flex flex-wrap justify-between gap-5">
          <div>
            <p className="text-xs text-muted">{isTr ? "Aktif paket" : "Active plan"}</p>
            <h3 className="mt-1 text-2xl font-semibold">{sub?.plan.name || "-"}</h3>
            <p className="mt-2 text-sm text-muted">{sub ? getSubscriptionStatusLabel(sub.status, locale) : "-"} · {periodLabel(sub?.billingPeriod, isTr)}</p>
            <div className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-3">
              <span>{isTr ? "Kalan gün" : "Remaining days"}: {sub?.remainingDays ?? "-"}</span>
              <span>{isTr ? "Başlangıç" : "Start"}: {formatDate(sub?.startsAt, dateLocale)}</span>
              <span>{isTr ? "Bitiş" : "End"}: {formatDate(subscriptionEnd, dateLocale)}</span>
            </div>
          </div>
          <button className={button} onClick={() => void mutate(sub?.cancelAtPeriodEnd ? "reactivate" : "cancel")}>{sub?.cancelAtPeriodEnd ? (isTr ? "Aboneliği yeniden etkinleştir" : "Reactivate subscription") : isTr ? "Dönem sonunda iptal et" : "Cancel at period end"}</button>
        </div>
      </section>

      <div className="my-6 grid gap-4 lg:grid-cols-4">
        {data.plans.map((plan) => (
          <article key={plan.id} className={`${panel} ${plan.isPopular ? "border-primary" : ""}`}>
            <CreditCard className="size-5 text-primary" />
            {plan.isPopular && <span className="mt-4 inline-block rounded-full bg-primary px-2 py-1 text-[10px] font-bold text-white">{isTr ? "EN POPÜLER" : "MOST POPULAR"}</span>}
            <h3 className="mt-4 font-semibold">{plan.name}</h3>
            <p className="mt-2 text-sm text-muted">{plan.description}</p>
            <p className="mt-4 text-2xl font-bold">{`${Number(plan.monthlyPrice)} TL / ${isTr ? "Ay" : "Month"}`}</p>
            <p className="text-xs text-muted">{Number(plan.yearlyPrice) > 0 ? `${Number(plan.yearlyPrice)} TL / ${isTr ? "Yıl" : "Year"}` : plan.slug === "trial" ? `${plan.trialDays} ${isTr ? "Gün" : "Days"}` : isTr ? "Özel" : "Custom"}</p>
            {(plan.slug === "starter" || plan.slug === "professional") && <button onClick={() => void request(plan.slug)} className={`${button} mt-5 w-full`}>{isTr ? "Paketi Seç" : "Select plan"}</button>}
          </article>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={panel}>
          <h3 className="font-semibold">{isTr ? "Ödeme geçmişi" : "Payment history"}</h3>
          {data.payments.length ? data.payments.map((payment) => (
            <div key={payment.id} className="mt-4 flex justify-between border-t pt-4 text-sm">
              <span>{paymentMethodLabel(payment.paymentMethod, isTr)} · {getPaymentStatusLabel(payment.status, locale)}</span>
              <b>{Number(payment.amount)} {payment.currency}</b>
            </div>
          )) : <p className="mt-4 text-sm text-muted">{isTr ? "Henüz ödeme yok." : "No payments yet."}</p>}
        </section>

        <section className={panel}>
          <h3 className="font-semibold">{isTr ? "Fatura geçmişi" : "Invoice history"}</h3>
          {data.invoices.length ? data.invoices.map((invoice) => (
            <div key={invoice.id} className="mt-4 flex justify-between border-t pt-4 text-sm">
              <span><FileText className="me-2 inline size-4" />{getInvoiceStatusLabel(invoice.status, locale)} · {new Date(invoice.createdAt).toLocaleDateString(dateLocale)}</span>
              <b>{Number(invoice.totalAmount)} {invoice.currency}</b>
            </div>
          )) : <p className="mt-4 text-sm text-muted">{isTr ? "Henüz fatura yok." : "No invoices yet."}</p>}
        </section>
      </div>
    </>
  );
}
