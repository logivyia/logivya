"use client";
import { AdminInteractiveTable } from "./admin-interactive-table";
import { AdminMetricCard } from "./admin-metric-card";

import { type FormEvent, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";

import { apiErrorMessage } from "@/i18n/api-error";
import { formatNumber } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";

type Flag = {
  key: string;
  name: string;
  description: string;
  isEnabled: boolean;
  rolloutPercentage: number;
};

type FreightFlag = {
  key: string;
  isEnabled: boolean;
  rolloutPercentage: number;
} | null;

const field = "min-h-11 w-full rounded-xl border bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";

export function AdminFeatureFlagsPage({ initialFlags, canManage }: { initialFlags: Flag[]; canManage: boolean }) {
  const { locale, t } = useI18n();
  const publicInitial = initialFlags.find((flag) => flag.key === "freight_marketplace_public");
  const internalInitial = initialFlags.find((flag) => flag.key === "freight_marketplace_internal");
  const [publicFlag, setPublicFlag] = useState<FreightFlag>(publicInitial ?? null);
  const [publicEnabled, setPublicEnabled] = useState(publicInitial?.isEnabled ?? false);
  const [publicRollout, setPublicRollout] = useState(publicInitial?.rolloutPercentage ?? 0);
  const [internalEnabled, setInternalEnabled] = useState(internalInitial?.isEnabled ?? true);
  const [internalRollout, setInternalRollout] = useState(internalInitial?.rolloutPercentage ?? 100);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [flagFilter, setFlagFilter] = useState(0);
  const currentFlags = initialFlags.map(flag => flag.key === "freight_marketplace_public" ? {...flag,isEnabled:publicEnabled,rolloutPercentage:publicRollout} : flag.key === "freight_marketplace_internal" ? {...flag,isEnabled:internalEnabled,rolloutPercentage:internalRollout} : flag);
  const visibleFlags = currentFlags.filter(flag => flagFilter === 1 ? flag.isEnabled : flagFilter === 2 ? !flag.isEnabled : flagFilter === 3 ? flag.rolloutPercentage === 100 : true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const enabledCount = initialFlags.filter((flag) => flag.isEnabled).length
    - Number(publicInitial?.isEnabled ?? false)
    - Number(internalInitial?.isEnabled ?? false)
    + Number(publicEnabled)
    + Number(internalEnabled);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy || reason.trim().length < 5 || !password) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const reauthResponse = await fetch("/api/admin/security/re-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const reauthBody = await reauthResponse.json();
      if (!reauthResponse.ok) throw new Error(apiErrorMessage(t, reauthBody));

      const enablingPublic = publicEnabled && publicFlag?.isEnabled !== true;
      const response = await fetch("/api/admin/feature-flags/freight-marketplace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          publicEnabled,
          publicRolloutPercentage: publicRollout,
          internalEnabled,
          internalRolloutPercentage: internalRollout,
          reason: reason.trim(),
          ...(enablingPublic ? { confirmation: "ENABLE_FREIGHT_MARKETPLACE_PUBLIC" } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(t, body));
      setPublicFlag(body.public);
      setPublicEnabled(Boolean(body.public?.isEnabled));
      setPublicRollout(Number(body.public?.rolloutPercentage ?? 0));
      setInternalEnabled(Boolean(body.internal?.isEnabled));
      setInternalRollout(Number(body.internal?.rolloutPercentage ?? 0));
      setReason("");
      setPassword("");
      setNotice(locale === "tr" ? "Yük pazarı erişim bayrakları güvenli biçimde güncellendi." : "Freight marketplace access flags were updated securely.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <header className="mb-7"><p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{t("adminFeatureFlags.eyebrow")}</p><h1 className="mt-2 text-3xl font-semibold">{t("adminFeatureFlags.title")}</h1><p className="mt-2 text-sm text-muted">{t("adminFeatureFlags.description")}</p></header>
    <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[[t("adminFeatureFlags.total"), initialFlags.length], [t("adminFeatureFlags.enabled"), enabledCount], [t("adminFeatureFlags.disabled"), Math.max(0, initialFlags.length - enabledCount)], [t("adminFeatureFlags.fullRollout"), currentFlags.filter((flag) => flag.rolloutPercentage === 100).length]].map(([label, value],index) => <AdminMetricCard key={String(label)} label={String(label)} value={formatNumber(Number(value),locale)} onClick={() => {setFlagFilter(index); document.getElementById("admin-records")?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});}} />)}
    </section>
    {error ? <p role="alert" className="mb-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="mb-5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p> : null}
    {canManage ? <form onSubmit={save} className="panel mb-6 rounded-2xl p-5">
      <div className="mb-5 flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 text-orange-600" /><div><h2 className="font-semibold">{locale === "tr" ? "Yük pazarı erişim kontrolü" : "Freight marketplace access control"}</h2><p className="mt-1 text-sm text-muted">{locale === "tr" ? "İç test ve herkese açık erişimi ayrı ayrı yönetin. Değişiklikler denetim kaydına alınır." : "Manage internal testing and public access separately. Every change is audit logged."}</p></div></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <FlagEditor title={locale === "tr" ? "İç test erişimi" : "Internal test access"} description={locale === "tr" ? "Yalnızca yetkili platform yöneticilerinin kullanımına açılır." : "Available only to authorized platform administrators."} enabled={internalEnabled} rollout={internalRollout} onEnabled={setInternalEnabled} onRollout={setInternalRollout} />
        <FlagEditor title={locale === "tr" ? "Herkese açık erişim" : "Public access"} description={locale === "tr" ? "Etkinleştirildiğinde uygun üretim kullanıcılarına kademeli olarak açılır." : "When enabled, access rolls out gradually to eligible production users."} enabled={publicEnabled} rollout={publicRollout} onEnabled={setPublicEnabled} onRollout={setPublicRollout} warning />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2"><label><span className="mb-2 block text-xs font-semibold">{t("adminSubscriptions.actionReason")}</span><textarea required minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className={`${field} min-h-24 py-3`} /></label><label><span className="mb-2 block text-xs font-semibold">{t("auth.password")}</span><input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={field} /><p className="mt-2 text-xs text-muted">{locale === "tr" ? "Kritik ayar değişikliği öncesi kimliğiniz yeniden doğrulanır." : "Your identity is re-verified before the critical setting change."}</p></label></div>
      <div className="mt-5 flex justify-end"><button type="submit" disabled={busy || reason.trim().length < 5 || !password} className={`${button} border-orange-600 bg-orange-600 text-white`}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{locale === "tr" ? "Erişim ayarlarını kaydet" : "Save access settings"}</button></div>
    </form> : <p className="mb-6 rounded-2xl border bg-white p-5 text-sm text-muted">{locale === "tr" ? "Bu rol özellik bayraklarını yalnızca görüntüleyebilir." : "This role can only view feature flags."}</p>}
    <section id="admin-records" className="scroll-mt-24">{flagFilter ? <button type="button" className={button+" mb-3"} onClick={()=>setFlagFilter(0)}>{locale === "tr" ? "Tüm özellikleri göster" : "Show all flags"}</button> : null}<AdminInteractiveTable headers={[t("adminFeatureFlags.name"),t("common.status"),t("adminFeatureFlags.rollout"),t("adminFeatureFlags.key"),t("adminFeatureFlags.flagDescription")]} rows={visibleFlags.map(flag => [flag.name,flag.isEnabled ? t("adminFeatureFlags.enabled") : t("adminFeatureFlags.disabled"),flag.rolloutPercentage+"%",flag.key,flag.description])} emptyLabel={t("admin.list.empty")} /></section>
  </>;
}

function FlagEditor({ title, description, enabled, rollout, onEnabled, onRollout, warning = false }: { title: string; description: string; enabled: boolean; rollout: number; onEnabled: (value: boolean) => void; onRollout: (value: number) => void; warning?: boolean }) {
  const { locale } = useI18n();
  return <fieldset className={`rounded-2xl border p-5 ${warning && enabled ? "border-amber-300 bg-amber-50" : "bg-slate-50"}`}><legend className="sr-only">{title}</legend><div className="flex items-start justify-between gap-4"><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted">{description}</p></div><label className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={enabled} onChange={(event) => onEnabled(event.target.checked)} className="size-4" />{enabled ? (locale === "tr" ? "Açık" : "On") : (locale === "tr" ? "Kapalı" : "Off")}</label></div>{warning && enabled ? <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-white p-3 text-xs text-amber-900"><AlertTriangle className="size-4 shrink-0" />{locale === "tr" ? "Bu ayar gerçek üretim kullanıcılarını etkiler." : "This setting affects real production users."}</p> : null}<label className="mt-5 block text-xs font-semibold">{locale === "tr" ? "Kademeli erişim yüzdesi" : "Rollout percentage"}: {rollout}%<input type="range" min={0} max={100} step={5} value={rollout} onChange={(event) => onRollout(Number(event.target.value))} className="mt-3 w-full accent-orange-600" /></label></fieldset>;
}
