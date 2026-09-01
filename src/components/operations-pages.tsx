"use client";

/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any */
import { Fragment, type FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Database,
  HeartPulse,
  LoaderCircle,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Server,
  ShieldAlert,
  Users,
  Wifi,
} from "lucide-react";

import { formatCurrency, formatDateTime, formatNumber } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";

const panel = "panel rounded-2xl p-5";
const button = "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const field = "w-full rounded-xl border bg-white px-3 py-3 text-sm outline-none";

function Loading() {
  return <div className="grid min-h-60 place-items-center"><LoaderCircle className="animate-spin text-primary" /></div>;
}

function Header({ title, description, eyebrow }: { title: string; description: string; eyebrow?: string }) {
  const { t } = useI18n();
  return (
    <header className="mb-7">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{eyebrow ?? t("operations.eyebrow")}</p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </header>
  );
}

function Metric({ label, value, Icon }: { label: string; value: string | number; Icon: typeof Activity }) {
  const { locale } = useI18n();
  return <div className={panel}><Icon className="mb-5 size-5 text-primary" /><p className="text-xs text-muted">{label}</p><p className="mt-1 text-2xl font-semibold">{typeof value === "number" ? formatNumber(value, locale) : value}</p></div>;
}

function localizedStatus(status: string | null | undefined, t: ReturnType<typeof useI18n>["t"]) {
  if (!status) return "-";
  const key = `status.${status.toLowerCase()}`;
  const translated = t(key);
  return translated === status.toLowerCase() ? status : translated;
}

export function SupportPage() {
  const { locale, t } = useI18n();
  const [tickets, setTickets] = useState<any[] | null>(null);
  const [status, setStatus] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/support/tickets");
    setTickets((await response.json()).tickets || []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/support/tickets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    setStatus(response.ok ? t("support.created") : t("support.createFailed"));
    if (response.ok) {
      event.currentTarget.reset();
      void load();
    }
  }

  const ticketTypes = ["whatsappConnection", "qrCode", "messageDelivery", "subscriptionPayment", "invoice", "technical", "other"];
  const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];

  return (
    <>
      <Header title={t("support.centerTitle")} description={t("support.centerDescription")} />
      <form onSubmit={submit} className={`${panel} mb-6 grid gap-3 md:grid-cols-2`}>
        <input required name="subject" placeholder={t("support.subject")} className={field} />
        <select name="type" className={field}>{ticketTypes.map((type) => <option key={type} value={type}>{t(`support.type.${type}`)}</option>)}</select>
        <select name="priority" className={field}>{priorities.map((priority) => <option key={priority} value={priority}>{t(`priority.${priority.toLowerCase()}`)}</option>)}</select>
        <textarea required name="message" placeholder={t("support.describeIssue")} className={`${field} min-h-28 md:col-span-2`} />
        <button className={button}><Plus className="me-2 inline size-4" />{t("support.create")}</button>
        {status ? <p className="self-center text-sm text-muted">{status}</p> : null}
      </form>
      {!tickets ? <Loading /> : (
        <div className="grid gap-4">
          {tickets.map((ticket) => (
            <article key={ticket.id} className={panel}>
              <div className="flex justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{ticket.subject}</h3>
                  <p className="mt-1 text-xs text-muted">{t(`support.type.${ticket.type}`)} · {ticket.createdBy.name} · {formatDateTime(ticket.createdAt, locale)}</p>
                </div>
                <span className="h-fit rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">{localizedStatus(ticket.status, t)}</span>
              </div>
              <p className="mt-4 text-sm text-muted">{ticket.messages[0]?.message}</p>
            </article>
          ))}
          {!tickets.length ? <p className="py-12 text-center text-sm text-muted">{t("support.empty")}</p> : null}
        </div>
      )}
    </>
  );
}

export function ActivityPage() {
  const { locale, t } = useI18n();
  const [logs, setLogs] = useState<any[] | null>(null);
  useEffect(() => { void fetch("/api/activity").then((response) => response.json()).then((value) => setLogs(value.logs || [])); }, []);
  return (
    <>
      <Header title={t("activity.title")} description={t("activity.description")} />
      {!logs ? <Loading /> : (
        <div className={panel}>
          {logs.map((log) => (
            <div key={log.id} className="flex gap-4 border-b py-4 last:border-0">
              <Activity className="mt-1 size-4 text-primary" />
              <div><b className="text-sm">{t(`activity.action.${log.action}`)}</b><p className="text-xs text-muted">{t(`entity.${String(log.entityType).toLowerCase()}`)} · {log.user?.name || t("common.system")} · {formatDateTime(log.createdAt, locale)}</p></div>
            </div>
          ))}
          {!logs.length ? <p className="py-12 text-center text-sm text-muted">{t("activity.empty")}</p> : null}
        </div>
      )}
    </>
  );
}

export function OnboardingPage() {
  const { t } = useI18n();
  const [data, setData] = useState<any>();
  useEffect(() => { void fetch("/api/onboarding").then((response) => response.json()).then((value) => setData(value.onboarding)); }, []);
  if (!data) return <Loading />;
  const items = [
    ["onboarding.company", data.companyProfileCompleted, "/settings/company"],
    ["onboarding.whatsapp", data.whatsappConnected, "/accounts"],
    ["onboarding.groups", data.groupsSynced, "/groups"],
    ["onboarding.category", data.categoryCreated, "/categories"],
    ["onboarding.message", data.firstMessageSent, "/send-message"],
  ] as const;
  const progress = Math.round((items.filter((item) => item[1]).length / items.length) * 100);
  return (
    <>
      <Header title={t("onboarding.title")} description={t("onboarding.description")} />
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <Link href="/accounts" className={`${panel} group transition hover:border-primary`}>
          <MessageSquare className="size-6 text-primary" />
          <h2 className="mt-4 font-semibold">{t("onboarding.guideConnectTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{t("onboarding.guideConnectDescription")}</p>
        </Link>
        <Link href="/categories" className={`${panel} group transition hover:border-primary`}>
          <Users className="size-6 text-primary" />
          <h2 className="mt-4 font-semibold">{t("onboarding.guideOrganizeTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{t("onboarding.guideOrganizeDescription")}</p>
        </Link>
        <Link href="/settings/security" className={`${panel} group transition hover:border-primary`}>
          <ShieldAlert className="size-6 text-primary" />
          <h2 className="mt-4 font-semibold">{t("onboarding.guideControlTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{t("onboarding.guideControlDescription")}</p>
        </Link>
      </div>
      <div className={`${panel} mb-5`}><div className="flex justify-between text-sm"><b>{t("onboarding.progress")}</b><span>{progress}%</span></div><div className="mt-3 h-2 rounded-full bg-primary-soft"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div></div>
      <div className="grid gap-3">{items.map(([labelKey, done, href]) => <a key={labelKey} href={href} className={`${panel} flex items-center gap-4 hover:border-primary`}><CheckCircle2 className={done ? "text-green-600" : "text-muted"} /><span className="font-medium">{t(labelKey)}</span><span className="ms-auto text-xs text-muted">{done ? t("common.completed") : t("common.continue")}</span></a>)}</div>
    </>
  );
}

export function AdminDashboardPage() {
  const { locale, t } = useI18n();
  const [data, setData] = useState<any>();
  useEffect(() => { void fetch("/api/admin/dashboard").then((response) => response.json()).then(setData); }, []);
  if (!data) return <Loading />;
  const metrics = data.metrics || {};
  return (
    <>
      <Header eyebrow={t("operations.eyebrow")} title={t("admin.dashboard.title")} description={t("admin.dashboard.description")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={t("admin.metrics.totalCompanies")} value={formatNumber(metrics.companies || 0, locale)} Icon={Building2} />
        <Metric label={t("admin.metrics.totalUsers")} value={formatNumber(metrics.users || 0, locale)} Icon={Users} />
        <Metric label={t("admin.metrics.pendingSubscriptions")} value={formatNumber(metrics.pendingSubscriptionRequests || 0, locale)} Icon={Activity} />
        <Metric label={t("admin.metrics.activeSubscriptions")} value={formatNumber(metrics.activeSubscriptions || 0, locale)} Icon={CheckCircle2} />
        <Metric label={t("admin.metrics.trials")} value={formatNumber(metrics.trials || 0, locale)} Icon={Activity} />
        <Metric label={t("admin.metrics.expiringSoon")} value={formatNumber(metrics.expiringInSevenDays || 0, locale)} Icon={Activity} />
        <Metric label={t("admin.metrics.approvedPayments")} value={formatCurrency(metrics.monthlyConfirmedPaymentTotal || 0, "TRY", locale)} Icon={Activity} />
        <Metric label={t("admin.metrics.connectedWhatsApp")} value={`${formatNumber(metrics.connected || 0, locale)} / ${formatNumber(metrics.accounts || 0, locale)}`} Icon={MessageSquare} />
        <Metric label={t("admin.metrics.totalCampaigns")} value={formatNumber(metrics.campaigns || 0, locale)} Icon={Send} />
        <Metric label={t("admin.metrics.totalMessages")} value={formatNumber(metrics.messages || 0, locale)} Icon={MessageSquare} />
      </div>
    </>
  );
}

export function AdminListPage({ titleKey, endpoint, kind }: { titleKey: string; endpoint: string; kind: string }) {
  const { locale, t } = useI18n();
  const [data, setData] = useState<any>();
  useEffect(() => { void fetch(endpoint).then((response) => response.json()).then(setData); }, [endpoint]);
  const rows = data?.[kind] || [];
  return (
    <>
      <Header title={t(titleKey)} description={t("admin.list.description")} />
      {!data ? <Loading /> : (
        <div className={`${panel} overflow-x-auto`}>
          <table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-3">{t("admin.list.record")}</th><th>{t("common.status")}</th><th>{t("admin.list.companyUser")}</th><th>{t("admin.list.date")}</th></tr></thead><tbody>{rows.map((row: any) => <tr key={row.id} className="border-b last:border-0"><td className="py-4 font-medium">{row.subject || row.action || row.type || row.invoiceNumber || row.id}</td><td>{localizedStatus(row.status || row.severity, t)}</td><td>{row.company?.name || row.createdBy?.email || row.user?.email || "-"}</td><td>{formatDateTime(row.createdAt || row.lastMessageAt, locale)}</td></tr>)}</tbody></table>
          {!rows.length ? <p className="py-12 text-center text-sm text-muted">{t("admin.list.empty")}</p> : null}
        </div>
      )}
    </>
  );
}

export function SystemHealthPage() {
  const { locale, t } = useI18n();
  const [data, setData] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/system/health", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "SYSTEM_HEALTH_LOAD_FAILED");
      setData(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "SYSTEM_HEALTH_LOAD_FAILED");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function updateIncidentStatus(id: string, status: string) {
    if (note.trim().length < 5) {
      setError(locale === "tr" ? "İşlem notu en az 5 karakter olmalıdır." : "The operation note must contain at least 5 characters.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/incidents/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, note: note.trim() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "INCIDENT_UPDATE_FAILED");
      setNote("");
      setSelectedIncident(null);
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "INCIDENT_UPDATE_FAILED");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) return <Loading />;
  const services = data?.services || [];
  const queues = data?.queues || [];
  const incidents = data?.incidents || [];
  const alerts = data?.alerts || [];
  const stateTone: Record<string, string> = {
    HEALTHY: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    DEGRADED: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    UNAVAILABLE: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
    UNKNOWN: "border-zinc-500/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
    MAINTENANCE: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  };
  const serviceIcons: Record<string, typeof Activity> = { api: Server, database: Database, redis: Wifi, queues: Activity, worker: Server, whatsapp: MessageSquare, messaging: Send, scheduler: Clock3, support: CircleHelp, email: Send, backups: Database, deployments: Activity };
  return (
    <>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <Header title={t("systemHealth.title")} description={t("systemHealth.description")} />
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50">
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          {locale === "tr" ? "Yenile" : "Refresh"}
        </button>
      </div>
      {error ? <div className="mb-5 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">{error}</div> : null}
      <section className="mb-6 flex flex-wrap items-center justify-between gap-4 border-y py-5">
        <div className="flex items-center gap-3">
          <HeartPulse className="size-7 text-primary" />
          <div><p className="text-xs font-semibold uppercase text-muted">{locale === "tr" ? "Genel platform durumu" : "Overall platform status"}</p><p className="mt-1 text-2xl font-semibold">{localizedStatus(data?.status || "UNKNOWN", t)}</p></div>
        </div>
        <div className="text-right text-xs text-muted"><p>{data?.release ? String(data.release).slice(0, 12) : "-"}</p><p>{data?.generatedAt ? formatDateTime(data.generatedAt, locale) : "-"}</p></div>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">{locale === "tr" ? "Servisler" : "Services"}</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {services.map((item: any) => {
            const Icon = serviceIcons[item.id] || Activity;
            const metricEntries = Object.entries(item.metrics || {}).slice(0, 4);
            return <article key={item.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3"><Icon className="size-5 text-primary" /><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${stateTone[item.state] || stateTone.UNKNOWN}`}>{localizedStatus(item.state, t)}</span></div>
              <h3 className="mt-4 font-semibold">{item.name}</h3>
              <p className="mt-1 min-h-10 text-xs leading-5 text-muted">{item.summary}</p>
              <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3 text-xs">
                <span className="text-muted">{locale === "tr" ? "Gecikme" : "Latency"}</span><span className="text-right font-medium">{item.latencyMs == null ? "-" : `${item.latencyMs} ms`}</span>
                <span className="text-muted">{locale === "tr" ? "Eğilim" : "Trend"}</span><span className="text-right font-medium">{localizedStatus(item.trend || "UNKNOWN", t)}</span>
                <span className="text-muted">{locale === "tr" ? "Son başarılı kontrol" : "Last successful check"}</span><span className="text-right font-medium">{item.lastSuccessfulCheckAt ? formatDateTime(item.lastSuccessfulCheckAt, locale) : "-"}</span>
                <span className="text-muted">{locale === "tr" ? "Son hata" : "Last failure"}</span><span className="text-right font-medium">{item.lastFailureAt ? formatDateTime(item.lastFailureAt, locale) : "-"}</span>
                <span className="text-muted">{locale === "tr" ? "Sürüm" : "Release"}</span><span className="break-all text-right font-medium">{item.release ? String(item.release).slice(0, 16) : "-"}</span>
                <span className="text-muted">{locale === "tr" ? "Hata kodu" : "Error code"}</span><span className="break-all text-right font-medium">{item.safeErrorCode || "-"}</span>
              </div>
              {metricEntries.length ? <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3 text-xs">{metricEntries.map(([key, value]) => <Fragment key={key}><dt className="break-all text-muted">{key}</dt><dd className="break-all text-right font-medium">{value == null ? "-" : String(value)}</dd></Fragment>)}</dl> : null}
              {item.incidentId ? <a href="#active-incidents" onClick={() => setSelectedIncident(item.incidentId)} className="mt-4 inline-flex min-h-10 items-center text-xs font-semibold text-primary">{locale === "tr" ? "Açık olayı görüntüle" : "View open incident"}</a> : null}
            </article>;
          })}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">{locale === "tr" ? "Kuyruk özeti" : "Queue summary"}</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b bg-black/[.03]"><tr><th className="p-3">{locale === "tr" ? "Kuyruk" : "Queue"}</th><th>{locale === "tr" ? "Durum" : "State"}</th><th>{locale === "tr" ? "Bekleyen" : "Waiting"}</th><th>{locale === "tr" ? "Aktif" : "Active"}</th><th>{locale === "tr" ? "En eski iş" : "Oldest job"}</th><th>{locale === "tr" ? "Dakika hızı" : "Per minute"}</th><th>{locale === "tr" ? "95. yüzdelik" : "95th percentile"}</th></tr></thead><tbody>{queues.map((queue: any) => <tr key={queue.name} className="border-b last:border-0"><td className="p-3 font-medium">{queue.name}</td><td>{localizedStatus(queue.state, t)}</td><td>{queue.counts?.waiting || 0}</td><td>{queue.counts?.active || 0}</td><td>{queue.oldestWaitingAgeMs == null ? "-" : `${Math.round(queue.oldestWaitingAgeMs / 1000)} sn`}</td><td>{queue.throughputPerMinute}</td><td>{queue.p95ProcessingMs == null ? "-" : `${queue.p95ProcessingMs} ms`}</td></tr>)}</tbody></table>
        </div>
      </section>

      <section className="mb-8 grid gap-6 xl:grid-cols-2">
        <div id="active-incidents">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><AlertTriangle className="size-5 text-amber-500" />{locale === "tr" ? "Aktif olaylar" : "Active incidents"}</h2>
          <div className="grid gap-3">{incidents.map((incident: any) => <article key={incident.id} className="rounded-lg border p-4">
            <button type="button" onClick={() => setSelectedIncident(selectedIncident === incident.id ? null : incident.id)} className="w-full text-left"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{incident.title}</h3><p className="mt-1 text-xs text-muted">{incident.severity} · {formatDateTime(incident.startedAt, locale)}</p></div><span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold">{localizedStatus(incident.status, t)}</span></div><p className="mt-3 text-sm text-muted">{incident.description}</p></button>
            {selectedIncident === incident.id ? <div className="mt-4 border-t pt-4"><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={locale === "tr" ? "İnceleme veya çözüm notu" : "Investigation or resolution note"} className={`${field} min-h-24`} /><div className="mt-3 flex flex-wrap gap-2">{[["ACKNOWLEDGED", locale === "tr" ? "Kabul et" : "Acknowledge"], ["INVESTIGATING", locale === "tr" ? "İncele" : "Investigate"], ["MITIGATED", locale === "tr" ? "Azaltıldı" : "Mitigated"], ["RESOLVED", locale === "tr" ? "Çözüldü" : "Resolve"]].map(([status, label]) => <button key={status} type="button" disabled={saving} onClick={() => void updateIncidentStatus(incident.id, status)} className="min-h-10 rounded-lg border px-3 text-xs font-semibold disabled:opacity-50">{label}</button>)}</div></div> : null}
          </article>)}{!incidents.length ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted">{locale === "tr" ? "Aktif olay yok." : "No active incidents."}</p> : null}</div>
        </div>
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><ShieldAlert className="size-5 text-primary" />{locale === "tr" ? "Son uyarılar" : "Recent alerts"}</h2>
          <div className="grid gap-3">{alerts.slice(0, 12).map((alert: any) => <article key={alert.id} className="rounded-lg border p-4"><div className="flex justify-between gap-3"><h3 className="text-sm font-semibold">{String(alert.type).replaceAll("_", " ")}</h3><span className="text-xs font-semibold">{alert.severity}</span></div><p className="mt-2 text-xs text-muted">{alert.message}</p><p className="mt-3 text-[11px] text-muted">{alert.service} · {alert.occurrenceCount} · {formatDateTime(alert.lastSeenAt, locale)}</p></article>)}{!alerts.length ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted">{locale === "tr" ? "Açık uyarı yok." : "No open alerts."}</p> : null}</div>
        </div>
      </section>
    </>
  );
}

export function AdminMetricsPage() {
  const { locale, t } = useI18n();
  const [data, setData] = useState<any>();
  useEffect(() => { void fetch("/api/admin/metrics").then((response) => response.json()).then((value) => setData(value.metrics)); }, []);
  if (!data) return <Loading />;
  return (
    <>
      <Header title={t("admin.saasMetrics.title")} description={t("admin.saasMetrics.description")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(data).map(([key, value]) => <Metric key={key} label={t(`admin.metric.${key}`)} value={value === null ? t("common.preparing") : formatNumber(Number(value), locale)} Icon={Activity} />)}</div>
    </>
  );
}
