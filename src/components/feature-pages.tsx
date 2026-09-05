"use client";
/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element, @typescript-eslint/no-unused-expressions */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Boxes,
  CalendarClock,
  Check,
  CircleAlert,
  ContactRound,
  FileText,
  Filter,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Trash2,
  UsersRound,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { CategoryColorPicker } from "@/components/category-color-picker";
import { intlLocale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";
import { apiErrorMessage } from "@/i18n/api-error";
import { lifecycleLabel } from "../../shared/product-status-copy";
import { downloadCsv } from "@/lib/csv-export";
import { cn } from "@/lib/utils";

type Account = {
  id: string;
  label: string;
  phoneNumber?: string;
  displayName?: string;
  status: string;
  lastSyncedAt?: string;
  archivedAt?: string;
  _count: { groups: number; contacts: number; recipients?: number };
  sessions: { qrCode?: string; expiresAt?: string }[];
};
type Group = {
  id: string;
  name: string;
  participantCount: number;
  canSend: boolean;
  account: { label: string };
  categories: { category: { name: string } }[];
};
type Category = {
  id: string;
  name: string;
  color: string;
  _count: { groups: number };
  groups?: { groupId: string }[];
};
type Campaign = {
  id: string;
  title: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
};
type PlatformData = {
  monthlyMessages?: { sent: number; failed: number; startsAt: string; endsAt: string; timezone: string };
  user: { id: string; name: string };
  company: { id: string; name: string };
  accounts: Account[];
  currentWhatsAppAccount?: {
    id: string;
    phoneNumber?: string | null;
    status: string;
    lastGroupSyncAt?: string | null;
  } | null;
  groups: Group[];
  categories: Category[];
  campaigns: Campaign[];
  subscription?: { trialEndsAt?: string; plan: { name: string } };
  onboarding?: { completedAt?: string | null };
  announcements?: {
    id: string;
    title: string;
    message: string;
    type: string;
  }[];
};

const primary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-60";
const ghost =
  "inline-flex items-center justify-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm text-foreground hover:bg-muted-background";
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel rounded-2xl", className)}>{children}</section>
  );
}
function Header({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.22em] text-primary">
          {eyebrow}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}
function Status({
  children,
  tone = "green",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "amber" | "blue";
}) {
  const tones = {
    green: "bg-success-soft text-success-foreground",
    red: "bg-danger-soft text-danger-foreground",
    amber: "bg-warning-soft text-warning-foreground",
    blue: "bg-info-soft text-info-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        tones[tone],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold">{title}</h3>
      <span className="text-[11px] text-muted">{hint}</span>
    </div>
  );
}
function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <Card className="grid place-items-center p-12 text-center">
      <Boxes className="mb-4 size-10 text-primary" />
      <p className="text-sm text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}
function Toolbar({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (value: string) => void }) {
  return <Card className="mb-5 p-3"><label className="flex items-center gap-2 rounded-xl border bg-input px-3"><Search className="size-4 text-muted" /><input className="w-full bg-transparent py-2.5 text-sm outline-none" aria-label={placeholder} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} /></label></Card>;
}
function usePlatform(poll = false) {
  const [data, setData] = useState<PlatformData | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    const controller = new AbortController(); inFlight.current = controller;
    const timeout = setTimeout(() => controller.abort("timeout"), 20_000);
    try {
      const response = await fetch("/api/platform", { cache: "no-store", signal: controller.signal });
      if (response.status === 401) { window.location.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
      if (!response.ok) throw new Error("PLATFORM_BOOTSTRAP_FAILED");
      const body = await response.json();
      if (inFlight.current === controller) { setData(body); setError(""); }
    } catch { if (inFlight.current === controller) setError("errors.generic"); }
    finally { clearTimeout(timeout); if (inFlight.current === controller) inFlight.current = null; }
  }, []);
  useEffect(() => {
    void load();
    const timer = poll ? setInterval(() => { if (!document.hidden) void load(); }, 10_000) : undefined;
    return () => { clearInterval(timer); const pending = inFlight.current; inFlight.current = null; pending?.abort(); };
  }, [load, poll]);
  return { data, error, reload: load };
}
async function action(url: string, body: unknown, t: ReturnType<typeof useI18n>["t"]) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(apiErrorMessage(t, result));
  return result;
}

export function DashboardPage() {
  const { t } = useI18n();
  const { data, error, reload } = usePlatform(true);
  if (!data) return error ? <PlatformLoadError onRetry={reload} /> : <Loading />;
  const active = data.accounts.filter((a) => !a.archivedAt),
    connected = active.filter((a) => a.status === "CONNECTED").length;
  const sent = data.monthlyMessages?.sent ?? "—";
  const failed = data.monthlyMessages?.failed ?? "—";
  const firstName = data.user.name.trim().split(/\s+/)[0] || data.user.name;
  const metrics = [
    [
      t("dashboard.connectedAccounts"),
      `${connected} / ${active.length}`,
      Smartphone,
    ],
    [
      t("dashboard.groupsContacts"),
      `${data.groups.length} / ${active.reduce((n, a) => n + a._count.contacts, 0)}`,
      UsersRound,
    ],
    [t("dashboard.sentMonth"), sent, Send],
    [t("dashboard.failed"), failed, CircleAlert],
  ] as const;
  return (
    <>
      <div className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {t("dashboard.greetingName", { name: firstName })}
        </h1>
      </div>
      {data.announcements?.map((a) => (
        <div key={a.id} className="mb-4 rounded-2xl border bg-card p-4 text-sm">
          <b>{a.title}</b>
          <p className="mt-1 text-muted">{a.message}</p>
        </div>
      ))}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, Icon]) => (
          <Card key={label} className="p-5">
            <Icon className="mb-6 size-5 text-primary" />
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 font-mono text-2xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>
    </>
  );
}

export function AccountsPage() {
  const { t, locale } = useI18n();
  const { data, reload, error: platformError } = usePlatform(true);
  const [connecting, setConnecting] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [method, setMethod] = useState<"QR" | "CODE">("QR");
  const [directoryRefresh, setDirectoryRefresh] = useState("");
  const [directoryMessage, setDirectoryMessage] = useState("");
  async function add() {
    const label = window.prompt(t("accounts.labelPrompt"));
    if (!label) return;
    try {
      const result = await action("/api/accounts", { label }, t);
      setConnecting(result.account);
      setMethod("QR");
      void reload();
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : t("errors.generic"));
    }
  }
  async function run(accountId: string, name: string) {
    if (
      ["archive", "delete"].includes(name) &&
      !window.confirm(t("accounts.confirmAction"))
    )
      return;
    try {
      name === "delete"
        ? await fetch(`/api/accounts/${accountId}`, { method: "DELETE" })
        : await action(`/api/accounts/${accountId}/action`, { action: name }, t);
      void reload();
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : t("errors.generic"));
    }
  }
  async function connect(account: Account) {
    setConnecting(account);
    await run(account.id, "reconnect");
  }
  async function refreshDirectory(accountId: string, kind: "groups" | "contacts") {
    const operation = `${accountId}:${kind}`;
    setDirectoryRefresh(operation);
    setDirectoryMessage("");
    setError("");
    try {
      if (kind === "groups") {
        await action(`/api/accounts/whatsapp/${encodeURIComponent(accountId)}/sync-groups`, {}, t);
      } else {
        await action("/api/whatsapp/contacts/sync-current", { accountId }, t);
      }
      setDirectoryMessage(t(kind === "groups" ? "accounts.groupsRefreshStarted" : "accounts.contactsRefreshStarted"));
      await reload();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : t("errors.generic"));
    } finally {
      setDirectoryRefresh("");
    }
  }
  const connectingId = connecting?.id;
  useEffect(() => {
    if (!connectingId) return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/accounts/${connectingId}/qr`);
      if (response.ok) {
        const value = await response.json();
        setConnecting((current) =>
          current
            ? {
                ...current,
                status: value.status,
                sessions: [
                  { qrCode: value.qrCode, expiresAt: value.expiresAt },
                ],
              }
            : null,
        );
        if (value.status === "CONNECTED") {
          setTimeout(() => setConnecting(null), 1200);
          void reload();
        }
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [connectingId, reload]);
  const accounts =
    data?.accounts.filter((a) => showArchived || !a.archivedAt) || [];
  return (
    <>
      <Header
        eyebrow={t("accounts.eyebrow")}
        title={t("accounts.title")}
        description={t("accounts.description")}
        action={
          <div className="flex gap-2">
            <button
              className={ghost}
              onClick={() => setShowArchived((v) => !v)}
            >
              {t("accounts.showArchived")}
            </button>
            <button className={primary} onClick={add}>
              <Plus className="size-4" />
              {t("accounts.add")}
            </button>
          </div>
        }
      />
      {error && (
        <p className="mb-4 rounded-xl bg-danger-soft p-3 text-sm text-danger-foreground">
          {error}
        </p>
      )}
      {directoryMessage && (
        <p role="status" className="mb-4 rounded-xl border border-success/30 bg-success-soft p-3 text-sm text-success-foreground">
          {directoryMessage}
        </p>
      )}
      {connecting && (
        <Card className="mb-6 flex flex-col items-center p-8 text-center">
          <button className="ms-auto" onClick={() => setConnecting(null)}>
            <XCircle className="size-5" />
          </button>
          <div className="mb-4 flex gap-2">
            <button
              className={cn(
                ghost,
                method === "QR" && "border-primary bg-primary-soft",
              )}
              onClick={() => setMethod("QR")}
            >
              {t("accounts.qrTab")}
            </button>
            <button
              className={cn(
                ghost,
                method === "CODE" && "border-primary bg-primary-soft",
              )}
              onClick={() => setMethod("CODE")}
            >
              {t("accounts.codeTab")}
            </button>
          </div>
          {method === "CODE" ? (
            <p className="my-12 max-w-md rounded-xl bg-warning-soft p-4 text-sm text-warning-foreground">
              {t("accounts.pairingUnsupported")}
            </p>
          ) : connecting.sessions[0]?.qrCode ? (
            <img
              className="my-4 size-72 rounded-xl"
              src={connecting.sessions[0].qrCode}
              alt={t("accounts.scan")}
            />
          ) : (
            <LoaderCircle className="my-12 size-14 animate-spin text-primary" />
          )}
          <h3 className="font-semibold">{t("accounts.connectionTitle")}</h3>
          <p className="mt-2 max-w-md text-sm text-muted">
            {t("accounts.scanHelp")}
          </p>
          <Status tone={connecting.status === "CONNECTED" ? "green" : "amber"}>
            {t(`accountStatus.${connecting.status}`)}
          </Status>
        </Card>
      )}
      {!data ? (
        platformError ? <PlatformLoadError onRetry={reload} /> : <Loading />
      ) : !accounts.length ? (
        <Empty text={t("accounts.empty")} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          {accounts.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="mb-5 flex justify-between">
                <span
                  className={cn(
                    "grid size-11 place-items-center rounded-xl",
                    a.status === "CONNECTED"
                      ? "bg-success-soft text-success-foreground"
                      : "bg-danger-soft text-danger-foreground",
                  )}
                >
                  {a.status === "CONNECTED" ? <Wifi /> : <WifiOff />}
                </span>
                <Status tone={a.status === "CONNECTED" ? "green" : "red"}>
                  {t(`accountStatus.${a.status}`)}
                </Status>
              </div>
              <h3 className="font-semibold">{a.label}</h3>
              <p className="mt-1 text-xs text-muted">
                {a.displayName || t("empty.noData")} ·{" "}
                {a.phoneNumber || t("empty.noData")}
              </p>
              <div className="my-5 grid grid-cols-3 gap-2 text-center">
                <Mini value={a._count.groups} label={t("common.groups")} />
                <Mini value={a._count.contacts} label={t("common.contacts")} />
                <Mini
                  value={
                    a.lastSyncedAt
                      ? new Date(a.lastSyncedAt).toLocaleString(intlLocale(locale))
                      : "-"
                  }
                  label={t("accounts.lastSync")}
                />
              </div>
              {a.status === "CONNECTED" ? <div className="mb-3 grid gap-2 sm:grid-cols-2">
                <button
                  className={ghost}
                  disabled={Boolean(directoryRefresh)}
                  onClick={() => void refreshDirectory(a.id, "groups")}
                >
                  <UsersRound className={cn("size-4", directoryRefresh === `${a.id}:groups` && "animate-pulse")} />
                  {t("accounts.refreshGroups")}
                </button>
                <button
                  className={ghost}
                  disabled={Boolean(directoryRefresh)}
                  onClick={() => void refreshDirectory(a.id, "contacts")}
                >
                  <ContactRound className={cn("size-4", directoryRefresh === `${a.id}:contacts` && "animate-pulse")} />
                  {t("accounts.refreshContacts")}
                </button>
              </div> : null}
              <div className="grid grid-cols-3 gap-2">
                <button
                  className={ghost}
                  onClick={() =>
                    a.status === "CONNECTED" ? run(a.id, "sync") : connect(a)
                  }
                >
                  <RefreshCw className="size-4" />
                  <span className="sr-only">{a.status === "CONNECTED" ? t("accounts.checkConnection") : t("accounts.reconnect")}</span>
                </button>
                <button
                  className={ghost}
                  onClick={() =>
                    run(
                      a.id,
                      a.status === "CONNECTED" ? "disconnect" : "archive",
                    )
                  }
                >
                  <Archive className="size-4" />
                </button>
                <button className={ghost} onClick={() => run(a.id, "delete")}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
function Mini({ value, label }: { value: string | number; label: string }) {
  const { locale } = useI18n();
  return (
    <div>
      <p className="font-mono text-xs font-semibold">{typeof value === "number" ? formatNumber(value, locale) : value}</p>
      <p className="mt-1 text-[9px] uppercase text-muted">{label}</p>
    </div>
  );
}

export function GroupsPage() {
  const { t } = useI18n();
  const { data, reload, error: platformError } = usePlatform(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState("");
  const sendable = data?.groups.filter((g) => g.canSend) || [];
  function toggle(id: string, checked: boolean) {
    setSelected((value) =>
      checked
        ? [...new Set([...value, id])]
        : value.filter((groupId) => groupId !== id),
    );
  }
  function compose() {
    localStorage.setItem("logivya.selectedGroupIds", JSON.stringify(selected));
    window.location.href = "/send-message";
  }
  async function refreshGroups() {
    setSyncing(true);
    setStatus(t("groups.syncing"));
    try {
      await action("/api/accounts/whatsapp/sync-current", {}, t);
      await reload();
      setStatus(t("groups.updated"));
    } catch (e) {
      setStatus(e instanceof Error ? t(e.message) : t("groups.refreshFailed"));
    } finally {
      setSyncing(false);
    }
  }
  return (
    <>
      <Header
        eyebrow={t("groups.eyebrow")}
        title={t("groups.title")}
        description={t("groups.description")}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              disabled={syncing}
              className={ghost}
              onClick={refreshGroups}
            >
              <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
              {syncing ? t("groups.syncing") : t("groups.refresh")}
            </button>
            <button
              disabled={!selected.length}
              className={primary}
              onClick={compose}
            >
              <Send className="size-4" />
              {t("groups.sendSelected", { count: selected.length })}
            </button>
          </div>
        }
      />
      {status && (
        <p className="mb-4 rounded-xl border bg-card p-3 text-sm text-muted">
          {status}
        </p>
      )}
      <Toolbar placeholder={t("groups.search")} value={search} onChange={setSearch} />
      {!data ? (
        platformError ? <PlatformLoadError onRetry={reload} /> : <Loading />
      ) : !data.groups.length ? (
        <Empty
          text={data.currentWhatsAppAccount ? t("groups.emptyAccount") : t("accounts.connectRequired")}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="border-b bg-foreground/[.025] text-[10px] uppercase text-muted">
              <tr>
                <th className="px-5 py-4 font-medium">
                  <input
                    aria-label={t("groups.selectAll")}
                    checked={
                      sendable.length > 0 && selected.length === sendable.length
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? sendable.map((g) => g.id) : [],
                      )
                    }
                    type="checkbox"
                  />
                </th>
                {[
                  "common.group",
                  "common.account",
                  "common.members",
                  "common.category",
                  "common.permission",
                ].map((h) => (
                  <th className="px-5 py-4 font-medium" key={h}>
                    {t(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.groups.filter(g => [g.name, ...g.categories.map(c => c.category.name)].join(" ").toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())).map((g) => (
                <tr
                  className={cn(
                    "border-b last:border-0",
                    selected.includes(g.id) && "bg-primary-soft",
                  )}
                  key={g.id}
                >
                  <td className="px-5 py-4">
                    <input
                      aria-label={t("groups.selectGroup", { name: g.name })}
                      checked={selected.includes(g.id)}
                      disabled={!g.canSend}
                      onChange={(e) => toggle(g.id, e.target.checked)}
                      type="checkbox"
                    />
                  </td>
                  <td className="px-5 py-4 font-medium">{g.name}</td>
                  <td className="px-5 py-4 text-muted">{g.account.label}</td>
                  <td className="px-5 py-4">{g.participantCount}</td>
                  <td className="px-5 py-4">
                    {g.categories.map((x) => x.category.name).join(", ") || "-"}
                  </td>
                  <td className="px-5 py-4">
                    <Status tone={g.canSend ? "green" : "red"}>
                      {g.canSend
                        ? t("groups.canSend")
                        : t("groups.unavailable")}
                    </Status>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

export function CategoriesPage() {
  const { t } = useI18n();
  const { data, reload, error: platformError } = usePlatform();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await action("/api/categories", {
        name: form.get("name"),
        color: form.get("color"),
        groupIds: form.getAll("groupIds"),
      }, t);
      setOpen(false);
      void reload();
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : t("errors.generic"));
    }
  }
  return (
    <>
      <Header
        eyebrow={t("categories.eyebrow")}
        title={t("categories.title")}
        description={t("categories.description")}
        action={
          <button className={primary} onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            {t("categories.new")}
          </button>
        }
      />
      {open && (
        <Card className="mb-5 p-5">
          <form onSubmit={submit} className="grid gap-4">
            <input
              required
              name="name"
              placeholder={t("categories.name")}
              className="rounded-xl border p-3"
            />
            <CategoryColorPicker
              label={t("categories.chooseColor")}
              changeLabel={t("categories.changeColor")}
              selectedLabel={t("categories.selectedColor")}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {data?.groups.map((g) => (
                <label key={g.id} className="rounded-xl border p-3 text-sm">
                  <input
                    className="me-2"
                    name="groupIds"
                    value={g.id}
                    type="checkbox"
                  />
                  {g.name}
                </label>
              ))}
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button className={primary}>{t("categories.create")}</button>
          </form>
        </Card>
      )}
      {!data ? (
        platformError ? <PlatformLoadError onRetry={reload} /> : <Loading />
      ) : !data.categories.length ? (
        <Empty text={t("categories.empty")} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {data.categories.map((c) => (
            <Card key={c.id} className="p-5">
              <span
                className="mb-7 block size-3 rounded-full"
                style={{ background: c.color }}
              />
              <h3 className="font-semibold">{c.name}</h3>
              <p className="mt-1 text-xs text-muted">
                {t("categories.segment")}
              </p>
              <div className="mt-6 border-t pt-4">
                <Mini value={c._count.groups} label={t("common.groups")} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export function SendMessagePage() {
  const { t } = useI18n();
  const { data, error: platformError, reload } = usePlatform();
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [mode, setMode] = useState<"SEND_NOW" | "SCHEDULED">("SEND_NOW");
  const [scheduledAt, setScheduledAt] = useState("");
  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("logivya.selectedGroupIds") || "[]",
      );
      if (Array.isArray(stored))
        setSelected(stored.filter((id) => typeof id === "string"));
    } catch {
      localStorage.removeItem("logivya.selectedGroupIds");
    }
  }, []);
  const groups = useMemo(
    () => data?.groups.filter((g) => g.canSend) || [],
    [data],
  );
  const resolved = useMemo(
    () =>
      new Set([
        ...selected,
        ...(data?.categories
          .filter((c) => selectedCategories.includes(c.id))
          .flatMap((c) => c.groups?.map((item) => item.groupId) || []) || []),
      ]),
    [data, selected, selectedCategories],
  );
  function toggle(id: string, checked: boolean) {
    setSelected((value) =>
      checked
        ? [...new Set([...value, id])]
        : value.filter((groupId) => groupId !== id),
    );
  }
  async function send() {
    setStatus("");
    try {
      await action("/api/campaigns", {
        title: text.slice(0, 60),
        content: text,
        groupIds: selected,
        categoryIds: selectedCategories,
        scheduleType: mode,
        scheduledAt: mode === "SCHEDULED" ? scheduledAt : undefined,
      }, t);
      setStatus(t("composer.queued"));
      setText("");
      setSelected([]);
      setSelectedCategories([]);
      localStorage.removeItem("logivya.selectedGroupIds");
    } catch (e) {
      setStatus(e instanceof Error ? t(e.message) : t("errors.generic"));
    }
  }
  return (
    <>
      {platformError && !data ? <PlatformLoadError onRetry={reload} /> : null}
      <Header
        eyebrow={t("composer.eyebrow")}
        title={t("composer.title")}
        description={t("composer.description")}
      />
      <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle
              title={t("composer.selectAudiences")}
              hint={t("composer.step1")}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {data?.categories.map((c) => (
                <label
                  key={c.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 text-sm",
                    selectedCategories.includes(c.id) &&
                      "border-primary bg-primary-soft",
                  )}
                >
                  <input
                    checked={selectedCategories.includes(c.id)}
                    onChange={(e) =>
                      setSelectedCategories((v) =>
                        e.target.checked
                          ? [...v, c.id]
                          : v.filter((id) => id !== c.id),
                      )
                    }
                    type="checkbox"
                  />
                  <b>{c.name}</b>
                  <span className="ms-auto text-muted">{c._count.groups}</span>
                </label>
              ))}
            </div>
            <div className="my-5 border-t" />
            <SectionTitle
              title={t("composer.selectGroups")}
              hint={t("composer.selectedGroupsHint", { count: resolved.size })}
            />
            <label className="mt-4 flex items-center gap-3 rounded-xl border p-3 text-sm font-semibold">
              <input
                checked={groups.length > 0 && selected.length === groups.length}
                onChange={(e) =>
                  setSelected(e.target.checked ? groups.map((g) => g.id) : [])
                }
                type="checkbox"
              />
              <span>{t("groups.selectAll")}</span>
              <span className="ms-auto text-muted">{groups.length}</span>
            </label>
            <div className="mt-3 grid max-h-80 gap-3 overflow-auto sm:grid-cols-2">
              {groups.map((g) => (
                <label
                  key={g.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 text-sm",
                    resolved.has(g.id) && "border-primary bg-primary-soft",
                  )}
                >
                  <input
                    checked={selected.includes(g.id)}
                    onChange={(e) => toggle(g.id, e.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    <strong className="block">{g.name}</strong>
                    <span className="text-xs text-muted">
                      {g.account.label} · {t("common.members")}:{" "}
                      {g.participantCount}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <SectionTitle
              title={t("composer.write")}
              hint={`${text.length}/4096`}
            />
            <textarea
              maxLength={4096}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-4 min-h-48 w-full rounded-xl border bg-input p-4 text-sm text-input-foreground outline-none"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode("SEND_NOW")}
                className={cn(
                  ghost,
                  mode === "SEND_NOW" && "border-primary bg-primary-soft",
                )}
              >
                {t("composer.sendNow")}
              </button>
              <button
                type="button"
                onClick={() => setMode("SCHEDULED")}
                className={cn(
                  ghost,
                  mode === "SCHEDULED" && "border-primary bg-primary-soft",
                )}
              >
                {t("composer.schedule")}
              </button>
              {mode === "SCHEDULED" && (
                <input
                  className="rounded-xl border bg-input px-3 py-2 text-sm text-input-foreground"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              )}
            </div>
          </Card>
        </div>
        <Card className="h-fit p-5">
          <SectionTitle
            title={t("composer.summary")}
            hint={t("composer.preview")}
          />
          <div className="my-5 rounded-xl border bg-accent p-4 text-sm leading-6 text-accent-foreground">
            {text || t("composer.emptyPreview")}
          </div>
          <p className="mb-4 text-xs text-muted">
            {t("composer.targets", { count: resolved.size })}
          </p>
          <button
            disabled={
              !text || !resolved.size || (mode === "SCHEDULED" && !scheduledAt)
            }
            className={cn(primary, "w-full")}
            onClick={send}
          >
            <Send className="size-4" />
            {t("composer.reviewSend")}
          </button>
          {status && <p className="mt-3 text-sm text-muted">{status}</p>}
        </Card>
      </div>
    </>
  );
}

export function HistoryPage() {
  const { t, locale } = useI18n();
  const { data, error: platformError, reload } = usePlatform(true);
  const [search, setSearch] = useState("");
  const [historyError, setHistoryError] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setHistoryError(false);
    try {
    const response = await fetch(
      `/api/messages/campaigns?showDeleted=${showDeleted}`,
      { cache: "no-store", signal: AbortSignal.timeout(20_000) },
    );
    const result = await response.json();
    if (!response.ok) throw new Error();
    setCampaigns(result.campaigns);
    } catch { setHistoryError(true); } finally { setLoading(false); }
  }, [showDeleted]);
  useEffect(() => {
    void load();
  }, [load]);
  const visibleCampaigns = campaigns.filter(c => `${c.title} ${c.status}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  async function mutate(id: string, name: string) {
    const archive = name === "archive";
    if (
      !confirm(t(archive ? "history.archiveConfirm" : "history.deleteConfirm"))
    )
      return;
    await action(`/api/messages/campaigns/${id}/${name}`, {}, t);
    void load();
  }
  return (
    <>
      <Header
        eyebrow={t("history.eyebrow")}
        title={t("history.title")}
        description={t("history.description")}
        action={
          <div className="flex gap-2">
            <button
              className={ghost}
              onClick={() => setShowDeleted((value) => !value)}
            >
              {showDeleted
                ? t("history.hideDeleted")
                : t("history.showDeleted")}
            </button>
            <button className={ghost} disabled={loading || historyError} onClick={() => downloadCsv("logivya-history.csv", [[t("history.title"), t("common.status"), t("common.dateRange"), lifecycleLabel("SENT", locale), t("dashboard.failed")], ...visibleCampaigns.map(c => [c.title, c.status, c.createdAt, c.sentCount, c.failedCount])])}>
              <FileText className="size-4" />
              {t("history.export")}
            </button>
          </div>
        }
      />
      <Toolbar placeholder={t("history.search")} value={search} onChange={setSearch} />
      {historyError && <PlatformLoadError onRetry={load} />}
      {!data || loading ? (
        platformError && !data ? <PlatformLoadError onRetry={reload} /> : <Loading />
      ) : (
        <Card className="overflow-hidden">
          <CampaignTable
            campaigns={visibleCampaigns}
            actions={(campaign) => (
              <div className="flex flex-wrap gap-2">
                {campaign.failedCount > 0 && (
                  <button
                    title={t("history.retryFailed")}
                    onClick={() =>
                      void action(
                        `/api/messages/campaigns/${campaign.id}/retry-failed`,
                        {},
                        t,
                      ).then(load)
                    }
                    className={ghost}
                  >
                    <RefreshCw className="size-4" />
                  </button>
                )}
                {campaign.status !== "DELETED" && (
                  <>
                    <button
                      onClick={() => void mutate(campaign.id, "archive")}
                      className={ghost}
                    >
                      <Archive className="size-4" />
                      {t("history.archive")}
                    </button>
                    <button
                      onClick={() => void mutate(campaign.id, "delete")}
                      className="inline-flex items-center gap-2 rounded-xl border border-danger/40 bg-danger-soft px-3 py-2.5 text-sm text-danger-foreground hover:brightness-95"
                    >
                      <Trash2 className="size-4" />
                      {t("history.delete")}
                    </button>
                  </>
                )}
              </div>
            )}
          />
        </Card>
      )}
    </>
  );
}
function CampaignTable({
  campaigns,
  actions,
}: {
  campaigns: Campaign[];
  actions?: (campaign: Campaign) => React.ReactNode;
}) {
  const { t, locale } = useI18n();
  if (!campaigns.length)
    return (
      <div className="p-10 text-center text-sm text-muted">
        {t("history.empty")}
      </div>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-start text-sm">
        <thead className="border-b bg-foreground/[.025] text-[10px] uppercase text-muted">
          <tr>
            {[
              "history.campaign",
              "common.status",
              "history.progress",
              "history.sentAt",
            ].map((key) => (
              <th key={key} className="px-5 py-4 font-medium">
                {t(key)}
              </th>
            ))}
            {actions && (
              <th className="px-5 py-4 font-medium">{t("common.actions")}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id} className="border-b last:border-0">
              <td className="px-5 py-4 font-medium">{c.title}</td>
              <td className="px-5 py-4">
                <Status tone={c.status === "FAILED" ? "red" : "green"}>
                  {t(`status.${c.status.toLowerCase()}`)}
                </Status>
              </td>
              <td className="px-5 py-4">
                {t("history.sentFailed", {
                  sent: c.sentCount,
                  failed: c.failedCount,
                })}{" "}
                / {c.totalRecipients}
              </td>
              <td className="px-5 py-4 text-muted">
                {new Date(c.createdAt).toLocaleString(intlLocale(locale))}
              </td>
              {actions && <td className="px-5 py-4">{actions(c)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function SettingsPage() {
  const { t } = useI18n();
  const [saved, setSaved] = useState(false);
  return (
    <>
      <Header
        eyebrow={t("settings.eyebrow")}
        title={t("settings.title")}
        description={t("settings.description")}
      />
      <Card className="p-6">
        <SectionTitle
          title={t("billing.profile")}
          hint={saved ? t("billing.complete") : t("billing.needsReview")}
        />
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {[
            "companyName",
            "legalName",
            "tradeName",
            "taxOffice",
            "taxNumber",
            "country",
            "city",
            "district",
            "postalCode",
            "billingEmail",
            "billingPhone",
            "invoiceType",
          ].map((key) => (
            <label key={key}>
              <span className="mb-2 block text-xs font-medium">
                {t(`billing.${key}`)}
              </span>
              <input className="w-full rounded-xl border bg-input px-3 py-3 text-sm text-input-foreground outline-none" />
            </label>
          ))}
          <label className="sm:col-span-2">
            <span className="mb-2 block text-xs font-medium">
              {t("billing.address")}
            </span>
            <textarea className="min-h-24 w-full rounded-xl border bg-input p-3 text-input-foreground" />
          </label>
        </div>
        <button className={cn(primary, "mt-6")} onClick={() => setSaved(true)}>
          <Check className="size-4" />
          {t("billing.save")}
        </button>
      </Card>
    </>
  );
}
function Loading() {
  return (
    <div className="grid min-h-52 place-items-center">
      <LoaderCircle className="size-7 animate-spin text-primary" />
    </div>
  );
}

function PlatformLoadError({ onRetry }: { onRetry: () => Promise<void> }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-52 place-items-center px-4 text-center">
      <div>
        <CircleAlert className="mx-auto mb-3 size-7 text-danger-foreground" />
        <p className="text-sm text-muted">{t("errors.generic")}</p>
        <button className={cn(ghost, "mt-4")} onClick={() => void onRetry()}>
          <RefreshCw className="size-4" />
          {t("errors.tryAgain")}
        </button>
      </div>
    </div>
  );
}
