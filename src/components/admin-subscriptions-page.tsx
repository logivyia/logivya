"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, LoaderCircle, Search, ShieldAlert, WalletCards, X } from "lucide-react";

type Subscription = { id: string; status: string; startsAt?: string; endsAt?: string; trialStartsAt?: string; trialEndsAt?: string; currentPeriodEndsAt?: string; remainingDays?: number; trialDurationDays?: number; isActive?: boolean; plan: { name: string; slug: string; trialDays: number } };
type Company = { id: string; name: string; phone?: string; owner: { name: string; email: string; phone?: string }; billingProfile?: { legalName?: string; billingEmail?: string }; subscriptions: Subscription[] };
type ActionName = "ACTIVATE" | "EXTEND" | "SUSPEND" | "CANCEL" | "CHANGE_PLAN";
type PendingAction = { subscription: Subscription; action: ActionName };
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-100 disabled:bg-slate-100 disabled:text-slate-600";
const button = "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-orange-50 disabled:bg-slate-100 disabled:text-slate-500";

export function AdminSubscriptionsPage() {
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
  useEffect(() => { void load().catch(() => notify("Şirketler yüklenemedi. Lütfen tekrar deneyin.", true)); }, [load, notify]);

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const response = await fetch("/api/admin/subscriptions/manual-activate", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
    });
    setLoading(false);
    notify(response.ok ? "Abonelik ve manuel ödeme başarıyla oluşturuldu." : "İşlem tamamlanamadı. Bilgileri kontrol edip tekrar deneyin.", !response.ok);
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
    setLoading(false);
    setPendingAction(undefined);
    notify(response.ok ? "Abonelik işlemi tamamlandı." : "İşlem tamamlanamadı. Lütfen tekrar deneyin.", !response.ok);
    if (response.ok) void load(query);
  }

  return <>
    <header className="mb-7"><p className="text-xs font-semibold uppercase tracking-[.2em] text-orange-600">Platform Yönetimi</p><h1 className="mt-2 text-3xl font-semibold">Manuel Abonelik Yönetimi</h1><p className="mt-2 text-sm text-slate-500">Banka transferi ve manuel ödemeler için abonelikleri güvenli biçimde yönetin.</p></header>
    <div className="mb-6 grid gap-4 md:grid-cols-4"><Metric label="Gösterilen şirket" value={companies?.length ?? 0} icon={WalletCards}/><Metric label="Aktif abonelik" value={companies?.filter((company) => company.subscriptions[0]?.status === "ACTIVE").length ?? 0} icon={CheckCircle2}/><Metric label="Deneme hesabı" value={companies?.filter((company) => company.subscriptions[0]?.status === "TRIALING").length ?? 0} icon={CalendarClock}/><Metric label="Eksik fatura profili" value={companies?.filter((company) => !company.billingProfile?.billingEmail).length ?? 0} icon={ShieldAlert}/></div>
    <form onSubmit={activate} className="mb-6 grid gap-4 rounded-2xl border bg-white p-6 md:grid-cols-3">
      <Field label="Şirket"><select required name="companyId" className={field}><option value="">Şirket seçin</option>{companies?.map((company) => <option key={company.id} value={company.id}>{company.name} · {company.owner.email}</option>)}</select></Field>
      <Field label="Plan"><select name="planSlug" className={field}><option value="starter">Starter</option><option value="professional">Professional</option><option value="enterprise">Enterprise</option></select></Field>
      <Field label="Faturalama dönemi"><select name="billingPeriod" className={field}><option value="MONTHLY">Aylık</option><option value="YEARLY">Yıllık</option></select></Field>
      <Field label="Başlangıç tarihi"><input required name="startsAt" type="datetime-local" className={field}/></Field>
      <Field label="Bitiş tarihi"><input required name="endsAt" type="datetime-local" className={field}/></Field>
      <Field label="Ödeme yöntemi"><select name="paymentMethod" className={field}><option value="MANUAL_BANK_TRANSFER">Banka transferi</option><option value="MANUAL">Manuel</option><option value="FREE_PROMO">Ücretsiz / Promo</option><option value="OTHER">Diğer</option></select></Field>
      <Field label="Para birimi"><input name="currency" value="TRY" readOnly className={field}/></Field>
      <Field label="Enterprise özel tutar"><input name="customAmount" type="number" min="0" step="0.01" placeholder="Varsayılan plan tutarı kullanılır" className={field}/></Field>
      <Field label="İç not"><input name="note" maxLength={500} placeholder="Banka dekontu veya işlem notu" className={field}/></Field>
      <button disabled={loading} className="rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white hover:bg-orange-600 disabled:bg-orange-300 disabled:text-white md:col-span-3">{loading ? <LoaderCircle className="mx-auto size-5 animate-spin"/> : "Manuel etkinleştir"}</button>
    </form>
    <section className="rounded-2xl border bg-white p-5">
      <form onSubmit={(event) => { event.preventDefault(); void load(query); }} className="mb-5 flex flex-col gap-2 sm:flex-row"><label className="flex flex-1 items-center gap-2 rounded-xl border bg-white px-3"><Search className="size-4"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Şirket, kullanıcı, e-posta veya telefon ara" className="w-full bg-transparent py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"/></label><button className={button}>Ara</button></form>
      {!companies ? <LoaderCircle className="animate-spin"/> : <div className="overflow-x-auto">
        <table className="w-full min-w-[1250px] text-sm">
          <thead><tr className="border-b text-left text-slate-500"><th className="py-3">Şirket</th><th>Telefon</th><th>Fatura profili</th><th>Plan</th><th>Durum</th><th>Başlangıç</th><th>Bitiş</th><th>Deneme süresi</th><th>İşlemler</th></tr></thead>
          <tbody>{companies.map((company) => {
            const subscription = company.subscriptions[0];
            return <tr key={company.id} className="border-b last:border-0">
              <td className="py-4"><b>{company.name}</b><p className="text-xs text-slate-500">{company.owner.name} · {company.owner.email}</p></td>
              <td>{company.phone || company.owner.phone || "-"}</td>
              <td>{company.billingProfile?.billingEmail ? "Tamam" : "Eksik"}</td>
              <td>{subscription?.plan.name || "-"}</td>
              <td>{subscription?.isActive ? "Aktif" : subscription?.status || "-"}</td>
              <td>{date(subscription?.trialStartsAt || subscription?.startsAt)}</td>
              <td>{date(subscription?.trialEndsAt || subscription?.endsAt || subscription?.currentPeriodEndsAt)}</td>
              <td>{trialSummary(subscription)}</td>
              <td>{subscription && <div className="flex flex-wrap gap-2">{(["ACTIVATE","EXTEND","SUSPEND","CANCEL","CHANGE_PLAN"] as ActionName[]).map((action) => <button key={action} onClick={() => setPendingAction({ subscription, action })} className={button}>{actionLabel(action)}</button>)}<Link href={`/admin/companies/${company.id}`} className={button}>Detayları görüntüle</Link></div>}</td>
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
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4"><form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-orange-600">Abonelik işlemi</p><h2 className="mt-2 text-xl font-semibold">{actionLabel(pending.action)}</h2></div><button type="button" onClick={onClose} className={button} aria-label="Kapat"><X className="size-4"/></button></div><p className="mt-3 text-sm text-slate-500">Bu işlem aboneliğin erişim haklarını ve durumunu değiştirebilir. Devam etmek için açıklama girin.</p>{pending.action === "EXTEND" && <Field label="Yeni bitiş tarihi"><input required name="endsAt" type="datetime-local" className={`${field} mt-4`}/></Field>}{pending.action === "CHANGE_PLAN" && <Field label="Yeni plan"><select required name="planSlug" className={`${field} mt-4`}><option value="starter">Starter</option><option value="professional">Professional</option><option value="enterprise">Enterprise</option></select></Field>}<Field label="İşlem açıklaması"><textarea required name="reason" minLength={5} maxLength={500} className={`${field} mt-4 min-h-24`} placeholder="İşlem gerekçesini yazın"/></Field><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className={button}>Vazgeç</button><button disabled={loading} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:bg-orange-300 disabled:text-white">{loading ? "İşleniyor..." : "Onayla"}</button></div></form></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="mb-2 block text-xs font-semibold text-slate-700">{label}</span>{children}</label>; }
function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof WalletCards }) { return <div className="rounded-2xl border bg-white p-5"><Icon className="size-5 text-orange-500"/><p className="mt-4 text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>; }
function date(value?: string) { return value ? new Date(value).toLocaleDateString("tr-TR") : "-"; }
function trialSummary(subscription?: Subscription) {
  if (!subscription || subscription.plan.slug !== "trial") return "-";
  const duration = subscription.trialDurationDays ?? subscription.plan.trialDays;
  return subscription.isActive ? `${duration} gün · ${subscription.remainingDays ?? 0} gün kaldı` : `${duration} gün · Sona erdi`;
}
function actionLabel(action: ActionName) { return ({ ACTIVATE: "Etkinleştir", EXTEND: "Uzat", SUSPEND: "Askıya al", CANCEL: "İptal et", CHANGE_PLAN: "Plan değiştir" })[action]; }
