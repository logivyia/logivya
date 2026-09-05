"use client";
import { AdminInteractiveTable } from "./admin-interactive-table";
import { AdminRecordDialog } from "./admin-record-dialog";
import { AdminMetricCard } from "./admin-metric-card";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Database,
  FileLock2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { apiErrorMessage } from "@/i18n/api-error";
import { useI18n } from "@/i18n/provider";

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
type DeletionJob = {
  publicId: string;
  scope: string;
  status: string;
  cancelUntil: string;
  scheduledFor: string;
  completedAt?: string | null;
  lastError?: string | null;
  result?: RecordValue | null;
  user: { name?: string | null; email: string };
  company: { name: string };
  request?: { publicId: string; status: string; legalHold: boolean } | null;
};

const requestStatuses = [
  "RECEIVED",
  "VERIFYING",
  "IDENTITY_VERIFICATION_REQUIRED",
  "IN_REVIEW",
  "WAITING_FOR_USER",
  "PROCESSING",
  "APPROVED",
  "PARTIALLY_APPROVED",
  "COMPLETED",
  "REJECTED",
  "CANCELED",
  "CLOSED",
];
const deletionConfirmation = "I CONFIRM DATA DELETION IS COMPLETE";
const deletionCopy = {
  tr: {
    title: "Hesap silme operasyonu",
    help: "Otomatik silme kapalıdır. İşi işleme alın; gerçek silme veya anonimleştirme tamamlandıktan sonra kanıt referansıyla kapatın.",
    jobId: "İş No",
    scope: "Kapsam",
    cancellation: "İptal süresi",
    operation: "Operasyon",
    start: "İşleme al",
    block: "Engelle",
    complete: "Tamamlandı olarak doğrula",
    resend: "Bildirimi tekrar gönder",
    evidence: "Silme/anonimleştirme kanıt referansı",
    confirmation: "Tamamlama doğrulama metni",
    completionWarning:
      "Bu işlem veriyi otomatik silmez. Yalnızca gerçek silme veya anonimleştirme tamamlandıktan sonra doğrulayın.",
    select: "Bir silme işi seçin.",
    loadMore: "Daha fazla silme işi yükle",
    loadingMore: "Silme işleri yükleniyor...",
  },
  en: {
    title: "Account deletion operations",
    help: "Automatic deletion is disabled. Start the job, then close it with an evidence reference only after deletion or anonymization is actually complete.",
    jobId: "Job ID",
    scope: "Scope",
    cancellation: "Cancellation until",
    operation: "Operation",
    start: "Start processing",
    block: "Block",
    complete: "Verify completion",
    resend: "Resend notice",
    evidence: "Deletion/anonymization evidence reference",
    confirmation: "Completion confirmation text",
    completionWarning:
      "This action does not delete data automatically. Verify it only after deletion or anonymization is actually complete.",
    select: "Select a deletion job.",
    loadMore: "Load more deletion jobs",
    loadingMore: "Loading deletion jobs...",
  },
} as const;

const copy = {
  tr: {
    eyebrow: "Gizlilik yönetişimi",
    title: "Gizlilik Merkezi",
    description:
      "Veri sahibi talepleri, saklama, dışa aktarma, silme, ihlal ve DPIA süreçlerinin denetlenebilir görünümü.",
    legal:
      "Bu merkezdeki hukuki süreler, aktarım mekanizmaları ve taslak metinler için hukuk incelemesi gereklidir.",
    legalRequired: "HUKUK İNCELEMESİ GEREKLİ",
    refresh: "Yenile",
    requests: "Veri talepleri",
    requestId: "Talep No",
    exports: "Dışa aktarmalar",
    deletions: "Silme işleri",
    holds: "Aktif hukuki saklama",
    breaches: "Açık ihlaller",
    dpias: "İnceleme bekleyen DPIA",
    requester: "Talep sahibi",
    company: "Çalışma alanı",
    type: "Tür",
    status: "Durum",
    deadline: "Son tarih",
    actions: "İşlem",
    open: "Aç",
    noRecords: "Kayıt bulunamadı.",
    governance: "İşleyenler ve uluslararası aktarımlar",
    provider: "Sağlayıcı",
    purpose: "Amaç",
    review: "İnceleme",
    destination: "Hedef",
    mechanism: "Mekanizma",
    retention: "Saklama politikası",
    dryRun: "Saklama dry-run çalıştır",
    reason: "İşlem gerekçesi",
    reauth: "Yöneticiyi yeniden doğrula",
    password: "Yönetici parolası",
    updateRequest: "Talebi güncelle",
    response: "Kullanıcıya yanıt",
    summary: "Sonuç özeti",
    internal: "Yalnızca iç not",
    save: "Kaydet",
    incidents: "İhlaller, DPIA ve hukuki saklamalar",
    loading: "Gizlilik verileri yükleniyor...",
    failed: "Gizlilik Merkezi yüklenemedi.",
    success: "İşlem tamamlandı.",
    select: "Bir talep seçin.",
    retentionVersion: "Saklama sürümü",
    recentRuns: "Son saklama çalıştırmaları",
    category: "Kategori",
    days: "Gün",
    dryRunColumn: "Deneme çalıştırması",
    started: "Başlangıç",
    breach: "İhlal",
    risk: "Risk",
    dpia: "DPIA",
    hold: "Hukuki saklama",
    yes: "Evet",
    no: "Hayır",
    legalDocuments: "Yasal belge sürümleri",
    version: "Sürüm",
    locale: "Dil",
    source: "Kaynak",
    active: "Aktif",
  },
  en: {
    eyebrow: "Privacy governance",
    title: "Privacy Center",
    description:
      "Auditable oversight for data-subject requests, retention, export, deletion, breach, and DPIA workflows.",
    legal:
      "Legal review is required for statutory timelines, transfer mechanisms, and draft legal text shown in this center.",
    legalRequired: "LEGAL REVIEW REQUIRED",
    refresh: "Refresh",
    requests: "Data requests",
    requestId: "Request ID",
    exports: "Exports",
    deletions: "Deletion jobs",
    holds: "Active legal holds",
    breaches: "Open breaches",
    dpias: "DPIAs requiring review",
    requester: "Requester",
    company: "Workspace",
    type: "Type",
    status: "Status",
    deadline: "Deadline",
    actions: "Action",
    open: "Open",
    noRecords: "No records found.",
    governance: "Processors and international transfers",
    provider: "Provider",
    purpose: "Purpose",
    review: "Review",
    destination: "Destination",
    mechanism: "Mechanism",
    retention: "Retention policy",
    dryRun: "Run retention dry-run",
    reason: "Action reason",
    reauth: "Reauthenticate administrator",
    password: "Administrator password",
    updateRequest: "Update request",
    response: "Response to user",
    summary: "Outcome summary",
    internal: "Internal note only",
    save: "Save",
    incidents: "Breaches, DPIAs, and legal holds",
    loading: "Loading privacy data...",
    failed: "Privacy Center could not be loaded.",
    success: "Action completed.",
    select: "Select a request.",
    retentionVersion: "Retention version",
    recentRuns: "Recent retention runs",
    category: "Category",
    days: "Days",
    dryRunColumn: "Dry run",
    started: "Started",
    breach: "Breach",
    risk: "Risk",
    dpia: "DPIA",
    hold: "Legal hold",
    yes: "Yes",
    no: "No",
    legalDocuments: "Legal document versions",
    version: "Version",
    locale: "Locale",
    source: "Source",
    active: "Active",
  },
} as const;

class AdminPrivacyApiError extends Error {
  constructor(readonly payload: Record<string, unknown>) {
    super(
      typeof payload.error === "string"
        ? payload.error
        : "ADMIN_PRIVACY_REQUEST_FAILED",
    );
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new AdminPrivacyApiError(body);
  return body as T;
}

function total(groups?: Array<{ _count: { _all: number } }>) {
  return groups?.reduce((sum, item) => sum + item._count._all, 0) ?? 0;
}

export function AdminPrivacyCenter({
  locale,
  canManage,
}: {
  locale: string;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const text = locale === "tr" ? copy.tr : copy.en;
  const deletionText = locale === "tr" ? deletionCopy.tr : deletionCopy.en;
  const [overview, setOverview] = useState<Overview | null>(null);
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [requestNextCursor, setRequestNextCursor] = useState<string | null>(
    null,
  );
  const [requestsLoadingMore, setRequestsLoadingMore] = useState(false);
  const [deletionJobs, setDeletionJobs] = useState<DeletionJob[]>([]);
  const [deletionNextCursor, setDeletionNextCursor] = useState<string | null>(
    null,
  );
  const [deletionsLoadingMore, setDeletionsLoadingMore] = useState(false);
  const [processors, setProcessors] = useState<RecordValue[]>([]);
  const [transfers, setTransfers] = useState<RecordValue[]>([]);
  const [retention, setRetention] = useState<{
    catalog: RecordValue[];
    runs: RecordValue[];
    enforcementEnabled: boolean;
  } | null>(null);
  const [breaches, setBreaches] = useState<RecordValue[]>([]);
  const [dpias, setDpias] = useState<RecordValue[]>([]);
  const [holds, setHolds] = useState<RecordValue[]>([]);
  const [legalDocuments, setLegalDocuments] = useState<RecordValue[]>([]);
  const [selected, setSelected] = useState<PrivacyRequest | null>(null);
  const [selectedDeletion, setSelectedDeletion] = useState<DeletionJob | null>(
    null,
  );
  const [deletionAction, setDeletionAction] = useState<
    "START_PROCESSING" | "BLOCK" | "COMPLETE" | "RESEND_NOTICE"
  >("START_PROCESSING");
  const [deletionReason, setDeletionReason] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [completionConfirmation, setCompletionConfirmation] = useState("");
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
      const [
        overviewData,
        requestData,
        deletionData,
        processorData,
        transferData,
        retentionData,
        breachData,
        dpiaData,
        holdData,
        legalDocumentData,
      ] = await Promise.all([
        api<Overview>("/api/admin/privacy/overview"),
        api<{ requests: PrivacyRequest[]; nextCursor: string | null }>(
          "/api/admin/privacy/requests?take=50",
        ),
        api<{ jobs: DeletionJob[]; nextCursor: string | null }>(
          "/api/admin/privacy/deletions?take=50",
        ),
        api<{ processors: RecordValue[] }>("/api/admin/privacy/processors"),
        api<{ transfers: RecordValue[] }>("/api/admin/privacy/transfers"),
        api<{
          catalog: RecordValue[];
          runs: RecordValue[];
          enforcementEnabled: boolean;
        }>("/api/admin/privacy/retention"),
        api<{ breaches: RecordValue[] }>("/api/admin/privacy/breaches"),
        api<{ dpias: RecordValue[] }>("/api/admin/privacy/dpia"),
        api<{ holds: RecordValue[] }>("/api/admin/privacy/legal-holds"),
        api<{ documents: RecordValue[] }>("/api/admin/privacy/legal-documents"),
      ]);
      setOverview(overviewData);
      setRequests(requestData.requests);
      setRequestNextCursor(requestData.nextCursor);
      setDeletionJobs(deletionData.jobs);
      setDeletionNextCursor(deletionData.nextCursor);
      setProcessors(processorData.processors);
      setTransfers(transferData.transfers);
      setRetention(retentionData);
      setBreaches(breachData.breaches);
      setDpias(dpiaData.dpias);
      setHolds(holdData.holds);
      setLegalDocuments(legalDocumentData.documents);
    } catch (caught) {
      setError(privacyErrorMessage(caught, t, text.failed));
    } finally {
      setLoading(false);
    }
  }, [t, text.failed]);

  async function loadMoreRequests() {
    if (!requestNextCursor || requestsLoadingMore) return;
    setRequestsLoadingMore(true);
    setError(null);
    try {
      const data = await api<{
        requests: PrivacyRequest[];
        nextCursor: string | null;
      }>(
        `/api/admin/privacy/requests?take=50&cursor=${encodeURIComponent(requestNextCursor)}`,
      );
      setRequests((current) => [
        ...current,
        ...data.requests.filter(
          (candidate) =>
            !current.some((item) => item.publicId === candidate.publicId),
        ),
      ]);
      setRequestNextCursor(data.nextCursor);
    } catch (caught) {
      setError(privacyErrorMessage(caught, t, text.failed));
    } finally {
      setRequestsLoadingMore(false);
    }
  }

  async function loadMoreDeletions() {
    if (!deletionNextCursor || deletionsLoadingMore) return;
    setDeletionsLoadingMore(true);
    setError(null);
    try {
      const data = await api<{
        jobs: DeletionJob[];
        nextCursor: string | null;
      }>(
        `/api/admin/privacy/deletions?take=50&cursor=${encodeURIComponent(deletionNextCursor)}`,
      );
      setDeletionJobs((current) => [
        ...current,
        ...data.jobs.filter(
          (candidate) =>
            !current.some((item) => item.publicId === candidate.publicId),
        ),
      ]);
      setDeletionNextCursor(data.nextCursor);
    } catch (caught) {
      setError(privacyErrorMessage(caught, t, text.failed));
    } finally {
      setDeletionsLoadingMore(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const metrics = useMemo(
    () =>
      overview
        ? [
            [text.requests, total(overview.requests)],
            [text.exports, total(overview.exports)],
            [text.deletions, total(overview.deletions)],
            [text.holds, overview.activeLegalHolds],
            [text.breaches, overview.openBreaches],
            [text.dpias, overview.dpiasRequiringReview],
          ]
        : [],
    [overview, text],
  );

  async function reauthenticate() {
    if (!canManage) return;
    setWorking(true);
    setNotice(null);
    setError(null);
    try {
      await api("/api/admin/security/re-auth", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      setNotice(text.success);
    } catch (caught) {
      setError(privacyErrorMessage(caught, t, text.failed));
    } finally {
      setWorking(false);
    }
  }

  async function updateRequest() {
    if (!canManage) return;
    if (!selected) return setError(text.select);
    setWorking(true);
    setNotice(null);
    setError(null);
    try {
      await api(
        `/api/admin/privacy/requests/${encodeURIComponent(selected.publicId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status,
            reason,
            response: response || undefined,
            responseSummary: summary || undefined,
            internal,
          }),
        },
      );
      setNotice(text.success);
      setReason("");
      setResponse("");
      setSummary("");
      setSelected(null);
      await load();
    } catch (caught) {
      setError(privacyErrorMessage(caught, t, text.failed));
    } finally {
      setWorking(false);
    }
  }

  async function runRetentionDryRun() {
    if (!canManage) return;
    setWorking(true);
    setNotice(null);
    setError(null);
    try {
      await api("/api/admin/privacy/retention", {
        method: "POST",
        body: JSON.stringify({ dryRun: true, reason }),
      });
      setNotice(text.success);
      setReason("");
      await load();
    } catch (caught) {
      setError(privacyErrorMessage(caught, t, text.failed));
    } finally {
      setWorking(false);
    }
  }

  async function operateDeletion() {
    if (!canManage) return;
    if (!selectedDeletion) return setError(deletionText.select);
    if (
      deletionAction === "COMPLETE" &&
      completionConfirmation !== deletionConfirmation
    )
      return setError(
        locale === "tr"
          ? "Tamamlama doğrulama metnini ekranda gösterildiği biçimde yazın."
          : "Enter the completion confirmation exactly as shown.",
      );
    if (deletionAction === "COMPLETE" && evidenceReference.trim().length < 8)
      return setError(
        locale === "tr"
          ? "En az 8 karakterlik silme veya anonimleştirme kanıt referansı girin."
          : "Enter a deletion or anonymization evidence reference of at least 8 characters.",
      );
    setWorking(true);
    setNotice(null);
    setError(null);
    try {
      await api(
        `/api/admin/privacy/deletions/${encodeURIComponent(selectedDeletion.publicId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            action: deletionAction,
            reason: deletionReason,
            ...(deletionAction === "COMPLETE"
              ? { evidenceReference, confirmation: completionConfirmation }
              : {}),
          }),
        },
      );
      setNotice(text.success);
      setDeletionReason("");
      setEvidenceReference("");
      setCompletionConfirmation("");
      setSelectedDeletion(null);
      await load();
    } catch (caught) {
      setError(privacyErrorMessage(caught, t, text.failed));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="min-w-0 max-w-full space-y-6 overflow-x-hidden">
      <header className="flex flex-col gap-4 border-b pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-orange-600">
            {text.eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-semibold">{text.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            {text.description}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border bg-white px-4 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw className="size-4" />
          {text.refresh}
        </button>
      </header>
      <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div>
          <b>{text.legalRequired}</b>
          <p className="mt-1">{text.legal}</p>
        </div>
      </div>
      {error ? (
        <p className="border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">
          {notice}
        </p>
      ) : null}
      {loading && !overview ? (
        <p className="py-12 text-center text-sm text-slate-500">
          {text.loading}
        </p>
      ) : null}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {metrics.map(([label,value],index) => <AdminMetricCard key={String(label)} label={String(label)} value={String(value ?? "-")} onClick={() => document.getElementById(index === 2 ? "privacy-deletions" : index >= 3 ? "privacy-incidents" : "privacy-requests")?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"})} />)}
      </section>
      <section id="privacy-requests" className="scroll-mt-24 space-y-3">
        <div className="flex items-center gap-2">
          <FileLock2 className="size-5 text-orange-500" />
          <h2 className="text-xl font-semibold">{text.requests}</h2>
        </div>
        <div className="min-w-0 max-w-full overflow-x-auto border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs text-slate-500">
              <tr>
                <th scope="col" className="p-3">
                  {text.requestId}
                </th>
                <th scope="col" className="p-3">
                  {text.requester}
                </th>
                <th scope="col" className="p-3">
                  {text.company}
                </th>
                <th scope="col" className="p-3">
                  {text.type}
                </th>
                <th scope="col" className="p-3">
                  {text.status}
                </th>
                <th scope="col" className="p-3">
                  {text.deadline}
                </th>
                {canManage ? (
                  <th scope="col" className="p-3">
                    {text.actions}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {requests.map((item) => (
                <tr key={item.publicId} className="border-b last:border-0">
                  <td className="p-3 font-mono text-xs">{item.publicId}</td>
                  <td className="p-3">{item.user?.email ?? "-"}</td>
                  <td className="p-3">{item.company?.name ?? "-"}</td>
                  <td className="p-3">{readableEnum(item.type, locale)}</td>
                  <td className="p-3">
                    {readableEnum(item.status, locale)}
                    {item.legalHold
                      ? ` / ${locale === "tr" ? "Hukuki saklama" : "Legal hold"}`
                      : ""}
                  </td>
                  <td className="p-3">{formatDate(item.deadlineAt, locale)}</td>
                  {canManage ? (
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(item);
                          setStatus(item.status);
                        }}
                        className="font-semibold text-orange-600"
                      >
                        {text.open}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {!requests.length ? (
            <p className="p-8 text-center text-sm text-slate-500">
              {text.noRecords}
            </p>
          ) : null}
          {requestNextCursor ? (
            <div className="border-t p-4 text-center">
              <button
                type="button"
                disabled={requestsLoadingMore}
                onClick={() => void loadMoreRequests()}
                className="min-h-11 rounded-lg border px-4 text-sm font-semibold text-slate-800 disabled:opacity-50"
              >
                {requestsLoadingMore
                  ? text.loading
                  : locale === "tr"
                    ? "Daha fazla talep yükle"
                    : "Load more requests"}
              </button>
            </div>
          ) : null}
        </div>
      </section>
      {canManage && selected ? (
        <AdminRecordDialog open title={selected.publicId} onClose={() => { if (!working) { setSelected(null); setPassword(""); } }}><section className="grid gap-4 lg:grid-cols-2">{error ? <p role="alert" className="text-sm text-red-700 lg:col-span-2">{error}</p> : null}
          <div className="space-y-3">
            <h2 className="font-semibold">
              {text.updateRequest}: {selected.publicId}
            </h2>
            <select
              value={status}
              aria-label={text.status}
              onChange={(event) => setStatus(event.target.value)}
              className="min-h-11 w-full rounded-md border px-3"
            >
              {requestStatuses.map((item) => (
                <option key={item} value={item}>
                  {readableEnum(item, locale)}
                </option>
              ))}
            </select>
            <textarea
              value={response}
              aria-label={text.response}
              onChange={(event) => setResponse(event.target.value)}
              placeholder={text.response}
              className="min-h-24 w-full rounded-md border p-3"
            />
            <textarea
              value={summary}
              aria-label={text.summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder={text.summary}
              className="min-h-20 w-full rounded-md border p-3"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={internal}
                onChange={(event) => setInternal(event.target.checked)}
              />
              {text.internal}
            </label>
          </div>
          <ActionControls
            text={text}
            password={password}
            reason={reason}
            working={working}
            onPassword={setPassword}
            onReason={setReason}
            onReauth={reauthenticate}
            onAction={updateRequest}
            actionLabel={text.save}
          />
        </section></AdminRecordDialog>
      ) : null}
      <section id="privacy-deletions" className="scroll-mt-24 space-y-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <FileLock2 className="size-5 text-orange-500" />
            <h2 className="text-xl font-semibold">{deletionText.title}</h2>
          </div>
          <p className="text-sm text-slate-500">{deletionText.help}</p>
        </div>
        <div className="min-w-0 max-w-full overflow-x-auto border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs text-slate-500">
              <tr>
                <th scope="col" className="p-3">
                  {deletionText.jobId}
                </th>
                <th scope="col" className="p-3">
                  {text.requester}
                </th>
                <th scope="col" className="p-3">
                  {text.company}
                </th>
                <th scope="col" className="p-3">
                  {deletionText.scope}
                </th>
                <th scope="col" className="p-3">
                  {text.status}
                </th>
                <th scope="col" className="p-3">
                  {deletionText.cancellation}
                </th>
                {canManage ? (
                  <th scope="col" className="p-3">
                    {text.actions}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {deletionJobs.map((item) => (
                <tr key={item.publicId} className="border-b last:border-0">
                  <td className="p-3 font-mono text-xs">{item.publicId}</td>
                  <td className="p-3">{item.user.email}</td>
                  <td className="p-3">{item.company.name}</td>
                  <td className="p-3">{readableEnum(item.scope, locale)}</td>
                  <td className="p-3">
                    {readableEnum(item.status, locale)}
                    {item.request?.legalHold
                      ? ` / ${locale === "tr" ? "Hukuki saklama" : "Legal hold"}`
                      : ""}
                  </td>
                  <td className="p-3">
                    {formatDate(item.cancelUntil, locale)}
                  </td>
                  {canManage ? (
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDeletion(item);
                          setDeletionAction(
                            item.status === "COMPLETED"
                              ? "RESEND_NOTICE"
                              : item.status === "PROCESSING"
                                ? "COMPLETE"
                                : "START_PROCESSING",
                          );
                        }}
                        className="font-semibold text-orange-600"
                      >
                        {text.open}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {!deletionJobs.length ? (
            <p className="p-8 text-center text-sm text-slate-500">
              {text.noRecords}
            </p>
          ) : null}
        </div>
        {deletionNextCursor ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void loadMoreDeletions()}
              disabled={deletionsLoadingMore}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-wait disabled:opacity-60"
            >
              {deletionsLoadingMore
                ? deletionText.loadingMore
                : deletionText.loadMore}
            </button>
          </div>
        ) : null}
      </section>
      {canManage && selectedDeletion ? (
        <AdminRecordDialog open title={selectedDeletion.publicId} onClose={() => { if (!working) { setSelectedDeletion(null); setPassword(""); } }}><section className="grid gap-4 lg:grid-cols-2">{error ? <p role="alert" className="text-sm text-red-700 lg:col-span-2">{error}</p> : null}
          <div className="space-y-3">
            <h2 className="font-semibold">
              {deletionText.operation}: {selectedDeletion.publicId}
            </h2>
            <select
              value={deletionAction}
              aria-label={deletionText.operation}
              onChange={(event) =>
                setDeletionAction(event.target.value as typeof deletionAction)
              }
              className="min-h-11 w-full rounded-md border px-3"
            >
              <option value="START_PROCESSING">{deletionText.start}</option>
              <option value="BLOCK">{deletionText.block}</option>
              <option value="COMPLETE">{deletionText.complete}</option>
              <option value="RESEND_NOTICE">{deletionText.resend}</option>
            </select>
            {deletionAction === "COMPLETE" ? (
              <>
                <p className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                  {deletionText.completionWarning}
                </p>
                <input
                  value={evidenceReference}
                  aria-label={deletionText.evidence}
                  onChange={(event) => setEvidenceReference(event.target.value)}
                  placeholder={deletionText.evidence}
                  className="min-h-11 w-full rounded-md border px-3"
                />
                <input
                  value={completionConfirmation}
                  aria-label={deletionText.confirmation}
                  onChange={(event) =>
                    setCompletionConfirmation(event.target.value)
                  }
                  placeholder={deletionText.confirmation}
                  className="min-h-11 w-full rounded-md border px-3 font-mono text-xs"
                />
                <p className="text-xs text-slate-500">{deletionConfirmation}</p>
              </>
            ) : null}
          </div>
          <ActionControls
            text={text}
            password={password}
            reason={deletionReason}
            working={working}
            onPassword={setPassword}
            onReason={setDeletionReason}
            onReauth={reauthenticate}
            onAction={operateDeletion}
            actionLabel={
              deletionAction === "START_PROCESSING"
                ? deletionText.start
                : deletionAction === "BLOCK"
                  ? deletionText.block
                  : deletionAction === "COMPLETE"
                    ? deletionText.complete
                    : deletionText.resend
            }
          />
        </section></AdminRecordDialog>
      ) : null}
      <section id="privacy-governance" className="scroll-mt-24 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-orange-500" />
          <h2 className="text-xl font-semibold">{text.governance}</h2>
        </div>
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <SimpleTable
            headers={[text.provider, text.purpose, text.review]}
            rows={processors.map((item) => [
              item.provider,
              readableEnum(String(item.purpose ?? ""), locale),
              readableEnum(String(item.review ?? ""), locale),
            ])}
          />
          <SimpleTable
            headers={[text.provider, text.destination, text.mechanism]}
            rows={transfers.map((item) => [
              item.provider,
              readableEnum(String(item.destination ?? ""), locale),
              readableEnum(String(item.mechanism ?? ""), locale),
            ])}
          />
        </div>
      </section>
      <section
        className={`grid min-w-0 gap-4 ${canManage ? "xl:grid-cols-[minmax(0,1fr)_420px]" : ""}`}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Database className="size-5 text-orange-500" />
            <h2 className="text-xl font-semibold">{text.retention}</h2>
          </div>
          <p className="text-sm text-slate-500">
            {text.retentionVersion}: {overview?.retentionPolicyVersion ?? "-"}
          </p>
          <SimpleTable
            headers={[text.category, text.days, text.actions]}
            rows={(retention?.catalog ?? []).map((item) => [
              readableEnum(String(item.category ?? ""), locale),
              item.days ?? "-",
              readableEnum(String(item.action ?? ""), locale),
            ])}
          />
          <h3 className="font-semibold">{text.recentRuns}</h3>
          <SimpleTable
            headers={[text.status, text.dryRunColumn, text.started]}
            rows={(retention?.runs ?? []).map((item) => [
              readableEnum(String(item.status ?? ""), locale),
              item.dryRun === true ? text.yes : text.no,
              formatDate(item.startedAt, locale),
            ])}
          />
        </div>
        {canManage ? (
          <ActionControls
            text={text}
            password={password}
            reason={reason}
            working={working}
            onPassword={setPassword}
            onReason={setReason}
            onReauth={reauthenticate}
            onAction={runRetentionDryRun}
            actionLabel={text.dryRun}
          />
        ) : null}
      </section>
      <section id="privacy-incidents" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl font-semibold">{text.incidents}</h2>
        <div className="grid min-w-0 gap-4 xl:grid-cols-3">
          <SimpleTable
            headers={[text.breach, text.status, text.risk]}
            rows={breaches.map((item) => [
              item.publicId,
              readableEnum(String(item.status ?? ""), locale),
              readableEnum(String(item.riskLevel ?? ""), locale),
            ])}
          />
          <SimpleTable
            headers={[text.dpia, text.risk, text.review]}
            rows={dpias.map((item) => [
              item.publicId,
              readableEnum(String(item.residualRisk ?? ""), locale),
              readableEnum(String(item.legalReviewStatus ?? ""), locale),
            ])}
          />
          <SimpleTable
            headers={[text.hold, text.status, text.reason]}
            rows={holds.map((item) => [
              item.publicId,
              readableEnum(String(item.status ?? ""), locale),
              item.reason,
            ])}
          />
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{text.legalDocuments}</h2>
        <SimpleTable
          headers={[
            text.type,
            text.version,
            text.locale,
            text.status,
            text.source,
            text.active,
          ]}
          rows={legalDocuments.map((item) => [
            readableEnum(String(item.type ?? ""), locale),
            item.version,
            item.locale,
            readableEnum(String(item.status ?? ""), locale),
            item.sourcePath,
            item.active === true ? text.yes : text.no,
          ])}
        />
      </section>
    </div>
  );
}

function ActionControls({
  text,
  password,
  reason,
  working,
  onPassword,
  onReason,
  onReauth,
  onAction,
  actionLabel,
}: {
  text: typeof copy.tr | typeof copy.en;
  password: string;
  reason: string;
  working: boolean;
  onPassword: (value: string) => void;
  onReason: (value: string) => void;
  onReauth: () => void;
  onAction: () => void;
  actionLabel: string;
}) {
  return (
    <div className="space-y-3 border-s p-4">
      <input
        type="password"
        value={password}
        aria-label={text.password}
        onChange={(event) => onPassword(event.target.value)}
        placeholder={text.password}
        className="min-h-11 w-full rounded-md border px-3"
      />
      <button
        type="button"
        disabled={working || !password}
        onClick={onReauth}
        className="min-h-11 w-full rounded-md border px-3 text-sm font-semibold disabled:opacity-50"
      >
        {text.reauth}
      </button>
      <textarea
        value={reason}
        aria-label={text.reason}
        onChange={(event) => onReason(event.target.value)}
        placeholder={text.reason}
        className="min-h-24 w-full rounded-md border p-3"
      />
      <button
        type="button"
        disabled={working || reason.trim().length < 5}
        onClick={onAction}
        className="min-h-11 w-full rounded-md bg-orange-500 px-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function SimpleTable({headers,rows}: {headers:string[];rows:unknown[][]}) {return <AdminInteractiveTable headers={headers} rows={rows.map(row => row.map(display))} />;}

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function privacyErrorMessage(
  error: unknown,
  t: ReturnType<typeof useI18n>["t"],
  fallback: string,
) {
  if (!(error instanceof AdminPrivacyApiError))
    return error instanceof Error ? error.message : fallback;
  const translated = apiErrorMessage(t, error.payload);
  return translated === t("errors.generic") ? fallback : translated;
}

function readableEnum(value: string, locale: string) {
  const normalized = value.trim();
  if (!normalized) return "-";
  const translations = locale === "tr" ? enumLabels.tr : enumLabels.en;
  const translated = translations[normalized as keyof typeof translations];
  if (translated) return translated;
  return value
    .replaceAll("_", " ")
    .toLocaleLowerCase(locale)
    .replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase(locale));
}

const enumLabels = {
  tr: {
    ACCESS: "Erişim",
    EXPORT: "Dışa aktarma",
    RECTIFICATION: "Düzeltme",
    DELETION: "Silme",
    INFORMATION: "Bilgi",
    RESTRICTION: "İşlemeyi kısıtlama",
    OBJECTION: "İtiraz",
    PORTABILITY: "Veri taşınabilirliği",
    CONSENT_WITHDRAWAL: "Rızanın geri alınması",
    AUTOMATED_DECISION_REVIEW: "Otomatik karar incelemesi",
    COMPLAINT: "Şikâyet",
    OTHER: "Diğer",
    REQUESTED: "Talep edildi",
    RECEIVED: "Alındı",
    VERIFYING: "Doğrulanıyor",
    IDENTITY_VERIFICATION_REQUIRED: "Kimlik doğrulaması gerekli",
    IN_REVIEW: "İncelemede",
    WAITING_FOR_USER: "Kullanıcı bekleniyor",
    PROCESSING: "İşleniyor",
    APPROVED: "Onaylandı",
    PARTIALLY_APPROVED: "Kısmen onaylandı",
    COMPLETED: "Tamamlandı",
    REJECTED: "Reddedildi",
    CANCELED: "İptal edildi",
    CLOSED: "Kapatıldı",
    QUEUED: "Sırada",
    READY: "Hazır",
    FAILED: "Başarısız",
    EXPIRED: "Süresi doldu",
    BLOCKED: "Engellendi",
    MEMBERSHIP: "Üyelik",
    USER: "Kullanıcı",
    COMPANY: "Çalışma alanı",
    DRAFT: "Taslak",
    LEGAL_REVIEW_REQUIRED: "Hukuk incelemesi gerekli",
    PROVIDER_REGION_CONFIRMATION_REQUIRED: "Sağlayıcı bölgesi doğrulanmalı",
    DPA_AND_TRANSFER_ASSESSMENT_REQUIRED:
      "Veri işleme ve aktarım değerlendirmesi gerekli",
    RETIRED: "Kullanımdan kaldırıldı",
    ACTIVE: "Aktif",
    OPEN: "Açık",
    RUNNING: "Çalışıyor",
    LOW: "Düşük",
    MEDIUM: "Orta",
    HIGH: "Yüksek",
    CRITICAL: "Kritik",
    ASSESSMENT_REQUIRED: "Değerlendirme gerekli",
    "privacy-export-object": "Gizlilik dışa aktarma nesnesi",
    "privacy-export-job-metadata": "Dışa aktarma işi üst verisi",
    "privacy-request": "Gizlilik talebi",
    "consent-evidence": "Rıza kanıtı",
    "security-event": "Güvenlik olayı",
    "audit-log": "Denetim kaydı",
    "delete encrypted object and expire token":
      "Şifreli nesneyi sil ve erişim belirtecini geçersiz kıl",
    "minimize operational metadata": "Operasyon üst verisini en aza indir",
    "LEGAL REVIEW REQUIRED": "Hukuk incelemesi gerekli",
    "configured by SECURITY_EVENT_RETENTION_DAYS":
      "Güvenlik olayı saklama ayarına göre uygula",
    "LEGAL REVIEW REQUIRED; append-only":
      "Hukuk incelemesi gerekli; yalnızca eklenebilir kayıt",
    "Web ve API barindirma": "Web ve API barındırma",
    "WhatsApp worker barindirma": "WhatsApp işleyicisi barındırma",
    "Birincil veritabani": "Birincil veritabanı",
    "Kuyruk, kilit ve oran sinirlama": "Kuyruk, kilit ve oran sınırlama",
    "Sifreli yedek ve gizlilik disari aktarma nesneleri":
      "Şifreli yedek ve gizlilik dışa aktarma nesneleri",
    "Mobil bildirim teslimi": "Mobil bildirim teslimi",
    "Istege bagli urun analitigi": "İsteğe bağlı ürün analitiği",
    "Istege bagli hata tanilama": "İsteğe bağlı hata tanılama",
  },
  en: {
    ACCESS: "Access",
    EXPORT: "Export",
    RECTIFICATION: "Rectification",
    DELETION: "Deletion",
    INFORMATION: "Information",
    RESTRICTION: "Processing restriction",
    OBJECTION: "Objection",
    PORTABILITY: "Data portability",
    CONSENT_WITHDRAWAL: "Consent withdrawal",
    AUTOMATED_DECISION_REVIEW: "Automated decision review",
    COMPLAINT: "Complaint",
    OTHER: "Other",
    REQUESTED: "Requested",
    RECEIVED: "Received",
    VERIFYING: "Verifying",
    IDENTITY_VERIFICATION_REQUIRED: "Identity verification required",
    IN_REVIEW: "In review",
    WAITING_FOR_USER: "Waiting for user",
    PROCESSING: "Processing",
    APPROVED: "Approved",
    PARTIALLY_APPROVED: "Partially approved",
    COMPLETED: "Completed",
    REJECTED: "Rejected",
    CANCELED: "Canceled",
    CLOSED: "Closed",
    QUEUED: "Queued",
    READY: "Ready",
    FAILED: "Failed",
    EXPIRED: "Expired",
    BLOCKED: "Blocked",
    MEMBERSHIP: "Membership",
    USER: "User",
    COMPANY: "Workspace",
    DRAFT: "Draft",
    LEGAL_REVIEW_REQUIRED: "Legal review required",
    PROVIDER_REGION_CONFIRMATION_REQUIRED:
      "Provider region confirmation required",
    DPA_AND_TRANSFER_ASSESSMENT_REQUIRED:
      "DPA and transfer assessment required",
    RETIRED: "Retired",
    ACTIVE: "Active",
    OPEN: "Open",
    RUNNING: "Running",
    LOW: "Low",
    MEDIUM: "Medium",
    HIGH: "High",
    CRITICAL: "Critical",
    ASSESSMENT_REQUIRED: "Assessment required",
    "privacy-export-object": "Privacy export object",
    "privacy-export-job-metadata": "Privacy export job metadata",
    "privacy-request": "Privacy request",
    "consent-evidence": "Consent evidence",
    "security-event": "Security event",
    "audit-log": "Audit log",
    "delete encrypted object and expire token":
      "Delete encrypted object and expire access token",
    "minimize operational metadata": "Minimize operational metadata",
    "LEGAL REVIEW REQUIRED": "Legal review required",
    "configured by SECURITY_EVENT_RETENTION_DAYS":
      "Apply configured security-event retention period",
    "LEGAL REVIEW REQUIRED; append-only":
      "Legal review required; append-only record",
    "Web ve API barindirma": "Web and API hosting",
    "WhatsApp worker barindirma": "WhatsApp worker hosting",
    "Birincil veritabani": "Primary database",
    "Kuyruk, kilit ve oran sinirlama": "Queue, locking, and rate limiting",
    "Sifreli yedek ve gizlilik disari aktarma nesneleri":
      "Encrypted backup and privacy-export objects",
    "Mobil bildirim teslimi": "Mobile notification delivery",
    "Istege bagli urun analitigi": "Optional product analytics",
    "Istege bagli hata tanilama": "Optional error diagnostics",
  },
} as const;

function formatDate(value: unknown, locale: string) {
  if (typeof value !== "string" && !(value instanceof Date)) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
