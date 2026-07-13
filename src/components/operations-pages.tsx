"use client";

/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any */
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  Activity,
  Building2,
  CheckCircle2,
  CircleHelp,
  Database,
  HeartPulse,
  LoaderCircle,
  MessageSquare,
  Plus,
  Send,
  ShieldAlert,
  Users,
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
  const { t } = useI18n();
  const [data, setData] = useState<any>();
  useEffect(() => { void fetch("/api/admin/system/health").then((response) => response.json()).then(setData); }, []);
  if (!data) return <Loading />;
  return (
    <>
      <Header title={t("systemHealth.title")} description={t("systemHealth.description")} />
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label={t("systemHealth.application")} value={localizedStatus(data.app || "unknown", t)} Icon={HeartPulse} />
        <Metric label={t("systemHealth.database")} value={localizedStatus(data.database?.status || "unknown", t)} Icon={Database} />
        <Metric label={t("systemHealth.failedQueueJobs")} value={data.queue?.counts?.failed || 0} Icon={ShieldAlert} />
        <Metric label={t("systemHealth.worker")} value={localizedStatus(data.worker || "unknown", t)} Icon={Activity} />
        <Metric label={t("systemHealth.storage")} value={localizedStatus(data.storage || "unknown", t)} Icon={Database} />
        <Metric label={t("systemHealth.email")} value={localizedStatus(data.email || "unknown", t)} Icon={CircleHelp} />
      </div>
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
