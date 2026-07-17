"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, FileLock2, RefreshCw, ShieldCheck } from "lucide-react";

type RecordValue = Record<string, unknown>;
type Overview = {
  legalReviewStatus: string;
  retentionPolicyVersion: string;
  requests: Array<{ status: string; _count: { _all: number } }>;
  exports: Array<{ status: string; _count: { _all: number } }>;
  deletions: Array<{ status: string; _count: { _all: number } }>;
  activeLegalHolds: number;
  openBreaches: number;
  dpiasRequiringReview: number;
};
type PrivacyRequest = {
  publicId: string;
  type: string;
  status: string;
  requestedAt: string;
  deadlineAt?: string | null;
  legalHold: boolean;
  user?: { name?: string | null; email: string } | null;
  company?: { name: string } | null;
};

const requestStatuses = ["RECEIVED", "VERIFYING", "IDENTITY_VERIFICATION_REQUIRED", "IN_REVIEW", "WAITING_FOR_USER", "PROCESSING", "APPROVED", "PARTIALLY_APPROVED", "COMPLETED", "REJECTED", "CANCELED", "CLOSED"];

const copy = {
  tr: {
    eyebrow: "Gizlilik yönetişimi", title: "Gizlilik Merkezi", description: "Veri sahibi talepleri, saklama, dışa aktarma, silme, ihlal ve DPIA süreçlerinin denetlenebilir görünümü.",
    legal: "Bu merkezdeki hukuki süreler, aktarım mekanizmaları ve taslak metinler için hukuk incelemesi gereklidir.", legalRequired: "HUKUK İNCELEMESİ GEREKLİ", refresh: "Yenile", requests: "Veri talepleri", requestId: "Talep No", exports: "Dışa aktarmalar", deletions: "Silme işleri", holds: "Aktif hukuki saklama", breaches: "Açık ihlaller", dpias: "İnceleme bekleyen DPIA", requester: "Talep sahibi", company: "Şirket", type: "Tür", status: "Durum", deadline: "Son tarih", actions: "İşlem", open: "Aç", noRecords: "Kayıt bulunamadı.", governance: "İşleyenler ve uluslararası aktarımlar", provider: "Sağlayıcı", purpose: "Amaç", review: "İnceleme", destination: "Hedef", mechanism: "Mekanizma", retention: "Saklama politikası", dryRun: "Saklama dry-run çalıştır", reason: "İşlem gerekçesi", reauth: "Yöneticiyi yeniden doğrula", password: "Yönetici parolası", updateRequest: "Talebi güncelle", response: "Kullanıcıya yanıt", summary: "Sonuç özeti", internal: "Yalnızca iç not", save: "Kaydet", incidents: "İhlaller, DPIA ve hukuki saklamalar", loading: "Gizlilik verileri yükleniyor...", failed: "Gizlilik Merkezi yüklenemedi.", success: "İşlem tamamlandı.", select: "Bir talep seçin.", retentionVersion: "Saklama sürümü", recentRuns: "Son saklama çalıştırmaları", legalDocuments: "Yasal belge sürümleri", version: "Sürüm", locale: "Dil", source: "Kaynak", active: "Aktif",
  },
  en: {
    eyebrow: "Privacy governance", title: "Privacy Center", description: "Auditable oversight for data-subject requests, retention, export, deletion, breach, and DPIA workflows.",
    legal: "Legal review is required for statutory timelines, transfer mechanisms, and draft legal text shown in this center.", legalRequired: "LEGAL REVIEW REQUIRED", refresh: "Refresh", requests: "Data requests", requestId: "Request ID", exports: "Exports", deletions: "Deletion jobs", holds: "Active legal holds", breaches: "Open breaches", dpias: "DPIAs requiring review", requester: "Requester", company: "Company", type: "Type", status: "Status", deadline: "Deadline", actions: "Action", open: "Open", noRecords: "No records found.", governance: "Processors and international transfers", provider: "Provider", purpose: "Purpose", review: "Review", destination: "Destination", mechanism: "Mechanism", retention: "Retention policy", dryRun: "Run retention dry-run", reason: "Action reason", reauth: "Reauthenticate administrator", password: "Administrator password", updateRequest: "Update request", response: "Response to user", summary: "Outcome summary", internal: "Internal note only", save: "Save", incidents: "Breaches, DPIAs, and legal holds", loading: "Loading privacy data...", failed: "Privacy Center could not be loaded.", success: "Action completed.", select: "Select a request.", retentionVersion: "Retention version", recentRuns: "Recent retention runs", legalDocuments: "Legal document versions", version: "Version", locale: "Locale", source: "Source", active: "Active",
  },
} as const;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `HTTP_${response.status}`);
  return body as T;
}

function total(groups?: Array<{ _count: { _all: number } }>) {
  return groups?.reduce((sum, item) => sum + item._count._all, 0) ?? 0;
}

export function AdminPrivacyCenter({ locale }: { locale: string }) {
  const text = locale === "tr" ? copy.tr : copy.en;
  const [overview, setOverview] = useState<Overview | null>(null);
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [processors, setProcessors] = useState<RecordValue[]>([]);
  const [transfers, setTransfers] = useState<RecordValue[]>([]);
  const [retention, setRetention] = useState<{ catalog: RecordValue[]; runs: RecordValue[]; enforcementEnabled: boolean } | null>(null);
  const [breaches, setBreaches] = useState<RecordValue[]>([]);
  const [dpias, setDpias] = useState<RecordValue[]>([]);
  const [holds, setHolds] = useState<RecordValue[]>([]);
  const [legalDocuments, setLegalDocuments] = useState<RecordValue[]>([]);
  const [selected, setSelected] = useState<PrivacyRequest | null>(null);
  const [status, setStatus] = useState("IN_REVIEW");
  const [reason, setReason] = useState("");
  const [response, setResponse] = useState("");
  const [summary, setSummary] = useState("");
  const [internal, setInternal] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, requestData, processorData, transferData, retentionData, breachData, dpiaData, holdData, legalDocumentData] = await Promise.all([
        api<Overview>("/api/admin/privacy/overview"),
        api<{ requests: PrivacyRequest[] }>("/api/admin/privacy/requests"),
        api<{ processors: RecordValue[] }>("/api/admin/privacy/processors"),
        api<{ transfers: RecordValue[] }>("/api/admin/privacy/transfers"),
        api<{ catalog: RecordValue[]; runs: RecordValue[]; enforcementEnabled: boolean }>("/api/admin/privacy/retention"),
        api<{ breaches: RecordValue[] }>("/api/admin/privacy/breaches"),
        api<{ dpias: RecordValue[] }>("/api/admin/privacy/dpia"),
        api<{ holds: RecordValue[] }>("/api/admin/privacy/legal-holds"),
        api<{ documents: RecordValue[] }>("/api/admin/privacy/legal-documents"),
      ]);
      setOverview(overviewData); setRequests(requestData.requests); setProcessors(processorData.processors); setTransfers(transferData.transfers); setRetention(retentionData); setBreaches(breachData.breaches); setDpias(dpiaData.dpias); setHolds(holdData.holds); setLegalDocuments(legalDocumentData.documents);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.failed);
    } finally {
      setLoading(false);
    }
  }, [text.failed]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const metrics = useMemo(() => overview ? [
    [text.requests, total(overview.requests)], [text.exports, total(overview.exports)], [text.deletions, total(overview.deletions)], [text.holds, overview.activeLegalHolds], [text.breaches, overview.openBreaches], [text.dpias, overview.dpiasRequiringReview],
  ] : [], [overview, text]);

  async function reauthenticate() {
    setWorking(true); setNotice(null); setError(null);
    try { await api("/api/admin/security/re-auth", { method: "POST", body: JSON.stringify({ password }) }); setPassword(""); setNotice(text.success); }
    catch (caught) { setError(caught instanceof Error ? caught.message : text.failed); }
    finally { setWorking(false); }
  }

  async function updateRequest() {
    if (!selected) return setError(text.select);
    setWorking(true); setNotice(null); setError(null);
    try {
      await api(`/api/admin/privacy/requests/${encodeURIComponent(selected.publicId)}`, { method: "PATCH", body: JSON.stringify({ status, reason, response: response || undefined, responseSummary: summary || undefined, internal }) });
      setNotice(text.success); setReason(""); setResponse(""); setSummary(""); setSelected(null); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : text.failed); }
    finally { setWorking(false); }
  }

  async function runRetentionDryRun() {
    setWorking(true); setNotice(null); setError(null);
    try { await api("/api/admin/privacy/retention", { method: "POST", body: JSON.stringify({ dryRun: true, reason }) }); setNotice(text.success); setReason(""); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : text.failed); }
    finally { setWorking(false); }
  }

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 border-b pb-6 md:flex-row md:items-end md:justify-between">
      <div><p className="text-xs font-semibold uppercase text-orange-600">{text.eyebrow}</p><h1 className="mt-2 text-3xl font-semibold">{text.title}</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">{text.description}</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border bg-white px-4 text-sm font-semibold disabled:opacity-50"><RefreshCw className="size-4" />{text.refresh}</button>
    </header>
    <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 size-5 shrink-0" /><div><b>{text.legalRequired}</b><p className="mt-1">{text.legal}</p></div></div>
    {error ? <p className="border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}{notice ? <p className="border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p> : null}
    {loading && !overview ? <p className="py-12 text-center text-sm text-slate-500">{text.loading}</p> : null}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{metrics.map(([label, value]) => <div key={String(label)} className="border bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</section>
    <section className="space-y-3"><div className="flex items-center gap-2"><FileLock2 className="size-5 text-orange-500" /><h2 className="text-xl font-semibold">{text.requests}</h2></div><div className="overflow-x-auto border bg-white"><table className="w-full text-left text-sm"><thead className="border-b bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">{text.requestId}</th><th className="p-3">{text.requester}</th><th className="p-3">{text.company}</th><th className="p-3">{text.type}</th><th className="p-3">{text.status}</th><th className="p-3">{text.deadline}</th><th className="p-3">{text.actions}</th></tr></thead><tbody>{requests.map((item) => <tr key={item.publicId} className="border-b last:border-0"><td className="p-3 font-mono text-xs">{item.publicId}</td><td className="p-3">{item.user?.email ?? "-"}</td><td className="p-3">{item.company?.name ?? "-"}</td><td className="p-3">{item.type}</td><td className="p-3">{item.status}{item.legalHold ? " / HOLD" : ""}</td><td className="p-3">{formatDate(item.deadlineAt, locale)}</td><td className="p-3"><button type="button" onClick={() => { setSelected(item); setStatus(item.status); }} className="font-semibold text-orange-600">{text.open}</button></td></tr>)}</tbody></table>{!requests.length ? <p className="p-8 text-center text-sm text-slate-500">{text.noRecords}</p> : null}</div></section>
    {selected ? <section className="grid gap-4 border bg-white p-5 lg:grid-cols-2"><div className="space-y-3"><h2 className="font-semibold">{text.updateRequest}: {selected.publicId}</h2><select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-11 w-full rounded-md border px-3">{requestStatuses.map((item) => <option key={item}>{item}</option>)}</select><textarea value={response} onChange={(event) => setResponse(event.target.value)} placeholder={text.response} className="min-h-24 w-full rounded-md border p-3" /><textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder={text.summary} className="min-h-20 w-full rounded-md border p-3" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} />{text.internal}</label></div><ActionControls text={text} password={password} reason={reason} working={working} onPassword={setPassword} onReason={setReason} onReauth={reauthenticate} onAction={updateRequest} actionLabel={text.save} /></section> : null}
    <section className="space-y-3"><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-orange-500" /><h2 className="text-xl font-semibold">{text.governance}</h2></div><div className="grid gap-4 xl:grid-cols-2"><SimpleTable headers={[text.provider, text.purpose, text.review]} rows={processors.map((item) => [item.provider, item.purpose, item.review])} /><SimpleTable headers={[text.provider, text.destination, text.mechanism]} rows={transfers.map((item) => [item.provider, item.destination, item.mechanism])} /></div></section>
    <section className="grid gap-4 xl:grid-cols-[1fr_420px]"><div className="space-y-3"><div className="flex items-center gap-2"><Database className="size-5 text-orange-500" /><h2 className="text-xl font-semibold">{text.retention}</h2></div><p className="text-sm text-slate-500">{text.retentionVersion}: {overview?.retentionPolicyVersion ?? "-"}</p><SimpleTable headers={["Category", "Days", "Action"]} rows={(retention?.catalog ?? []).map((item) => [item.category, item.days ?? "-", item.action])} /><h3 className="font-semibold">{text.recentRuns}</h3><SimpleTable headers={["Status", "Dry run", "Started"]} rows={(retention?.runs ?? []).map((item) => [item.status, String(item.dryRun), formatDate(item.startedAt, locale)])} /></div><ActionControls text={text} password={password} reason={reason} working={working} onPassword={setPassword} onReason={setReason} onReauth={reauthenticate} onAction={runRetentionDryRun} actionLabel={text.dryRun} /></section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">{text.incidents}</h2><div className="grid gap-4 xl:grid-cols-3"><SimpleTable headers={["Breach", text.status, "Risk"]} rows={breaches.map((item) => [item.publicId, item.status, item.riskLevel])} /><SimpleTable headers={["DPIA", "Risk", text.review]} rows={dpias.map((item) => [item.publicId, item.residualRisk, item.legalReviewStatus])} /><SimpleTable headers={["Hold", text.status, text.reason]} rows={holds.map((item) => [item.publicId, item.status, item.reason])} /></div></section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">{text.legalDocuments}</h2><SimpleTable headers={[text.type, text.version, text.locale, text.status, text.source, text.active]} rows={legalDocuments.map((item) => [item.type, item.version, item.locale, item.status, item.sourcePath, item.active])} /></section>
  </div>;
}

function ActionControls({ text, password, reason, working, onPassword, onReason, onReauth, onAction, actionLabel }: { text: typeof copy.tr | typeof copy.en; password: string; reason: string; working: boolean; onPassword: (value: string) => void; onReason: (value: string) => void; onReauth: () => void; onAction: () => void; actionLabel: string }) {
  return <div className="space-y-3 border-s p-4"><input type="password" value={password} onChange={(event) => onPassword(event.target.value)} placeholder={text.password} className="min-h-11 w-full rounded-md border px-3" /><button type="button" disabled={working || !password} onClick={onReauth} className="min-h-11 w-full rounded-md border px-3 text-sm font-semibold disabled:opacity-50">{text.reauth}</button><textarea value={reason} onChange={(event) => onReason(event.target.value)} placeholder={text.reason} className="min-h-24 w-full rounded-md border p-3" /><button type="button" disabled={working || reason.trim().length < 5} onClick={onAction} className="min-h-11 w-full rounded-md bg-orange-500 px-3 text-sm font-semibold text-white disabled:opacity-50">{actionLabel}</button></div>;
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: unknown[][] }) {
  return <div className="overflow-x-auto border bg-white"><table className="w-full text-left text-sm"><thead className="border-b bg-slate-50 text-xs text-slate-500"><tr>{headers.map((header) => <th key={header} className="p-3">{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b last:border-0">{row.map((value, index) => <td key={index} className="max-w-80 p-3 align-top">{display(value)}</td>)}</tr>)}</tbody></table>{!rows.length ? <p className="p-6 text-center text-sm text-slate-500">-</p> : null}</div>;
}

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatDate(value: unknown, locale: string) {
  if (typeof value !== "string" && !(value instanceof Date)) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
