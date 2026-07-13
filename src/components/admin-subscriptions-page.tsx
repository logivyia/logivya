"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, LoaderCircle, Search, ShieldAlert, WalletCards, X } from "lucide-react";
import { formatDate, formatNumber } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";

type Subscription = { id: string; status: string; startsAt?: string; endsAt?: string; trialStartsAt?: string; trialEndsAt?: string; currentPeriodEndsAt?: string; remainingDays?: number; trialDurationDays?: number; isActive?: boolean; plan: { name: string; slug: string; trialDays: number } };
type Company = { id: string; name: string; phone?: string; owner: { name: string; email: string; phone?: string }; billingProfile?: { legalName?: string; billingEmail?: string }; subscriptions: Subscription[]; seatUsage?: { limit: number; used: number; activeMembers: number; pendingInvitations: number; available: number; reconciliationRequired: boolean } };
type ActionName = "ACTIVATE" | "EXTEND" | "SUSPEND" | "CANCEL" | "CHANGE_PLAN";
type PendingAction = { subscription: Subscription; action: ActionName };
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-100 disabled:bg-slate-100 disabled:text-slate-600";
const button = "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-orange-50 disabled:bg-slate-100 disabled:text-slate-500";

export function AdminSubscriptionsPage() {
  const { locale, t } = useI18n();
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
    setLoading(true);
    const response = await fetch("/api/admin/subscriptions/manual-activate", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
    });
    const result = await response.json();
    setLoading(false);
    notify(response.ok ? t("adminSubscriptions.manualActivationCreated") : subscriptionActionError(result, t), !response.ok);
    if (response.ok) void load(query);
  }
  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingAction) return;
    setLoading(true);
    const payload = { action: pendingAction.action, ...Object.fromEntries(new FormData(event.currentTarget)) };
    const response = await fetch(`/api/admin/subscriptions/${pendingAction.subscription.id}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    setLoading(false);
    setPendingAction(undefined);
    notify(response.ok ? t("adminSubscriptions.actionCompleted") : subscriptionActionError(result, t), !response.ok);
    if (response.ok) void load(query);
  }

  return <>
    <header className="mb-7"><p className="text-xs font-semibold uppercase tracking-[.2em] text-orange-600">{t("adminSubscriptions.eyebrow")}</p><h1 className="mt-2 text-3xl font-semibold">{t("adminSubscriptions.title")}</h1><p className="mt-2 text-sm text-slate-500">{t("adminSubscriptions.description")}</p></header>
    <div className="mb-6 grid gap-4 md:grid-cols-4"><Metric label={t("adminSubscriptions.shownCompanies")} value={companies?.length ?? 0} icon={WalletCards}/><Metric label={t("adminSubscriptions.activeSubscriptions")} value={companies?.filter((company) => company.subscriptions[0]?.status === "ACTIVE").length ?? 0} icon={CheckCircle2}/><Metric label={t("adminSubscriptions.trialAccounts")} value={companies?.filter((company) => company.subscriptions[0]?.status === "TRIALING").length ?? 0} icon={CalendarClock}/><Metric label={t("adminSubscriptions.incompleteBillingProfiles")} value={companies?.filter((company) => !company.billingProfile?.billingEmail).length ?? 0} icon={ShieldAlert}/></div>
    <form onSubmit={activate} className="mb-6 grid gap-4 rounded-2xl border bg-white p-6 md:grid-cols-3">
      <Field label={t("common.company")}><select required name="companyId" className={field}><option value="">{t("adminSubscriptions.selectCompany")}</option>{companies?.map((company) => <option key={company.id} value={company.id}>{company.name} · {company.owner.email}</option>)}</select></Field>
      <Field label={t("adminSubscriptions.plan")}><select name="planSlug" className={field}><option value="starter">{t("home.plan.starter.name")}</option><option value="professional">{t("home.plan.professional.name")}</option></select></Field>
      <Field label={t("adminSubscriptions.billingPeriod")}><select name="billingPeriod" className={field}><option value="MONTHLY">{t("adminSubscriptions.monthly")}</option><option value="YEARLY">{t("adminSubscriptions.yearly")}</option></select></Field>
      <Field label={t("adminSubscriptions.startDate")}><input required name="startsAt" type="datetime-local" className={field}/></Field>
      <Field label={t("adminSubscriptions.endDate")}><input required name="endsAt" type="datetime-local" className={field}/></Field>
      <Field label={t("adminSubscriptions.paymentMethod")}><select name="paymentMethod" className={field}><option value="MANUAL_BANK_TRANSFER">{t("adminSubscriptions.bankTransfer")}</option><option value="MANUAL">{t("adminSubscriptions.manual")}</option><option value="FREE_PROMO">{t("adminSubscriptions.freePromo")}</option><option value="OTHER">{t("support.type.other")}</option></select></Field>
      <Field label={t("adminSubscriptions.currency")}><input name="currency" value="TRY" readOnly className={field}/></Field>
      <Field label={t("adminSubscriptions.actionReason")}><input required name="note" minLength={5} maxLength={500} placeholder={t("adminSubscriptions.assignmentReasonPlaceholder")} className={field}/></Field>
      <button disabled={loading} className="rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white hover:bg-orange-600 disabled:bg-orange-300 disabled:text-white md:col-span-3">{loading ? <LoaderCircle className="mx-auto size-5 animate-spin"/> : t("adminSubscriptions.manualActivate")}</button>
    </form>
    <section className="rounded-2xl border bg-white p-5">
      <form onSubmit={(event) => { event.preventDefault(); void load(query); }} className="mb-5 flex flex-col gap-2 sm:flex-row"><label className="flex flex-1 items-center gap-2 rounded-xl border bg-white px-3"><Search className="size-4"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("adminSubscriptions.searchPlaceholder")} className="w-full bg-transparent py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"/></label><button className={button}>{t("adminSubscriptions.search")}</button></form>
      {!companies ? <LoaderCircle className="animate-spin"/> : <div className="overflow-x-auto">
        <table className="w-full min-w-[1250px] text-sm">
          <thead><tr className="border-b text-left text-slate-500"><th className="py-3">{t("common.company")}</th><th>{t("company.phone")}</th><th>{t("adminSubscriptions.billingProfile")}</th><th>{t("adminSubscriptions.plan")}</th><th>{t("adminSubscriptions.seats")}</th><th>{t("common.status")}</th><th>{t("adminSubscriptions.start")}</th><th>{t("adminSubscriptions.end")}</th><th>{t("adminSubscriptions.trialDuration")}</th><th>{t("common.actions")}</th></tr></thead>
          <tbody>{companies.map((company) => {
            const subscription = company.subscriptions[0];
            return <tr key={company.id} className="border-b last:border-0">
              <td className="py-4"><b>{company.name}</b><p className="text-xs text-slate-500">{company.owner.name} · {company.owner.email}</p></td>
              <td>{company.phone || company.owner.phone || "-"}</td>
              <td>{company.billingProfile?.billingEmail ? t("billing.complete") : t("adminSubscriptions.incomplete")}</td>
              <td>{subscription?.plan.name || "-"}</td>
              <td><b>{company.seatUsage ? `${formatNumber(company.seatUsage.used, locale)} / ${formatNumber(company.seatUsage.limit, locale)}` : "-"}</b>{company.seatUsage?.reconciliationRequired ? <p className="mt-1 text-xs font-semibold text-red-600">{t("adminSubscriptions.reconciliationRequired")}</p> : null}</td>
              <td>{subscription?.isActive ? t("status.active") : subscription?.status ? t(`status.${subscription.status.toLowerCase()}`) : "-"}</td>
              <td>{localizedDate(subscription?.trialStartsAt || subscription?.startsAt, locale)}</td>
              <td>{localizedDate(subscription?.trialEndsAt || subscription?.endsAt || subscription?.currentPeriodEndsAt, locale)}</td>
              <td>{trialSummary(subscription, t)}</td>
              <td>{subscription && <div className="flex flex-wrap gap-2">{(["ACTIVATE","EXTEND","SUSPEND","CANCEL","CHANGE_PLAN"] as ActionName[]).map((action) => <button key={action} onClick={() => setPendingAction({ subscription, action })} className={button}>{actionLabel(action, t)}</button>)}<Link href={`/admin/companies/${company.id}`} className={button}>{t("adminSubscriptions.viewDetails")}</Link></div>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
    </section>
    {pendingAction && <ActionModal pending={pendingAction} loading={loading} onClose={() => setPendingAction(undefined)} onSubmit={submitAction}/>}
    {toast && <div role="status" className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border p-4 text-sm font-medium shadow-2xl ${toast.error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{toast.message}</div>}
  </>;
}

function ActionModal({ pending, loading, onClose, onSubmit }: { pending: PendingAction; loading: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const { t } = useI18n();
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4"><form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-orange-600">{t("adminSubscriptions.action")}</p><h2 className="mt-2 text-xl font-semibold">{actionLabel(pending.action, t)}</h2></div><button type="button" onClick={onClose} className={button} aria-label={t("common.closeMenu")}><X className="size-4"/></button></div><p className="mt-3 text-sm text-slate-500">{t("adminSubscriptions.actionWarning")}</p>{pending.action === "EXTEND" && <Field label={t("adminSubscriptions.newEndDate")}><input required name="endsAt" type="datetime-local" className={`${field} mt-4`}/></Field>}{pending.action === "CHANGE_PLAN" && <Field label={t("adminSubscriptions.newPlan")}><select required name="planSlug" className={`${field} mt-4`}><option value="starter">{t("home.plan.starter.name")}</option><option value="professional">{t("home.plan.professional.name")}</option></select></Field>}<Field label={t("adminSubscriptions.actionDescription")}><textarea required name="reason" minLength={5} maxLength={500} className={`${field} mt-4 min-h-24`} placeholder={t("adminSubscriptions.actionReasonPlaceholder")}/></Field><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className={button}>{t("adminSubscriptions.dismiss")}</button><button disabled={loading} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:bg-orange-300 disabled:text-white">{loading ? t("adminSubscriptions.processing") : t("adminSubscriptions.confirm")}</button></div></form></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="mb-2 block text-xs font-semibold text-slate-700">{label}</span>{children}</label>; }
function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof WalletCards }) { const { locale } = useI18n(); return <div className="rounded-2xl border bg-white p-5"><Icon className="size-5 text-orange-500"/><p className="mt-4 text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{formatNumber(value, locale)}</p></div>; }
function localizedDate(value: string | undefined, locale: string) { return value ? formatDate(value, locale) : "-"; }
function trialSummary(subscription: Subscription | undefined, t: ReturnType<typeof useI18n>["t"]) {
  if (!subscription || subscription.plan.slug !== "trial") return "-";
  const duration = subscription.trialDurationDays ?? subscription.plan.trialDays;
  return subscription.isActive
    ? t("adminSubscriptions.trialRemaining", { duration, remaining: subscription.remainingDays ?? 0 })
    : t("adminSubscriptions.trialExpired", { duration });
}
function actionLabel(action: ActionName, t: ReturnType<typeof useI18n>["t"]) { return t(`adminSubscriptions.action.${action.toLowerCase()}`); }
function subscriptionActionError(result: { error?: string; details?: { usedSeats?: number; targetSeatLimit?: number } }, t: ReturnType<typeof useI18n>["t"]) {
  if (result.error === "DOWNGRADE_SEAT_RECONCILIATION_REQUIRED") {
    return t("adminSubscriptions.seatReconciliationError", { used: result.details?.usedSeats ?? "?", limit: result.details?.targetSeatLimit ?? "?" });
  }
  if (result.error === "billing.profileIncomplete") return t("adminSubscriptions.billingProfileIncomplete");
  if (result.error === "VALIDATION_ERROR") return t("adminSubscriptions.validationError");
  return t("adminSubscriptions.genericError");
}
