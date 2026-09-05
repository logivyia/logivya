"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, CreditCard, FileText, Landmark, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { formatCurrency, formatDate } from "@/i18n/format";
import { statusLabel } from "@/i18n/status";

type Data = {
  subscription?: { id: string; status: string; billingPeriod: string; startsAt?: string; endsAt?: string; trialStartsAt?: string; trialEndsAt?: string; currentPeriodEndsAt?: string; remainingDays: number; isTrial: boolean; isActive: boolean; cancelAtPeriodEnd: boolean; plan: { name: string; slug: string; description?: string } };
  entitlements?: { emailVerificationRequired?: boolean; trialEligibilityStatus?: string | null; trialDecisionCode?: string | null; canManageTeam?: boolean };
  plans: Array<{
    id: string;
    code: "TRIAL" | "STARTER" | "PROFESSIONAL";
    slug: "trial" | "starter" | "professional";
    currency: string;
    monthlyPrice: number;
    yearlyPrice: number;
    yearlyMonthlyEquivalent: number;
    trialDays: number;
    limits: { accounts: number; whatsappConnections: number };
    featureCodes: string[];
    marketingDescription: { tr: string; en: string };
    marketingSummaryGroups: { tr: Array<{ title: string; description: string }>; en: Array<{ title: string; description: string }> };
    seatClarification: { tr: string; en: string };
    marketingFeatures: { tr: string[]; en: string[] };
    billingIntervals: Array<"MONTHLY" | "YEARLY">;
  }>;
  payments: Array<{ id: string; status: string; amount: string; currency: string; paidAt?: string; paymentMethod: string }>;
  invoices: Array<{ id: string; status: string; totalAmount: string; currency: string; createdAt: string; pdfUrl?: string }>;
  events: Array<{ id: string; type: string; message: string; createdAt: string }>;
  requests: ManualSubscriptionRequest[];
  checkout: {
    checkoutAvailable: boolean;
    missingSellerFields: string[];
    bank: BankDetails | null;
    seller: SellerDetails | null;
  };
  membershipAccess?: {
    lifecycleState: string;
    sharedAccess: boolean;
    sharedAccessExpired: boolean;
    subscriptionOwner: { id: string; name: string; email: string } | null;
    plan: {
      name: string;
      startsAt: string | null;
      endsAt: string | null;
      remainingDays: number;
      accountLimit: number;
    } | null;
    capabilities: Record<string, boolean>;
  };
  seatUsage?: { used: number; limit: number };
};

type BankDetails = {
  accountHolder: string;
  bankName: string;
  ibanDisplay: string;
  ibanNormalized: string;
};

type SellerDetails = {
  officialName: string;
  taxOffice: string;
  taxNumber: string;
  email: string;
  phone: string;
  tradeRegistryNumber?: string | null;
  mersisNumber?: string | null;
};

type BillingLegalDocument = {
  type: "PRE_INFORMATION_FORM" | "DISTANCE_SALES_AGREEMENT" | "REFUND_WITHDRAWAL_POLICY";
  title: string;
  version: string;
  hash: string;
  content: string;
  acceptedAt?: string;
};

type ManualSubscriptionRequest = {
  id: string;
  publicId: string;
  status: string;
  paymentProvider: "MANUAL" | "IYZICO";
  paymentMethod: "BANK_TRANSFER" | "IYZICO_CHECKOUT";
  billingPeriod: "MONTHLY" | "YEARLY";
  amount: string;
  currency: string;
  planCode: string;
  planName: string;
  planSnapshot: {
    accountLimit?: number;
    whatsappConnectionLimit?: number;
    features?: { advertisingEnabled?: boolean };
  };
  buyerSnapshot: {
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    taxOffice?: string;
    taxNumber?: string;
  };
  seller: SellerDetails;
  bank: BankDetails;
  paymentReference: string;
  transferDescription: string;
  legalDocuments: BillingLegalDocument[];
  adminCustomerNote?: string | null;
  canCancel: boolean;
  createdAt: string;
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
  const [billingInterval, setBillingInterval] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [draft, setDraft] = useState<ManualSubscriptionRequest | null>(null);
  const [createdRequest, setCreatedRequest] = useState<ManualSubscriptionRequest | null>(null);
  const [acceptedDocuments, setAcceptedDocuments] = useState<Record<string, boolean>>({});
  const [requesting, setRequesting] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutProfileIncomplete, setCheckoutProfileIncomplete] = useState(false);
  const [expandedPlanDetails, setExpandedPlanDetails] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const [subscription, payments, invoices, requestData] = await Promise.all([
      fetch("/api/billing/subscription").then((response) => response.json()),
      fetch("/api/billing/payments").then((response) => response.json()),
      fetch("/api/billing/invoices").then((response) => response.json()),
      fetch("/api/billing/subscription-requests", { cache: "no-store" }).then((response) => response.json()),
    ]);
    const plans = await fetch("/api/billing/plans").then((response) => response.json());
    setData({
      subscription: subscription.subscription,
      entitlements: subscription.entitlements,
      plans: plans.plans,
      payments: payments.payments,
      invoices: invoices.invoices,
      events: subscription.subscription?.events || [],
      requests: requestData.requests || [],
      checkout: requestData.checkout || { checkoutAvailable: false, missingSellerFields: [], bank: null },
      membershipAccess: subscription.membershipAccess,
      seatUsage: subscription.seatUsage,
    });
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("iyzico");
    if (result === "success") setStatus(t("billing.iyzico.paymentSuccess"));
    if (result === "failed") setStatus(t("billing.iyzico.paymentFailed"));
    if (result === "success" || result === "failed") {
      url.searchParams.delete("iyzico");
      url.searchParams.delete("code");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      void load();
    }
  }, [load, t]);

  async function startRequest(planSlug: "starter" | "professional", billingPeriod: "MONTHLY" | "YEARLY") {
    setRequesting(true);
    setStatus("");
    setCheckoutError("");
    setCheckoutProfileIncomplete(false);
    const eligibilityResponse = await fetch(
      "/api/subscription/checkout-eligibility",
      { cache: "no-store" },
    );
    const eligibility = await eligibilityResponse.json();
    if (!eligibilityResponse.ok || !eligibility.eligible) {
      setRequesting(false);
      setStatus(
        subscriptionRequestError(
          eligibility.blockerCode || eligibility.missingFields?.[0]
            || eligibility.error,
          t,
        ),
      );
      return;
    }
    const response = await fetch("/api/billing/subscription-requests", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ planSlug, billingPeriod }),
    });
    const value = await response.json();
    setRequesting(false);
    if (!response.ok) {
      setStatus(subscriptionRequestError(value.error, t));
      return;
    }
    setDraft(value.draft);
    setAcceptedDocuments({});
    setCheckoutError("");
    setCheckoutProfileIncomplete(false);
  }

  async function submitRequest() {
    if (!draft) return;
    const accepted = Boolean(acceptedDocuments.ALL);
    if (!accepted) {
      setStatus(t("billing.manual.purchaseFailed"));
      return;
    }
    setRequesting(true);
    const response = await fetch(`/api/billing/subscription-requests/${draft.id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        acceptedDocuments: draft.legalDocuments.map(({ type, version, hash }) => ({ type, version, hash })),
        immediatePerformanceConsent: true,
      }),
    });
    const value = await response.json();
    setRequesting(false);
    if (!response.ok) {
      setStatus(subscriptionRequestError(value.error, t));
      return;
    }
    setStatus(value.duplicate ? t("billing.manual.duplicatePending") : value.message);
    setCreatedRequest(value.request);
    setDraft(null);
    setAcceptedDocuments({});
    void load();
  }

  async function startIyzicoPayment() {
    if (!draft || !acceptedDocuments.ALL) {
      setCheckoutError(t("billing.manual.purchaseFailed"));
      return;
    }
    setRequesting(true);
    setStatus("");
    setCheckoutError("");
    setCheckoutProfileIncomplete(false);
    const response = await fetch("/api/billing/iyzico/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-logivya-locale": locale,
      },
      body: JSON.stringify({
        requestId: draft.id,
        acceptedDocuments: draft.legalDocuments.map(({ type, version, hash }) => ({ type, version, hash })),
        immediatePerformanceConsent: true,
      }),
    });
    const value = await response.json();
    if (!response.ok) {
      setRequesting(false);
      setCheckoutError(subscriptionRequestError(value.error, t));
      setCheckoutProfileIncomplete(isIyzicoProfileIncompleteError(value.error));
      return;
    }
    try {
      const target = new URL(value.checkoutUrl);
      if (
        target.protocol !== "https:"
        || !(target.hostname === "iyzipay.com" || target.hostname.endsWith(".iyzipay.com"))
      ) throw new Error("invalid checkout URL");
      window.location.assign(target.toString());
    } catch {
      setRequesting(false);
      setCheckoutError(t("billing.iyzico.paymentFailed"));
    }
  }

  async function cancelRequest(id: string) {
    const response = await fetch(`/api/billing/subscription-requests/${id}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const value = await response.json();
    setStatus(response.ok ? t("billing.manual.cancelRequest") : subscriptionRequestError(value.error, t));
    if (response.ok) void load();
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
  const membershipAccess = data.membershipAccess;
  const canManageSharedSubscription = Boolean(
    membershipAccess?.capabilities["tenant.subscription.manage"],
  );
  const canRequestPersonalPlan = Boolean(
    membershipAccess?.capabilities["personal.subscription.request"],
  );
  const canSelectPlan = canManageSharedSubscription || canRequestPersonalPlan;

  return (
    <>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{t("billing.eyebrow")}</p>
        <h2 className="mt-2 text-3xl font-semibold">{t("billing.subscriptionsPayments")}</h2>
        <p className="mt-2 text-sm text-muted">{t("billing.subscriptionsDescription")}</p>
      </header>

      {status && <p className="mb-5 rounded-xl border bg-card p-4 text-sm">{status}</p>}

      {membershipAccess?.sharedAccess || membershipAccess?.sharedAccessExpired ? (
        <section className={`${panel} mb-6`}>
          <h3 className="font-semibold">
            {t(membershipAccess.sharedAccessExpired
              ? "membership.sharedSubscriptionExpired"
              : "membership.sharedSubscription")}
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            {t(membershipAccess.sharedAccessExpired
              ? "membership.sharedSubscriptionExpiredDescription"
              : "membership.sharedSubscriptionReadOnly")}
          </p>
          <div className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-3">
            <span>{t("membership.subscriptionOwner")}: {membershipAccess.subscriptionOwner?.name ?? "-"}</span>
            <span>{t("users.accountUsage")}: {data.seatUsage?.used ?? "-"} / {membershipAccess.plan?.accountLimit ?? "-"}</span>
            <span>{t("users.role")}: {t("users.standardUser")}</span>
          </div>
        </section>
      ) : null}

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
            <h3 className="mt-1 text-2xl font-semibold">
              {sub?.plan.slug ? t(`home.plan.${sub.plan.slug}.name`) : "-"}
            </h3>
            <p className="mt-2 text-sm text-muted">{sub ? statusLabel(t, "subscription", sub.status) : "-"} · {periodLabel(sub?.billingPeriod, t)}</p>
            <div className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-3">
              <span>{t("subscription.remainingDays")}: {sub?.remainingDays ?? "-"}</span>
              <span>{t("subscription.start")}: {sub?.startsAt ? formatDate(sub.startsAt, locale) : "-"}</span>
              <span>{t("subscription.end")}: {subscriptionEnd ? formatDate(subscriptionEnd, locale) : "-"}</span>
            </div>
          </div>
          {sub && canManageSharedSubscription ? <button className={button} onClick={() => void mutate(sub.cancelAtPeriodEnd ? "reactivate" : "cancel")}>{sub.cancelAtPeriodEnd ? t("settings.reactivateSubscription") : t("settings.cancelAtPeriodEnd")}</button> : null}
        </div>
      </section>

      <section className={`${panel} mt-6`}>
        <div className="flex items-start gap-3">
          <Landmark className="mt-0.5 size-5 text-primary" aria-hidden="true" />
          <div>
            <h3 className="font-semibold">{t("billing.manual.myRequests")}</h3>
            <p className="mt-1 text-sm text-muted">{t("billing.manual.requestHistoryDescription")}</p>
          </div>
        </div>
        {data.requests.length ? (
          <div className="mt-5 space-y-4">
            {data.requests.map((request) => (
              <article key={request.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{request.planName} · {periodLabel(request.billingPeriod, t)}</p>
                    <p className="mt-1 text-sm text-muted">{request.publicId} · {formatDate(request.createdAt, locale)}</p>
                  </div>
                  <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">{subscriptionRequestStatusLabel(request.status, t)}</span>
                </div>
                <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                  <span><b>{t("billing.manual.amount")}:</b> {formatCurrency(Number(request.amount), request.currency, locale)}</span>
                  <span><b>{t("billing.manual.paymentReference")}:</b> {request.paymentProvider === "IYZICO" ? t("billing.iyzico.secureProvider") : request.transferDescription}</span>
                  <span><b>{t("billing.manual.paymentPeriod")}:</b> {periodLabel(request.billingPeriod, t)}</span>
                </div>
                {request.adminCustomerNote ? <p className="mt-3 rounded-lg bg-orange-50 p-3 text-sm text-orange-900">{request.adminCustomerNote}</p> : null}
                <details className="mt-4 rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-semibold">{t("billing.manual.viewPaymentDetails")}</summary>
                  {request.paymentProvider === "IYZICO" ? (
                    <p className="mt-3 text-sm leading-6 text-muted">{t("billing.iyzico.pendingDescription")}</p>
                  ) : (
                    <BankDetailsView bank={request.bank} request={request} locale={locale} />
                  )}
                  <ul className="mt-4 space-y-2">
                    {request.legalDocuments.map((document) => (
                      <li key={document.type} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                        <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>{billingLegalDocumentTitle(document.type, t)} · {document.version}</span>
                      </li>
                    ))}
                  </ul>
                </details>
                {request.canCancel ? (
                  <button type="button" onClick={() => void cancelRequest(request.id)} className="mt-4 rounded-lg border px-3 py-2 text-sm font-semibold text-red-600">
                    {t("billing.manual.cancelRequest")}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        ) : <p className="mt-4 text-sm text-muted">{t("billing.manual.noRequests")}</p>}
      </section>

      {canSelectPlan ? <><div className="mx-auto my-6 grid w-full max-w-xs grid-cols-2 rounded-lg border bg-card p-1" role="group" aria-label={t("home.billing.interval")}>
        {(["MONTHLY", "YEARLY"] as const).map((interval) => (
          <button
            key={interval}
            type="button"
            aria-pressed={billingInterval === interval}
            onClick={() => setBillingInterval(interval)}
            className={`min-h-11 rounded-md px-4 text-sm font-semibold ${billingInterval === interval ? "bg-primary text-white" : "text-muted"}`}
          >
            {t(`billing.period.${interval.toLowerCase()}`)}
          </button>
        ))}
      </div>

      <div className="my-6 grid gap-4 lg:grid-cols-3">
        {data.plans.filter((plan) => !canRequestPersonalPlan || plan.slug !== "trial").map((plan) => {
          const priceMinor = plan.slug === "trial" ? 0 : billingInterval === "YEARLY" ? plan.yearlyPrice : plan.monthlyPrice;
          const selected = draft?.planCode === plan.code
            && draft.billingPeriod === billingInterval;
          const summaryGroups = locale === "tr" ? plan.marketingSummaryGroups.tr : plan.marketingSummaryGroups.en;
          const features = locale === "tr" ? plan.marketingFeatures.tr : plan.marketingFeatures.en;
           const description = locale === "tr" ? plan.marketingDescription.tr : plan.marketingDescription.en;
           const expanded = expandedPlanDetails[plan.id] === true;
           const isTrial = plan.slug === "trial";
           const price = isTrial ? t("home.plan.trial.period") : formatCurrency(priceMinor / 100, plan.currency, locale);
           const planTitleId = `billing-plan-title-${plan.id}`;
           return (
           <article key={plan.id} aria-labelledby={planTitleId} className={`${panel} flex flex-col ${expanded ? "lg:col-span-3" : ""}`}>
             <CreditCard className="size-5 text-primary" />
             <h3 id={planTitleId} className="mt-4 font-semibold">{t(`home.plan.${plan.slug}.name`)}</h3>
             {!isTrial ? <>
               <p className="mt-2 text-sm font-semibold text-primary">{plan.limits.accounts} {locale === "tr" ? "kullanıcı" : plan.limits.accounts === 1 ? "user" : "users"}</p>
             </> : null}
             <p className="mt-4 text-2xl font-bold">{price}</p>
             {!isTrial ? <p className="text-xs text-muted">{t(billingInterval === "YEARLY" ? "home.price.perYear" : "home.price.perMonth")}</p> : null}
             {!isTrial && billingInterval === "YEARLY" ? (
               <p className="mt-2 text-xs font-semibold text-primary">{t("home.price.monthlyEquivalent", { price: formatCurrency(plan.yearlyMonthlyEquivalent / 100, plan.currency, locale) })}</p>
             ) : null}
             <p className="mt-4 min-h-12 text-sm text-muted">{description}</p>
             <ul className="mt-5 flex-1 space-y-4 text-sm text-muted">
               {summaryGroups.map((group) => (
                 <li key={group.title} className="flex gap-2">
                   <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                   <h4 className="font-semibold text-foreground">{group.title}</h4>
                 </li>
               ))}
            </ul>
            {(plan.slug === "starter" || plan.slug === "professional") && (
              <button
                disabled={requesting || selected}
                onClick={() => void startRequest(plan.slug as "starter" | "professional", billingInterval)}
                className={`mt-5 w-full ${button}`}
              >
                {selected ? t("billing.manual.selected") : t("billing.manual.requestPurchase")}
              </button>
            )}
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={`billing-plan-details-${plan.id}`}
              onClick={() => setExpandedPlanDetails((current) => ({ ...current, [plan.id]: !expanded }))}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-primary outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary"
            >
              {expanded ? (locale === "tr" ? "Özellikleri gizle" : "Hide features") : (locale === "tr" ? "Tüm özellikleri gör" : "View all features")}
              <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {expanded ? (
              <ul id={`billing-plan-details-${plan.id}`} className="mt-3 space-y-3 border-t pt-4 text-sm text-muted">
                {features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
          );
        })}
      </div></> : null}

      {canManageSharedSubscription ? <div className="grid gap-6 xl:grid-cols-2">
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
      </div> : null}

      {draft ? (
        <SubscriptionRequestModal
          draft={draft}
          locale={locale}
          acceptedDocuments={acceptedDocuments}
          requesting={requesting}
          checkoutError={checkoutError}
          checkoutProfileIncomplete={checkoutProfileIncomplete}
          onToggle={(type) => {
            setAcceptedDocuments((current) => ({ ...current, [type]: !current[type] }));
            setCheckoutError("");
            setCheckoutProfileIncomplete(false);
          }}
          onClose={() => {
            setDraft(null);
            setAcceptedDocuments({});
            setCheckoutError("");
            setCheckoutProfileIncomplete(false);
          }}
          onSubmitBank={() => void submitRequest()}
          onPayWithIyzico={() => void startIyzicoPayment()}
        />
      ) : null}
      {createdRequest ? (
        <SubscriptionRequestSuccessModal
          request={createdRequest}
          locale={locale}
          onClose={() => setCreatedRequest(null)}
        />
      ) : null}
    </>
  );
}

function SubscriptionRequestModal({
  draft,
  locale,
  acceptedDocuments,
  requesting,
  checkoutError,
  checkoutProfileIncomplete,
  onToggle,
  onClose,
  onSubmitBank,
  onPayWithIyzico,
}: {
  draft: ManualSubscriptionRequest;
  locale: string;
  acceptedDocuments: Record<string, boolean>;
  requesting: boolean;
  checkoutError: string;
  checkoutProfileIncomplete: boolean;
  onToggle: (type: string) => void;
  onClose: () => void;
  onSubmitBank: () => void;
  onPayWithIyzico: () => void;
}) {
  const { t } = useI18n();
  const allAccepted = Boolean(acceptedDocuments.ALL);
  const [selectedDocument, setSelectedDocument] = useState<BillingLegalDocument | null>(null);
  const legalLinkRef = useRef<HTMLButtonElement | null>(null);
  const { dialogRef, handleDialogKeyDown } = useModalDialog(onClose, true);

  function openLegalDocument(
    document: BillingLegalDocument,
    trigger: HTMLButtonElement,
  ) {
    legalLinkRef.current = trigger;
    setSelectedDocument(document);
  }

  function closeLegalDocument() {
    setSelectedDocument(null);
    window.setTimeout(() => legalLinkRef.current?.focus(), 0);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-request-title"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="mx-auto my-6 flex max-h-[calc(100dvh-3rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-card shadow-2xl"
      >
        <div className="shrink-0 border-b p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">LOGIVYA</p>
            <h2 id="subscription-request-title" className="mt-2 text-2xl font-semibold">{t("billing.manual.consentTitle")}</h2>
            <p className="mt-2 text-sm text-muted">{t("billing.manual.consentDescription")}</p>
          </div>
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-lg border" aria-label={t("billing.manual.close")}><X className="size-4" /></button>
        </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <SummaryBlock title={t("billing.manual.orderSummary")}>
            <p><b>{t("billing.manual.serviceProvider")}:</b> {draft.seller.officialName}</p>
            <p><b>{t("billing.manual.plan")}:</b> {draft.planName}</p>
            <p><b>{t("billing.manual.paymentPeriod")}:</b> {periodLabel(draft.billingPeriod, t)}</p>
            <p><b>{t("billing.manual.amount")}:</b> {formatCurrency(Number(draft.amount), draft.currency, locale)}</p>
            <p><b>{t("billing.manual.account")}:</b> {draft.planSnapshot.accountLimit ?? t("billing.manual.unspecified")}</p>
            <p><b>{t("billing.manual.brandingSignature")}:</b> {t(draft.planSnapshot.features?.advertisingEnabled ? "billing.manual.brandingVisible" : "billing.manual.brandingHidden")}</p>
            <p><b>{t("billing.manual.requestDate")}:</b> {formatDate(draft.createdAt, locale)}</p>
          </SummaryBlock>
          <SummaryBlock title={t("billing.manual.purchaserInfo")}>
            <p><b>{t("billing.manual.nameTitle")}:</b> {draft.buyerSnapshot.name || t("billing.manual.unspecified")}</p>
            <p><b>{t("billing.manual.email")}:</b> {draft.buyerSnapshot.email || t("billing.manual.unspecified")}</p>
            <p><b>{t("billing.manual.phone")}:</b> {draft.buyerSnapshot.phone || t("billing.manual.unspecified")}</p>
            <p><b>{t("billing.manual.address")}:</b> {draft.buyerSnapshot.address || t("billing.manual.unspecified")}</p>
          </SummaryBlock>
        </div>

        <section className="mt-5 space-y-3 rounded-lg border p-4">
          <h3 className="font-semibold">{t("billing.manual.legalDocuments")}</h3>
          <div className="flex min-h-12 items-start gap-3 rounded-lg border p-4 text-sm">
            <input
              id="billing-legal-consent"
              type="checkbox"
              checked={allAccepted}
              onChange={() => onToggle("ALL")}
              aria-labelledby="billing-legal-consent-label"
              className="mt-0.5 size-5 accent-orange-500"
            />
            <LegalConsentSentence
              id="billing-legal-consent-label"
              documents={draft.legalDocuments}
              onOpen={openLegalDocument}
            />
          </div>
        </section>
        <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs leading-5 text-orange-950">
          {t("billing.iyzico.oneTimeNotice")}
        </p>
        {checkoutError ? (
          <div role="alert" aria-live="assertive" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm leading-6 text-red-950">
            <p>{checkoutError}</p>
            {checkoutProfileIncomplete ? (
              <Link
                href="/settings/payment"
                className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-red-700 px-4 py-2 font-semibold text-white"
              >
                {t("billing.iyzico.completePaymentProfile")}
              </Link>
            ) : null}
          </div>
        ) : null}
        </div>
        <div className="grid shrink-0 gap-3 border-t p-5 sm:grid-cols-[auto_1fr_1fr] sm:p-7">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-3 text-sm font-semibold">{t("billing.manual.cancel")}</button>
          <button type="button" disabled={!allAccepted || requesting} onClick={onSubmitBank} className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-50">
            <Landmark className="size-4" aria-hidden="true" />
            {requesting ? t("billing.manual.submitting") : t("billing.manual.payByBankTransfer")}
          </button>
          <button type="button" disabled={!allAccepted || requesting} onClick={onPayWithIyzico} className={`${button} inline-flex items-center justify-center gap-2`}>
            <CreditCard className="size-4" aria-hidden="true" />
            {requesting ? t("billing.iyzico.redirecting") : t("billing.iyzico.payWithCard")}
          </button>
        </div>
      </div>
      {selectedDocument ? (
        <BillingLegalDocumentModal
          document={selectedDocument}
          onClose={closeLegalDocument}
        />
      ) : null}
    </div>
  );
}

function LegalConsentSentence({
  id,
  documents,
  onOpen,
}: {
  id: string;
  documents: BillingLegalDocument[];
  onOpen: (document: BillingLegalDocument, trigger: HTMLButtonElement) => void;
}) {
  const { t } = useI18n();
  const documentsByLabel = new Map(
    documents.map((document) => [
      billingLegalDocumentTitle(document.type, t),
      document,
    ]),
  );
  const labels = [...documentsByLabel.keys()].sort(
    (left, right) => right.length - left.length,
  );
  const parts = labels.length
    ? t("billing.manual.consentText").split(
        new RegExp(`(${labels.map(escapeRegExp).join("|")})`, "g"),
      )
    : [t("billing.manual.consentText")];

  return (
    <span id={id} className="min-w-0 flex-1 leading-6">
      {parts.map((part, index) => {
        const document = documentsByLabel.get(part);
        return document ? (
          <button
            key={`${document.type}-${index}`}
            type="button"
            className="font-semibold text-primary underline decoration-primary/40 underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onClick={(event) => onOpen(document, event.currentTarget)}
          >
            {part}
          </button>
        ) : (
          <label key={`${part}-${index}`} htmlFor="billing-legal-consent">
            {part}
          </label>
        );
      })}
    </span>
  );
}

function BillingLegalDocumentModal({
  document,
  onClose,
}: {
  document: BillingLegalDocument;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { dialogRef, handleDialogKeyDown } = useModalDialog(onClose, false);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/70 p-3 sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="billing-legal-document-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          event.stopPropagation();
          handleDialogKeyDown(event);
        }}
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-card shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b p-4 sm:p-6">
          <div>
            <h2 id="billing-legal-document-title" className="text-xl font-semibold">
              {billingLegalDocumentTitle(document.type, t)}
            </h2>
            <p className="mt-1 text-xs text-muted">{document.version}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-lg border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label={t("billing.manual.close")}
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <p className="whitespace-pre-wrap text-sm leading-7 text-muted">
            {document.content}
          </p>
        </div>
      </div>
    </div>
  );
}

function SubscriptionRequestSuccessModal({
  request,
  locale,
  onClose,
}: {
  request: ManualSubscriptionRequest;
  locale: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="subscription-success-title" className="mx-auto my-6 w-full max-w-2xl rounded-lg bg-card p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">LOGIVYA</p>
            <h2 id="subscription-success-title" className="mt-2 text-2xl font-semibold">{t("billing.manual.requestCreatedTitle")}</h2>
            <p className="mt-2 text-sm text-muted">{t("billing.manual.requestCreatedDescription")}</p>
          </div>
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-lg border" aria-label={t("billing.manual.close")}><X className="size-4" /></button>
        </div>
        <div className="mt-6 grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
          <span><b>{t("billing.manual.plan")}:</b> {request.planName}</span>
          <span><b>{t("billing.manual.paymentPeriod")}:</b> {periodLabel(request.billingPeriod, t)}</span>
          <span><b>{t("billing.manual.amount")}:</b> {formatCurrency(Number(request.amount), request.currency, locale)}</span>
          <span><b>{t("billing.manual.status")}:</b> {t("billing.manual.pendingPayment")}</span>
          <span><b>{t("billing.manual.requestDate")}:</b> {formatDate(request.createdAt, locale)}</span>
          <span><b>{t("billing.manual.paymentReference")}:</b> {request.transferDescription}</span>
        </div>
        <h3 className="mt-6 font-semibold">{t("billing.manual.transferDetails")}</h3>
        <BankDetailsView bank={request.bank} request={request} locale={locale} />
        <p className="mt-4 text-sm font-medium text-primary">{t("billing.manual.transferInstruction")}</p>
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} className={button}>{t("billing.manual.close")}</button>
        </div>
      </div>
    </div>
  );
}

function SummaryBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border p-4"><h3 className="font-semibold">{title}</h3><div className="mt-3 space-y-2 text-sm text-muted">{children}</div></section>;
}

function BankDetailsView({ bank, request, locale }: { bank: BankDetails; request: Pick<ManualSubscriptionRequest, "transferDescription" | "amount" | "currency">; locale: string }) {
  const { t } = useI18n();
  const rows = [
    [t("billing.manual.bankName"), bank.bankName, bank.bankName],
    [t("billing.manual.accountHolder"), bank.accountHolder, bank.accountHolder],
    ["IBAN", bank.ibanDisplay, bank.ibanNormalized],
    [t("billing.manual.paymentReference"), request.transferDescription, request.transferDescription],
    [t("billing.manual.amount"), formatCurrency(Number(request.amount), request.currency, locale), String(request.amount)],
  ] as const;
  return <div className="mt-4 divide-y rounded-lg border">{rows.map(([label, value, copyValue]) => (
    <div key={label} className="flex items-center justify-between gap-3 p-3 text-sm">
      <span className="min-w-0"><b>{label}:</b> <span className="break-all">{value}</span></span>
      <button type="button" onClick={() => void navigator.clipboard.writeText(copyValue)} className="grid size-9 shrink-0 place-items-center rounded-lg border" title={`${t("billing.manual.copy")}: ${label}`}><Copy className="size-4" /></button>
    </div>
  ))}</div>;
}

function billingLegalDocumentTitle(
  type: BillingLegalDocument["type"],
  t: ReturnType<typeof useI18n>["t"],
) {
  const key = {
    PRE_INFORMATION_FORM: "billing.manual.preInformationForm",
    DISTANCE_SALES_AGREEMENT: "billing.manual.distanceSalesAgreement",
    REFUND_WITHDRAWAL_POLICY: "billing.manual.refundPolicy",
  } as const;
  return t(key[type]);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function useModalDialog(onClose: () => void, lockBodyScroll: boolean) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    if (lockBodyScroll) {
      document.body.style.overflow = "hidden";
    }
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      if (lockBodyScroll) {
        document.body.style.overflow = previousOverflow;
      }
      previousFocus?.focus();
    };
  }, [lockBodyScroll]);

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCloseRef.current();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute("hidden"));
    if (!focusable.length) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return { dialogRef, handleDialogKeyDown };
}

function subscriptionRequestStatusLabel(status: string, t: ReturnType<typeof useI18n>["t"]) {
  return ({
    PENDING_PAYMENT: t("billing.manual.pendingPayment"),
    PAYMENT_REVIEW: t("billing.manual.paymentReview"),
    DRAFT: "Taslak",
    AWAITING_PAYMENT: "Ödeme Bekliyor",
    UNDER_REVIEW: "İnceleniyor",
    APPROVED: t("billing.manual.approved"),
    ACTIVATED: "Etkinleştirildi",
    CLARIFICATION_REQUIRED: "Ek Bilgi Gerekiyor",
    REJECTED: t("billing.manual.rejected"),
    CANCELLED: "İptal Edildi",
    EXPIRED: "Süresi Doldu",
  } as Record<string, string>)[status] || status;
}

function subscriptionRequestError(error: string | undefined, t: ReturnType<typeof useI18n>["t"]) {
  const key = ({
    PROFILE_FIRST_NAME_MISSING: "billing.manual.profileFirstNameMissing",
    PROFILE_LAST_NAME_MISSING: "billing.manual.profileLastNameMissing",
    PROFILE_EMAIL_MISSING: "billing.manual.profileEmailMissing",
    ACTIVE_SUBSCRIPTION_REQUEST_EXISTS: "billing.manual.duplicatePending",
    ACTIVE_SHARED_MEMBERSHIP_EXISTS: "billing.manual.activeSharedMembership",
    LEGAL_CONSENT_REQUIRED: "billing.manual.consentRequired",
    IMMEDIATE_PERFORMANCE_CONSENT_REQUIRED: "billing.manual.consentRequired",
    IYZICO_BILLING_PROFILE_INCOMPLETE: "billing.iyzico.profileIncomplete",
    BILLING_PROFILE_INCOMPLETE: "billing.iyzico.profileIncomplete",
    PROFILE_INCOMPLETE: "billing.iyzico.profileIncomplete",
    "Profile Incomplete": "billing.iyzico.profileIncomplete",
    IYZICO_NOT_CONFIGURED: "billing.iyzico.notConfigured",
    IYZICO_CHECKOUT_INITIALIZE_FAILED: "billing.iyzico.paymentFailed",
    IYZICO_REQUEST_FAILED: "billing.iyzico.paymentFailed",
  } as Record<string, string>)[error || ""];
  return t(key || "billing.manual.purchaseFailed");
}

function isIyzicoProfileIncompleteError(error: string | undefined) {
  return [
    "IYZICO_BILLING_PROFILE_INCOMPLETE",
    "BILLING_PROFILE_INCOMPLETE",
    "PROFILE_INCOMPLETE",
    "Profile Incomplete",
  ].includes(error || "");
}
