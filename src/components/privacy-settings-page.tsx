"use client";

import Link from "next/link";
import { Download, ExternalLink, FileCheck2, LoaderCircle, LockKeyhole, Send, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { openBrowserPrivacyPreferences } from "@/lib/privacy-preferences";

type Purpose = { code: string; label: string; description: string; required: boolean; currentStatus: string };
type PrivacyRequest = { publicId: string; type: string; status: string; requestedAt: string; deadlineAt?: string | null };
type ExportJob = { publicId: string; status: string; expiresAt?: string | null; createdAt: string };
type Overview = { purposes: Purpose[]; requests: PrivacyRequest[]; exports: ExportJob[]; legalReviewStatus: string };

const panel = "rounded-lg border bg-card p-5 shadow-[var(--shadow-soft)]";
const input = "w-full rounded-lg border bg-input px-3 py-3 text-sm text-input-foreground outline-none focus:border-primary";
const primaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-55";
const purposeKeys: Record<string, { label: string; description: string }> = {
  PRODUCT_ANALYTICS: { label: "privacy.analyticsLabel", description: "privacy.analyticsDescription" },
  CRASH_DIAGNOSTICS: { label: "privacy.diagnosticsLabel", description: "privacy.diagnosticsDescription" },
  MARKETING_COMMUNICATIONS: { label: "privacy.marketingLabel", description: "privacy.marketingDescription" },
};

export function PrivacySettingsPage() {
  const { t, locale } = useI18n();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [exportPassword, setExportPassword] = useState("");
  const [downloadTokens, setDownloadTokens] = useState<Record<string, string>>({});
  const [requestType, setRequestType] = useState("ACCESS");
  const [requestDescription, setRequestDescription] = useState("");
  const [requestPassword, setRequestPassword] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/privacy/overview", { cache: "no-store" });
    if (!response.ok) throw new Error("PRIVACY_OVERVIEW_FAILED");
    setOverview(await response.json());
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch(() => setMessage(t("privacy.loadFailed")));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, t]);

  const optionalPurposes = useMemo(() => overview?.purposes.filter((purpose) => !purpose.required) ?? [], [overview]);

  async function updatePurpose(purpose: Purpose, enabled: boolean) {
    setBusy(purpose.code);
    setMessage("");
    const response = await fetch(`/api/privacy/consents/${purpose.code}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled, locale }) });
    setBusy("");
    if (!response.ok) return setMessage(t("privacy.preferenceFailed"));
    setOverview((current) => current ? { ...current, purposes: current.purposes.map((item) => item.code === purpose.code ? { ...item, currentStatus: enabled ? "GRANTED" : "WITHDRAWN" } : item) } : current);
    setMessage(t("privacy.preferenceSaved"));
  }

  async function requestExport() {
    setBusy("export");
    setMessage("");
    const response = await fetch("/api/privacy/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: exportPassword }) });
    const payload = await response.json();
    setBusy("");
    if (!response.ok) return setMessage(t("privacy.exportFailed"));
    setDownloadTokens((tokens) => ({ ...tokens, [payload.job.publicId]: payload.oneTimeDownloadToken }));
    setExportPassword("");
    setMessage(t("privacy.exportQueued"));
    await load();
  }

  async function downloadExport(job: ExportJob) {
    const token = downloadTokens[job.publicId];
    if (!token) return setMessage(t("privacy.exportTokenMissing"));
    setBusy(job.publicId);
    const response = await fetch(`/api/privacy/export/${job.publicId}/download`, { headers: { "x-privacy-download-token": token } });
    setBusy("");
    if (!response.ok) return setMessage(t("privacy.exportFailed"));
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `logivya-privacy-export-${job.publicId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setDownloadTokens((tokens) => { const next = { ...tokens }; delete next[job.publicId]; return next; });
    await load();
  }

  async function submitRightsRequest() {
    setBusy("request");
    setMessage("");
    const response = await fetch("/api/privacy/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: requestType, description: requestDescription, password: requestPassword }) });
    setBusy("");
    if (!response.ok) return setMessage(t("privacy.requestFailed"));
    setRequestDescription("");
    setRequestPassword("");
    setMessage(t("privacy.requestReceived"));
    await load();
  }

  return <div className="space-y-5">
    <header>
      <p className="text-xs font-semibold uppercase text-primary">{t("privacy.eyebrow")}</p>
      <h1 className="mt-2 text-3xl font-semibold">{t("privacy.title")}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{t("privacy.description")}</p>
    </header>

    {message ? <div role="status" className="rounded-lg border border-primary/30 bg-primary/8 px-4 py-3 text-sm">{message}</div> : null}

    <section className={panel}>
      <div className="flex items-start gap-3"><FileCheck2 className="mt-0.5 size-5 text-primary"/><div><h2 className="font-semibold">{t("privacy.noticesTitle")}</h2><p className="mt-1 text-sm text-muted">{t("privacy.noticesDescription")}</p></div></div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:border-primary" href="/privacy-policy" target="_blank">{t("privacy.privacyPolicy")}<ExternalLink className="size-4"/></Link>
        <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:border-primary" href="/kvkk" target="_blank">{t("privacy.kvkkNotice")}<ExternalLink className="size-4"/></Link>
        <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:border-primary" href="/terms-of-service" target="_blank">{t("privacy.terms")}<ExternalLink className="size-4"/></Link>
        <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:border-primary" onClick={openBrowserPrivacyPreferences}>{t("cookies.manage")}</button>
      </div>
    </section>

    <section className={panel}>
      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 text-primary"/><div><h2 className="font-semibold">{t("privacy.preferencesTitle")}</h2><p className="mt-1 text-sm text-muted">{t("privacy.preferencesDescription")}</p></div></div>
      <div className="mt-4 divide-y">
        {optionalPurposes.map((purpose) => <label key={purpose.code} className="flex min-h-20 items-center gap-4 py-4">
          <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{t(purposeKeys[purpose.code]?.label ?? purpose.label)}</span><span className="mt-1 block text-xs leading-5 text-muted">{t(purposeKeys[purpose.code]?.description ?? purpose.description)}</span></span>
          <input className="size-5 accent-primary" type="checkbox" checked={purpose.currentStatus === "GRANTED"} disabled={busy === purpose.code} onChange={(event) => void updatePurpose(purpose, event.target.checked)} />
        </label>)}
      </div>
    </section>

    <div className="grid gap-5 lg:grid-cols-2">
      <section className={panel}>
        <div className="flex items-start gap-3"><Download className="mt-0.5 size-5 text-primary"/><div><h2 className="font-semibold">{t("privacy.exportTitle")}</h2><p className="mt-1 text-sm text-muted">{t("privacy.exportDescription")}</p></div></div>
        <input className={`${input} mt-4`} type="password" autoComplete="current-password" value={exportPassword} onChange={(event) => setExportPassword(event.target.value)} placeholder={t("privacy.passwordPlaceholder")} />
        <button className={`${primaryButton} mt-3`} disabled={!exportPassword || busy === "export"} onClick={() => void requestExport()}>{busy === "export" ? <LoaderCircle className="size-4 animate-spin"/> : <LockKeyhole className="size-4"/>}{t("privacy.requestExport")}</button>
        <div className="mt-4 space-y-2">{overview?.exports.map((job) => <div key={job.publicId} className="flex items-center justify-between gap-3 border-t pt-3 text-xs"><span><b>{job.publicId}</b><span className="ms-2 text-muted">{job.status}</span></span>{job.status === "READY" ? <button className="text-primary" disabled={busy === job.publicId} onClick={() => void downloadExport(job)}>{t("privacy.download")}</button> : null}</div>)}</div>
      </section>

      <section className={panel}>
        <div className="flex items-start gap-3"><Send className="mt-0.5 size-5 text-primary"/><div><h2 className="font-semibold">{t("privacy.rightsTitle")}</h2><p className="mt-1 text-sm text-muted">{t("privacy.rightsDescription")}</p></div></div>
        <select className={`${input} mt-4`} value={requestType} onChange={(event) => setRequestType(event.target.value)}><option value="ACCESS">{t("privacy.requestAccess")}</option><option value="RECTIFICATION">{t("privacy.requestRectification")}</option><option value="RESTRICTION">{t("privacy.requestRestriction")}</option><option value="OBJECTION">{t("privacy.requestObjection")}</option><option value="PORTABILITY">{t("privacy.requestPortability")}</option><option value="OTHER">{t("privacy.requestOther")}</option></select>
        <textarea className={`${input} mt-3 min-h-28 resize-y`} value={requestDescription} onChange={(event) => setRequestDescription(event.target.value)} placeholder={t("privacy.requestDescriptionPlaceholder")}/>
        <input className={`${input} mt-3`} type="password" autoComplete="current-password" value={requestPassword} onChange={(event) => setRequestPassword(event.target.value)} placeholder={t("privacy.passwordPlaceholder")} />
        <button className={`${primaryButton} mt-3`} disabled={requestDescription.trim().length < 10 || !requestPassword || busy === "request"} onClick={() => void submitRightsRequest()}>{busy === "request" ? <LoaderCircle className="size-4 animate-spin"/> : <Send className="size-4"/>}{t("privacy.submitRequest")}</button>
      </section>
    </div>

    <section className={panel}>
      <h2 className="font-semibold">{t("privacy.requestHistory")}</h2>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="text-xs text-muted"><tr><th className="py-2">{t("privacy.requestId")}</th><th>{t("privacy.requestType")}</th><th>{t("privacy.requestStatus")}</th><th>{t("privacy.requestDate")}</th></tr></thead><tbody>{overview?.requests.map((item) => <tr key={item.publicId} className="border-t"><td className="py-3 font-medium">{item.publicId}</td><td>{item.type}</td><td>{item.status}</td><td>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(item.requestedAt))}</td></tr>)}</tbody></table></div>
      <Link href="/settings/delete-account" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-danger">{t("privacy.deletionLink")}</Link>
    </section>
  </div>;
}
