"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { BellRing, CalendarClock, CheckCircle2, Landmark, LoaderCircle, Search, ShieldAlert, WalletCards, X } from "lucide-react";
import { formatDate, formatNumber } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";

type Subscription = { id: string; status: string; startsAt?: string; endsAt?: string; trialStartsAt?: string; trialEndsAt?: string; currentPeriodEndsAt?: string; remainingDays?: number; trialDurationDays?: number; isActive?: boolean; plan: { name: string; slug: string; trialDays: number } };
type Company = {
  id: string;
  name: string;
  phone?: string;
  owner: { name: string; email: string; phone?: string };
  billingProfile?: { legalName?: string; billingEmail?: string };
  subscriptions: Subscription[];
  trialState?: { status: string; decisionCode?: string; startedAt?: string; endsAt?: string } | null;
  seatUsage?: {
    limit: number;
    used: number;
    activeMembers: number;
    suspendedMembers: number;
    pendingInvitations: number;
    available: number;
    capacitySource: string;
    integrityStatus: "OK" | "CONFIGURATION_REQUIRED" | "RECONCILIATION_REQUIRED";
    configurationRequired: boolean;
    reconciliationRequired: boolean;
    ownerRelationshipValid: boolean;
  };
};
type ActionName = "ACTIVATE" | "EXTEND" | "SUSPEND" | "CANCEL" | "CHANGE_PLAN";
type PendingAction = {
  company: Company;
  subscription?: Subscription;
  action: ActionName;
  defaultStartsAt?: string;
  defaultEndsAt?: string;
};
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-100 disabled:bg-slate-100 disabled:text-slate-600";
const button = "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-orange-50 disabled:bg-slate-100 disabled:text-slate-500";

type AdminApiResult = {
  error?: string;
  requestId?: string;
  details?: { usedSeats?: number; targetSeatLimit?: number };
};

async function readAdminApiResult<T extends AdminApiResult = AdminApiResult>(response: Response): Promise<T> {
  try {
    const value = await response.json();
    return (value && typeof value === "object" ? value : {}) as T;
  } catch {
    return (response.ok ? {} : { error: "ADMIN_REQUEST_FAILED" }) as T;
  }
}

async function reauthenticateAdmin(password: string) {
  const response = await fetch("/api/admin/security/re-auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return { response, result: await readAdminApiResult(response) };
}

export function AdminSubscriptionsPage() {
  const { t } = useI18n();
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean }>();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>();

  const notify = useCallback((message: string, error = false) => {
    setToast({ message, error });
    window.setTimeout(() => setToast(undefined), 4500);
  }, []);
  const load = useCallback(async (search = "") => {
    const response = await fetch(`/api/admin/companies${search ? `?q=${encodeURIComponent(search)}` : ""}`);
    const value = await response.json();
    if (!response.ok) throw new Error("LOAD_FAILED");
    setCompanies(value.companies);
  }, []);
  useEffect(() => { void load().catch(() => notify(t("adminSubscriptions.companiesLoadFailed"), true)); }, [load, notify, t]);

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setLoading(true);
    try {
      const reauth = await reauthenticateAdmin(String(values.adminPassword ?? ""));
      if (!reauth.response.ok) {
        notify(subscriptionActionError(reauth.result, t), true);
        return;
      }
      delete values.adminPassword;
      const response = await fetch("/api/admin/subscriptions/manual-activate", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify(values),
      });
      const result = await readAdminApiResult(response);
      notify(response.ok ? t("adminSubscriptions.manualActivationCreated") : subscriptionActionError(result, t), !response.ok);
      if (response.ok) {
        form.reset();
        void load(query).catch(() => notify(t("adminSubscriptions.companiesLoadFailed"), true));
      }
    } catch {
      notify(t("adminSubscriptions.genericError"), true);
    } finally {
      setLoading(false);
    }
  }
  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingAction) return;
    setLoading(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const reauth = await reauthenticateAdmin(String(values.adminPassword ?? ""));
      if (!reauth.response.ok) {
        notify(subscriptionActionError(reauth.result, t), true);
        return;
      }
      delete values.adminPassword;
      const activationWithoutSubscription = pendingAction.action === "ACTIVATE" && !pendingAction.subscription;
      const payload = activationWithoutSubscription ? {
        companyId: pendingAction.company.id,
        planSlug: values.planSlug,
        billingPeriod: values.billingPeriod,
        startsAt: values.startsAt,
        endsAt: values.endsAt,
        currency: "TRY",
        paymentMethod: "MANUAL",
        note: values.reason,
        createPayment: false,
      } : { action: pendingAction.action, ...values };
      const response = await fetch(
        activationWithoutSubscription
          ? "/api/admin/subscriptions/manual-activate"
          : `/api/admin/subscriptions/${pendingAction.subscription!.id}/action`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(activationWithoutSubscription ? { "idempotency-key": crypto.randomUUID() } : {}),
        },
        body: JSON.stringify(payload),
      });
      const result = await readAdminApiResult(response);
      notify(response.ok ? t("adminSubscriptions.actionCompleted") : subscriptionActionError(result, t), !response.ok);
      if (response.ok) {
        setPendingAction(undefined);
        void load(query).catch(() => notify(t("adminSubscriptions.companiesLoadFailed"), true));
      }
    } catch {
      notify(t("adminSubscriptions.genericError"), true);
    } finally {
      setLoading(false);
    }
  }

  return <>
    <header className="mb-7"><p className="text-xs font-semibold uppercase tracking-[.2em] text-orange-600">{t("adminSubscriptions.eyebrow")}</p><h1 className="mt-2 text-3xl font-semibold">{t("adminSubscriptions.title")}</h1><p className="mt-2 text-sm text-slate-500">{t("adminSubscriptions.description")}</p></header>
    <div className="mb-6 grid gap-4 md:grid-cols-4"><Metric label={t("adminSubscriptions.shownCompanies")} value={companies?.length ?? 0} icon={WalletCards}/><Metric label={t("adminSubscriptions.activeSubscriptions")} value={companies?.filter((company) => company.subscriptions[0]?.status === "ACTIVE").length ?? 0} icon={CheckCircle2}/><Metric label={t("adminSubscriptions.trialAccounts")} value={companies?.filter((company) => company.subscriptions[0]?.status === "TRIALING").length ?? 0} icon={CalendarClock}/><Metric label={t("adminSubscriptions.incompleteBillingProfiles")} value={companies?.filter((company) => !company.billingProfile?.billingEmail).length ?? 0} icon={ShieldAlert}/></div>
    <SellerConfigurationPanel notify={notify} />
    <AdminSubscriptionRequestsPanel notify={notify} />
    <form onSubmit={activate} className="mb-6 grid gap-4 rounded-2xl border bg-white p-6 md:grid-cols-3">
      <Field label={t("common.company")}><select required name="companyId" className={field}><option value="">{t("adminSubscriptions.selectCompany")}</option>{companies?.map((company) => <option key={company.id} value={company.id}>{company.name} · {company.owner.email}</option>)}</select></Field>
      <Field label={t("adminSubscriptions.plan")}><select name="planSlug" className={field}><option value="starter">{t("home.plan.starter.name")}</option><option value="professional">{t("home.plan.professional.name")}</option></select></Field>
      <Field label={t("adminSubscriptions.billingPeriod")}><select name="billingPeriod" className={field}><option value="MONTHLY">{t("adminSubscriptions.monthly")}</option><option value="YEARLY">{t("adminSubscriptions.yearly")}</option></select></Field>
      <Field label={t("adminSubscriptions.startDate")}><input required name="startsAt" type="datetime-local" className={field}/></Field>
      <Field label={t("adminSubscriptions.endDate")}><input required name="endsAt" type="datetime-local" className={field}/></Field>
      <Field label={t("adminSubscriptions.paymentMethod")}><select name="paymentMethod" className={field}><option value="MANUAL_BANK_TRANSFER">{t("adminSubscriptions.bankTransfer")}</option><option value="MANUAL">{t("adminSubscriptions.manual")}</option><option value="FREE_PROMO">{t("adminSubscriptions.freePromo")}</option><option value="OTHER">{t("support.type.other")}</option></select></Field>
      <Field label={t("adminSubscriptions.currency")}><input name="currency" value="TRY" readOnly className={field}/></Field>
      <Field label={t("adminSubscriptions.actionReason")}><input required name="note" minLength={5} maxLength={500} placeholder={t("adminSubscriptions.assignmentReasonPlaceholder")} className={field}/></Field>
      <Field label={t("auth.password")}><input required type="password" name="adminPassword" autoComplete="current-password" className={field}/></Field>
      <button disabled={loading} className="rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white hover:bg-orange-600 disabled:bg-orange-300 disabled:text-white md:col-span-3">{loading ? <LoaderCircle className="mx-auto size-5 animate-spin"/> : t("adminSubscriptions.manualActivate")}</button>
    </form>
    <section className="rounded-2xl border bg-white p-5">
      <form onSubmit={(event) => { event.preventDefault(); void load(query); }} className="mb-5 flex flex-col gap-2 sm:flex-row"><label className="flex flex-1 items-center gap-2 rounded-xl border bg-white px-3"><Search className="size-4"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("adminSubscriptions.searchPlaceholder")} className="w-full bg-transparent py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"/></label><button className={button}>{t("adminSubscriptions.search")}</button></form>
      {!companies
        ? <LoaderCircle className="animate-spin"/>
        : <CompaniesSubscriptionList companies={companies} onAction={(pending) => {
          const startsAt = new Date();
          const endsAt = new Date(startsAt.getTime() + 30 * 86_400_000);
          setPendingAction({
            ...pending,
            defaultStartsAt: toLocalDateTimeInput(startsAt),
            defaultEndsAt: toLocalDateTimeInput(endsAt),
          });
        }} />}
    </section>
    {pendingAction && <ActionModal pending={pendingAction} loading={loading} onClose={() => setPendingAction(undefined)} onSubmit={submitAction}/>}
    {toast && <div role="status" className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border p-4 text-sm font-medium shadow-2xl ${toast.error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{toast.message}</div>}
  </>;
}

function CompaniesSubscriptionList({
  companies,
  onAction,
}: {
  companies: Company[];
  onAction: (pending: PendingAction) => void;
}) {
  const { locale, t } = useI18n();

  return <>
    <div className="divide-y xl:hidden">
      {companies.map((company) => {
        const subscription = company.subscriptions[0];
        return <article key={company.id} className="py-5 first:pt-0 last:pb-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div><h3 className="font-semibold text-slate-950">{company.name}</h3><p className="text-xs text-slate-500">{company.owner.name} · {company.owner.email}</p></div>
            <SeatState company={company} />
          </div>
          <dl className="mt-4 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
            <DataPoint label={t("company.phone")} value={company.phone || company.owner.phone || "-"} />
            <DataPoint label={t("adminSubscriptions.billingProfile")} value={company.billingProfile?.billingEmail ? t("billing.complete") : t("adminSubscriptions.incomplete")} />
            <DataPoint label={t("adminSubscriptions.plan")} value={subscription?.plan.name || t("adminSubscriptions.noActivePackage")} />
            <DataPoint label={t("common.status")} value={subscriptionStatus(company, t)} />
            <DataPoint label={t("adminSubscriptions.start")} value={localizedDate(subscription?.trialStartsAt || subscription?.startsAt, locale)} />
            <DataPoint label={t("adminSubscriptions.end")} value={localizedDate(subscription?.trialEndsAt || subscription?.endsAt || subscription?.currentPeriodEndsAt, locale)} />
          </dl>
          <CompanyActionButtons company={company} onAction={onAction} className="mt-4" />
        </article>;
      })}
    </div>
    <div className="hidden overflow-x-auto xl:block">
      <table className="w-full min-w-[1280px] table-fixed text-sm">
        <colgroup><col className="w-[23%]"/><col className="w-[10%]"/><col className="w-[11%]"/><col className="w-[9%]"/><col className="w-[9%]"/><col className="w-[8%]"/><col className="w-[8%]"/><col className="w-[8%]"/><col className="w-[14%]"/></colgroup>
        <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-3 pr-4">{t("common.company")}</th><th className="pr-4">{t("company.phone")}</th><th className="pr-4">{t("adminSubscriptions.billingProfile")}</th><th className="pr-4">{t("adminSubscriptions.plan")}</th><th className="pr-4">{t("adminSubscriptions.seats")}</th><th className="pr-4">{t("common.status")}</th><th className="pr-4">{t("adminSubscriptions.start")}</th><th className="pr-4">{t("adminSubscriptions.end")}</th><th>{t("common.actions")}</th></tr></thead>
        <tbody>{companies.map((company) => {
          const subscription = company.subscriptions[0];
          return <tr key={company.id} className="border-b align-top last:border-0">
            <td className="py-4 pr-4"><b className="break-words">{company.name}</b><p className="mt-1 break-all text-xs text-slate-500">{company.owner.name} · {company.owner.email}</p></td>
            <td className="py-4 pr-4 break-words">{company.phone || company.owner.phone || "-"}</td>
            <td className="py-4 pr-4">{company.billingProfile?.billingEmail ? t("billing.complete") : t("adminSubscriptions.incomplete")}</td>
            <td className="py-4 pr-4">{subscription?.plan.name || t("adminSubscriptions.noActivePackage")}</td>
            <td className="py-4 pr-4"><SeatState company={company} /></td>
            <td className="py-4 pr-4">{subscriptionStatus(company, t)}</td>
            <td className="py-4 pr-4">{localizedDate(subscription?.trialStartsAt || subscription?.startsAt, locale)}</td>
            <td className="py-4 pr-4">{localizedDate(subscription?.trialEndsAt || subscription?.endsAt || subscription?.currentPeriodEndsAt, locale)}</td>
            <td className="py-4"><CompanyActionButtons company={company} onAction={onAction} /></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </>;
}

function CompanyActionButtons({ company, onAction, className = "" }: { company: Company; onAction: (pending: PendingAction) => void; className?: string }) {
  const { t } = useI18n();
  const subscription = company.subscriptions[0];
  const actions = availableSubscriptionActions(subscription);
  return <div className={`flex flex-wrap gap-2 ${className}`}>
    {actions.map((action) => <button type="button" key={action} onClick={() => onAction({ company, subscription, action })} className={button}>{actionLabel(action, t)}</button>)}
    <Link href={`/admin/companies/${company.id}`} className={button}>{t("adminSubscriptions.viewDetails")}</Link>
  </div>;
}

function availableSubscriptionActions(subscription?: Subscription): ActionName[] {
  if (!subscription) return ["ACTIVATE"];
  const status = subscription.status.toUpperCase();
  if (["ACTIVE", "TRIALING"].includes(status)) return ["EXTEND", "SUSPEND", "CANCEL", "CHANGE_PLAN"];
  if (status === "SUSPENDED") return ["ACTIVATE", "EXTEND", "CANCEL", "CHANGE_PLAN"];
  if (["CANCELED", "EXPIRED"].includes(status)) return ["ACTIVATE", "CHANGE_PLAN"];
  return ["ACTIVATE", "CANCEL", "CHANGE_PLAN"];
}

function SeatState({ company }: { company: Company }) {
  const { locale, t } = useI18n();
  const usage = company.seatUsage;
  if (!usage) return <span>-</span>;
  return <div>
    <b>{formatNumber(usage.used, locale)} / {formatNumber(usage.limit, locale)}</b>
    {usage.reconciliationRequired ? <p className="mt-1 text-xs font-semibold text-red-600">{t("adminSubscriptions.reconciliationRequired")}</p> : null}
    {!usage.reconciliationRequired && usage.configurationRequired ? <p className="mt-1 text-xs font-semibold text-amber-700">{t("adminSubscriptions.configurationRequired")}</p> : null}
  </div>;
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 break-words font-medium text-slate-900">{value}</dd></div>;
}

function subscriptionStatus(company: Company, t: ReturnType<typeof useI18n>["t"]) {
  const subscription = company.subscriptions[0];
  if (subscription?.isActive) return t("status.active");
  if (subscription?.status) return t(`status.${subscription.status.toLowerCase()}`);
  return company.trialState ? t("status.pending") : t("adminSubscriptions.configurationRequired");
}

type SellerConfiguration = {
  officialName?: string | null;
  registeredAddress?: string | null;
  taxOffice?: string | null;
  taxNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  tradeRegistryNumber?: string | null;
  tradeRegistryNotApplicable: boolean;
  mersisNumber?: string | null;
  mersisNotApplicable: boolean;
  verifiedAt?: string | null;
  legalDocumentsApprovedAt?: string | null;
};

function SellerConfigurationPanel({ notify }: { notify: (message: string, error?: boolean) => void }) {
  const { t } = useI18n();
  const [configuration, setConfiguration] = useState<SellerConfiguration | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/billing/seller-configuration", { cache: "no-store" });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "LOAD_FAILED");
    setConfiguration(value.configuration || {
      tradeRegistryNotApplicable: false,
      mersisNotApplicable: false,
    });
    setMissing(value.state?.missingFields || []);
  }, []);

  useEffect(() => {
    void load().catch(() => notify(t("adminSubscriptions.manual.configurationSaveFailed"), true));
  }, [load, notify, t]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const reauth = await reauthenticateAdmin(String(values.adminPassword ?? ""));
    if (!reauth.response.ok) {
      setSaving(false);
      notify(subscriptionActionError(reauth.result, t), true);
      return;
    }
    const response = await fetch("/api/admin/billing/seller-configuration", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        officialName: values.officialName || null,
        registeredAddress: values.registeredAddress || null,
        taxOffice: values.taxOffice || null,
        taxNumber: values.taxNumber || null,
        email: values.email || null,
        phone: values.phone || null,
        tradeRegistryNumber: values.tradeRegistryNumber || null,
        tradeRegistryNotApplicable: values.tradeRegistryNotApplicable === "on",
        mersisNumber: values.mersisNumber || null,
        mersisNotApplicable: values.mersisNotApplicable === "on",
        confirmVerifiedIdentity: values.confirmVerifiedIdentity === "on",
        confirmLegalApproval: values.confirmLegalApproval === "on",
        reason: values.reason,
      }),
    });
    const result = await readAdminApiResult<AdminApiResult & { state?: { checkoutAvailable: boolean; missingFields: string[] } }>(response);
    setSaving(false);
    notify(
      response.ok
        ? result.state?.checkoutAvailable
          ? t("adminSubscriptions.manual.configurationSavedReady")
          : t("adminSubscriptions.manual.configurationSavedMissing", { fields: result.state?.missingFields.join(", ") ?? "" })
        : t("adminSubscriptions.manual.configurationSaveFailed"),
      !response.ok,
    );
    if (response.ok) void load();
  }

  if (!configuration) return <section className="mb-6 rounded-2xl border bg-white p-6"><LoaderCircle className="size-5 animate-spin" /></section>;
  return (
    <details className="mb-6 rounded-2xl border bg-white p-6" open={missing.length > 0}>
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Landmark className="mt-0.5 size-5 text-orange-500" />
            <div>
              <h2 className="font-semibold">{t("adminSubscriptions.manual.sellerConfigurationTitle")}</h2>
              <p className="mt-1 text-sm text-slate-500">{t("adminSubscriptions.manual.sellerConfigurationDescription")}</p>
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${missing.length ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {missing.length
              ? t("adminSubscriptions.manual.missingFields", { count: missing.length })
              : t("adminSubscriptions.manual.configurationReady")}
          </span>
        </div>
      </summary>
      <form onSubmit={save} className="mt-6 grid gap-4 md:grid-cols-2">
        <Field label={t("adminSubscriptions.manual.officialSellerName")}><input required name="officialName" defaultValue={configuration.officialName || ""} className={field} /></Field>
        <Field label={t("billing.taxOffice")}><input required name="taxOffice" defaultValue={configuration.taxOffice || ""} className={field} /></Field>
        <Field label={t("billing.taxNumber")}><input required name="taxNumber" defaultValue={configuration.taxNumber || ""} className={field} /></Field>
        <Field label={t("billing.billingEmail")}><input required type="email" name="email" defaultValue={configuration.email || ""} className={field} /></Field>
        <Field label={t("billing.billingPhone")}><input required name="phone" defaultValue={configuration.phone || ""} className={field} /></Field>
        <Field label={t("billing.address")}><textarea required name="registeredAddress" defaultValue={configuration.registeredAddress || ""} className={`${field} min-h-24`} /></Field>
        <Field label={t("adminSubscriptions.manual.tradeRegistryNumber")}>
          <input name="tradeRegistryNumber" defaultValue={configuration.tradeRegistryNumber || ""} disabled={configuration.tradeRegistryNotApplicable} className={field} />
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" name="tradeRegistryNotApplicable" defaultChecked={configuration.tradeRegistryNotApplicable} /> {t("adminSubscriptions.manual.notApplicableSoleProprietor")}</label>
        </Field>
        <Field label={t("adminSubscriptions.manual.mersisNumber")}>
          <input name="mersisNumber" defaultValue={configuration.mersisNumber || ""} disabled={configuration.mersisNotApplicable} className={field} />
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" name="mersisNotApplicable" defaultChecked={configuration.mersisNotApplicable} /> {t("adminSubscriptions.manual.notApplicableSoleProprietor")}</label>
        </Field>
        <label className="flex items-start gap-3 rounded-xl border p-4 text-sm">
          <input type="checkbox" name="confirmVerifiedIdentity" defaultChecked={Boolean(configuration.verifiedAt)} className="mt-1" />
          <span>{t("adminSubscriptions.manual.verifySellerIdentity")}</span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border p-4 text-sm">
          <input type="checkbox" name="confirmLegalApproval" defaultChecked={Boolean(configuration.legalDocumentsApprovedAt)} className="mt-1" />
          <span>{t("adminSubscriptions.manual.verifyLegalDocuments")}</span>
        </label>
        <Field label={t("adminSubscriptions.manual.configurationSource")}><input required name="reason" minLength={5} maxLength={500} className={field} placeholder={t("adminSubscriptions.manual.configurationSourcePlaceholder")} /></Field>
        <Field label={t("auth.password")}><input required type="password" name="adminPassword" autoComplete="current-password" className={field} /></Field>
        <button disabled={saving} className="rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white disabled:opacity-50 md:self-end">{saving ? t("adminSubscriptions.processing") : t("adminSubscriptions.manual.saveConfiguration")}</button>
      </form>
    </details>
  );
}

type AdminSubscriptionRequest = {
  id: string;
  publicId: string;
  status: string;
  workflowStatus?: string;
  billingPeriod: string;
  amount: string;
  currency: string;
  planName: string;
  paymentReference: string;
  transferDescription: string;
  createdAt: string;
  adminCustomerNote?: string | null;
  buyerSnapshot?: { name?: string; email?: string; phone?: string; address?: string };
  bank?: { bankName: string; accountHolder: string; ibanDisplay: string };
  legalDocuments?: Array<{ type: string; title: string; version: string; acceptedAt?: string; content: string }>;
  requestedBy?: { name: string; email: string; phone?: string | null } | null;
  company?: { name: string; phone?: string | null; subscriptions?: Array<{ plan: { name: string } }> };
};

type RequestAction = "UNDER_REVIEW" | "CLARIFICATION_REQUIRED" | "REJECTED" | "CANCELLED" | "APPROVE";

function AdminSubscriptionRequestsPanel({ notify }: { notify: (message: string, error?: boolean) => void }) {
  const { locale, t } = useI18n();
  const [requests, setRequests] = useState<AdminSubscriptionRequest[] | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<{ request: AdminSubscriptionRequest; action: RequestAction } | null>(null);
  const [detail, setDetail] = useState<AdminSubscriptionRequest | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/subscription-requests", { cache: "no-store" });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "LOAD_FAILED");
    setRequests(value.requests);
  }, []);

  useEffect(() => {
    void load().catch(() => notify(t("adminSubscriptions.genericError"), true));
  }, [load, notify, t]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const approve = selected.action === "APPROVE";
    const reauth = await reauthenticateAdmin(String(values.adminPassword ?? ""));
    if (!reauth.response.ok) {
      setSaving(false);
      notify(subscriptionActionError(reauth.result, t), true);
      return;
    }
    const response = await fetch(
      `/api/admin/subscription-requests/${selected.request.id}/${approve ? "approve" : "status"}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(approve ? {
          bankChecked: values.bankChecked === "on",
          internalNote: values.internalNote,
        } : {
          action: selected.action,
          customerNote: values.customerNote || undefined,
          internalNote: values.internalNote || undefined,
        }),
      },
    );
    const result = await readAdminApiResult(response);
    setSaving(false);
    notify(response.ok ? t("adminSubscriptions.actionCompleted") : subscriptionActionError(result, t), !response.ok);
    if (response.ok) {
      setSelected(null);
      void load();
    }
  }

  const filters = [
    ["", t("common.all")],
    ["AWAITING_PAYMENT", t("billing.manual.pendingPayment")],
    ["UNDER_REVIEW", t("billing.manual.paymentReview")],
    ["ACTIVATED", t("billing.manual.approved")],
    ["REJECTED", t("billing.manual.rejected")],
    ["CANCELLED", t("common.cancel")],
  ] as const;
  const visibleRequests = requests?.filter((request) => {
    if (!filter) return true;
    return (request.workflowStatus || request.status) === filter;
  }) ?? null;
  const counts = {
    pending: requests?.filter((request) => request.status === "PENDING_PAYMENT").length ?? 0,
    review: requests?.filter((request) => request.status === "PAYMENT_REVIEW").length ?? 0,
    approved: requests?.filter((request) => request.status === "APPROVED").length ?? 0,
    rejected: requests?.filter((request) => request.status === "REJECTED").length ?? 0,
  };

  return (
    <section className="mb-6 rounded-2xl border bg-white p-6">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 size-5 text-orange-500" />
        <div>
          <h2 className="font-semibold">{t("billing.manual.myRequests")}</h2>
          <p className="mt-1 text-sm text-slate-500">{t("billing.manual.requestHistoryDescription")}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {filters.map(([value, label]) => <button key={value || "all"} type="button" onClick={() => setFilter(value)} className={`${button} ${filter === value ? "border-orange-500 bg-orange-50 text-orange-700" : ""}`}>{label}</button>)}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <RequestMetric label={t("billing.manual.pendingPayment")} value={counts.pending} />
        <RequestMetric label={t("billing.manual.paymentReview")} value={counts.review} />
        <RequestMetric label={t("billing.manual.approved")} value={counts.approved} />
        <RequestMetric label={t("billing.manual.rejected")} value={counts.rejected} />
      </div>
      {!visibleRequests ? <LoaderCircle className="mt-5 size-5 animate-spin" /> : visibleRequests.length ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead><tr className="border-b text-left text-slate-500"><th className="py-3">{t("users.user")} / {t("common.company")}</th><th>{t("billing.manual.plan")}</th><th>{t("billing.manual.paymentPeriod")} / {t("billing.manual.amount")}</th><th>{t("billing.manual.paymentReference")}</th><th>{t("billing.manual.requestDate")}</th><th>{t("adminSubscriptions.activeSubscriptions")}</th><th>{t("common.status")}</th><th>{t("common.actions")}</th></tr></thead>
            <tbody>{visibleRequests.map((request) => {
              const workflowStatus = request.workflowStatus || request.status;
              return <tr key={request.id} className="border-b align-top last:border-0">
              <td className="py-4"><b>{request.requestedBy?.name || "-"}</b><p className="text-xs text-slate-500">{request.requestedBy?.email || "-"} · {request.requestedBy?.phone || request.company?.phone || "-"}</p><p className="mt-1 text-xs">{request.company?.name || "-"}</p></td>
              <td>{request.planName}</td>
              <td>{t(request.billingPeriod === "YEARLY" ? "adminSubscriptions.yearly" : "adminSubscriptions.monthly")}<p className="font-semibold">{formatNumber(Number(request.amount), locale)} {request.currency}</p></td>
              <td><b>{request.transferDescription}</b><p className="text-xs text-slate-500">{request.publicId}</p></td>
              <td>{formatDate(request.createdAt, locale)}</td>
              <td>{request.company?.subscriptions?.[0]?.plan.name || "-"}</td>
              <td><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">{adminRequestStatus(request.status, t)}</span>{request.adminCustomerNote ? <p className="mt-2 max-w-56 text-xs text-slate-500">{request.adminCustomerNote}</p> : null}</td>
              <td><div className="flex max-w-72 flex-wrap gap-2">
                <button className={button} onClick={() => setDetail(request)}>{t("adminSubscriptions.viewDetails")}</button>
                {["AWAITING_PAYMENT", "CLARIFICATION_REQUIRED"].includes(workflowStatus) ? <button className={button} onClick={() => setSelected({ request, action: "UNDER_REVIEW" })}>{t("adminSubscriptions.manual.takeReview")}</button> : null}
                {["AWAITING_PAYMENT", "UNDER_REVIEW", "CLARIFICATION_REQUIRED"].includes(workflowStatus) ? <>
                  <button className={`${button} border-emerald-300 text-emerald-700`} onClick={() => setSelected({ request, action: "APPROVE" })}>{t("adminSubscriptions.manual.approvePayment")}</button>
                  <button className={button} onClick={() => setSelected({ request, action: "CLARIFICATION_REQUIRED" })}>{t("adminSubscriptions.manual.requestClarification")}</button>
                  <button className={`${button} text-red-600`} onClick={() => setSelected({ request, action: "REJECTED" })}>{t("adminSubscriptions.manual.rejectRequest")}</button>
                  <button className={`${button} text-red-600`} onClick={() => setSelected({ request, action: "CANCELLED" })}>{t("adminSubscriptions.action.cancel")}</button>
                </> : null}
              </div></td>
            </tr>;
            })}</tbody>
          </table>
        </div>
      ) : <p className="mt-5 text-sm text-slate-500">{t("billing.manual.noRequests")}</p>}

      {selected ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-orange-600">{t("billing.manual.newAdminRequest")}</p><h3 className="mt-2 text-xl font-semibold">{requestActionLabel(selected.action, t)}</h3></div><button type="button" onClick={() => setSelected(null)} className={button}><X className="size-4" /></button></div>
            <p className="mt-3 text-sm text-slate-500">{selected.request.planName} · {selected.request.paymentReference} · {selected.request.amount} {selected.request.currency}</p>
            {selected.action === "APPROVE" ? (
              <label className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">
                <input required type="checkbox" name="bankChecked" className="mt-1" />
                <span>{t("adminSubscriptions.manual.bankChecked")}</span>
              </label>
            ) : null}
            {["CLARIFICATION_REQUIRED", "REJECTED"].includes(selected.action) ? <Field label={t("adminSubscriptions.manual.customerNote")}><textarea required name="customerNote" minLength={5} maxLength={500} className={`${field} mt-5 min-h-24`} /></Field> : null}
            <Field label={t("adminSubscriptions.manual.internalNote")}><textarea required={selected.action === "APPROVE"} name="internalNote" minLength={5} maxLength={1000} className={`${field} mt-5 min-h-24`} /></Field>
            <Field label={t("auth.password")}><input required type="password" name="adminPassword" autoComplete="current-password" className={`${field} mt-5`} /></Field>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setSelected(null)} className={button}>{t("adminSubscriptions.dismiss")}</button><button disabled={saving} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? t("adminSubscriptions.processing") : t("adminSubscriptions.confirm")}</button></div>
          </form>
        </div>
      ) : null}
      {detail ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4">
          <div className="mx-auto my-8 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-orange-600">{t("billing.manual.newAdminRequest")}</p><h3 className="mt-2 text-xl font-semibold">{detail.publicId}</h3></div>
              <button type="button" onClick={() => setDetail(null)} className={button} aria-label={t("common.close")}><X className="size-4" /></button>
            </div>
            <div className="mt-5 grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-2">
              <span><b>{t("users.user")}:</b> {detail.requestedBy?.name || t("billing.manual.unspecified")}</span>
              <span><b>{t("billing.manual.email")}:</b> {detail.requestedBy?.email || t("billing.manual.unspecified")}</span>
              <span><b>{t("common.company")}:</b> {detail.company?.name || t("billing.manual.unspecified")}</span>
              <span><b>{t("billing.manual.phone")}:</b> {detail.requestedBy?.phone || detail.company?.phone || t("billing.manual.unspecified")}</span>
              <span><b>{t("billing.manual.plan")}:</b> {detail.planName}</span>
              <span><b>{t("billing.manual.paymentPeriod")}:</b> {t(detail.billingPeriod === "YEARLY" ? "adminSubscriptions.yearly" : "adminSubscriptions.monthly")}</span>
              <span><b>{t("billing.manual.amount")}:</b> {detail.amount} {detail.currency}</span>
              <span><b>{t("billing.manual.paymentReference")}:</b> {detail.transferDescription}</span>
              <span><b>{t("common.status")}:</b> {adminRequestStatus(detail.status, t)}</span>
              <span><b>{t("billing.manual.bankName")}:</b> {detail.bank?.bankName || t("billing.manual.unspecified")}</span>
              <span><b>{"IBAN"}:</b> {detail.bank?.ibanDisplay || t("billing.manual.unspecified")}</span>
            </div>
            <div className="mt-5 space-y-3">
              {(detail.legalDocuments || []).map((document) => (
                <details key={document.type} className="rounded-xl border p-4">
                  <summary className="cursor-pointer font-semibold">{document.title} · {document.version}</summary>
                  <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-slate-600">{document.content}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function adminRequestStatus(status: string, t: ReturnType<typeof useI18n>["t"]) {
  return ({
    PENDING_PAYMENT: t("billing.manual.pendingPayment"),
    PAYMENT_REVIEW: t("billing.manual.paymentReview"),
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

function RequestMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function requestActionLabel(action: RequestAction, t: ReturnType<typeof useI18n>["t"]) {
  return ({
    UNDER_REVIEW: t("adminSubscriptions.manual.takeReview"),
    CLARIFICATION_REQUIRED: t("adminSubscriptions.manual.requestClarification"),
    REJECTED: t("adminSubscriptions.manual.rejectRequest"),
    CANCELLED: t("adminSubscriptions.action.cancel"),
    APPROVE: t("adminSubscriptions.manual.approvePayment"),
  } as Record<RequestAction, string>)[action];
}

function ActionModal({ pending, loading, onClose, onSubmit }: { pending: PendingAction; loading: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const { t } = useI18n();
  const activationWithoutSubscription = pending.action === "ACTIVATE" && !pending.subscription;

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4"><form onSubmit={onSubmit} className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-orange-600">{t("adminSubscriptions.action")}</p><h2 className="mt-2 text-xl font-semibold">{actionLabel(pending.action, t)}</h2><p className="mt-1 text-sm text-slate-500">{pending.company.name}</p></div><button type="button" onClick={onClose} className={button} aria-label={t("common.closeMenu")}><X className="size-4"/></button></div><p className="mt-3 text-sm text-slate-500">{t("adminSubscriptions.actionWarning")}</p>
    {activationWithoutSubscription ? <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <Field label={t("adminSubscriptions.newPlan")}><select required name="planSlug" className={field}><option value="starter">{t("home.plan.starter.name")}</option><option value="professional">{t("home.plan.professional.name")}</option></select></Field>
      <Field label={t("adminSubscriptions.billingPeriod")}><select required name="billingPeriod" className={field}><option value="MONTHLY">{t("adminSubscriptions.monthly")}</option><option value="YEARLY">{t("adminSubscriptions.yearly")}</option></select></Field>
      <Field label={t("adminSubscriptions.startDate")}><input required name="startsAt" type="datetime-local" defaultValue={pending.defaultStartsAt} className={field}/></Field>
      <Field label={t("adminSubscriptions.endDate")}><input required name="endsAt" type="datetime-local" defaultValue={pending.defaultEndsAt} className={field}/></Field>
    </div> : null}
    {pending.action === "EXTEND" ? <Field label={t("adminSubscriptions.extensionDays")}><input required name="extensionDays" type="number" min={1} max={3650} defaultValue={30} className={`${field} mt-4`}/></Field> : null}
    {pending.action === "CHANGE_PLAN" ? <Field label={t("adminSubscriptions.newPlan")}><select required name="planSlug" defaultValue={pending.subscription?.plan.slug === "professional" ? "starter" : "professional"} className={`${field} mt-4`}><option value="starter">{t("home.plan.starter.name")}</option><option value="professional">{t("home.plan.professional.name")}</option></select></Field> : null}
    <Field label={t("adminSubscriptions.actionDescription")}><textarea required name="reason" minLength={5} maxLength={500} className={`${field} mt-4 min-h-24`} placeholder={t("adminSubscriptions.actionReasonPlaceholder")}/></Field>
    <Field label={t("auth.password")}><input required type="password" name="adminPassword" autoComplete="current-password" className={`${field} mt-4`}/></Field>
    <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className={button}>{t("adminSubscriptions.dismiss")}</button><button disabled={loading} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:bg-orange-300 disabled:text-white">{loading ? t("adminSubscriptions.processing") : t("adminSubscriptions.confirm")}</button></div></form></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="mb-2 block text-xs font-semibold text-slate-700">{label}</span>{children}</label>; }
function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof WalletCards }) { const { locale } = useI18n(); return <div className="rounded-2xl border bg-white p-5"><Icon className="size-5 text-orange-500"/><p className="mt-4 text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{formatNumber(value, locale)}</p></div>; }
function localizedDate(value: string | undefined, locale: string) { return value ? formatDate(value, locale) : "-"; }
function toLocalDateTimeInput(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}
function actionLabel(action: ActionName, t: ReturnType<typeof useI18n>["t"]) { return t(`adminSubscriptions.action.${action.toLowerCase()}`); }
function subscriptionActionError(result: AdminApiResult, t: ReturnType<typeof useI18n>["t"]) {
  let message: string;
  if (result.error === "DOWNGRADE_SEAT_RECONCILIATION_REQUIRED") {
    message = t("adminSubscriptions.seatReconciliationError", { used: result.details?.usedSeats ?? "?", limit: result.details?.targetSeatLimit ?? "?" });
  } else if (result.error === "INVALID_CREDENTIALS") {
    message = t("auth.invalidCredentials");
  } else if (result.error === "UNAUTHORIZED") {
    message = t("api.error.sessionExpired");
  } else if (result.error === "billing.profileIncomplete") {
    message = t("adminSubscriptions.billingProfileIncomplete");
  } else if (["VALIDATION_ERROR", "INVALID_EXTENSION"].includes(result.error ?? "")) {
    message = t("adminSubscriptions.validationError");
  } else {
    message = t("adminSubscriptions.genericError");
  }
  return result.requestId ? `${message} (${t("privacy.requestId")}: ${result.requestId})` : message;
}
