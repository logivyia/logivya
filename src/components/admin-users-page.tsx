"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  KeyRound,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";

import { useSearchParams } from "next/navigation";
import { AdminMetricCard } from "./admin-metric-card";
import { AdminRecordDialog } from "./admin-record-dialog";
import { apiErrorMessage } from "@/i18n/api-error";
import { formatDateTime, formatNumber } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status: "ACTIVE" | "SUSPENDED" | "INVITED";
  locale: string;
  timezone: string;
  country?: string | null;
  mfaRequired: boolean;
  createdAt: string;
  memberships: Array<{
    role: string;
    status: string;
    company: { name: string };
  }>;
  sessions: Array<{
    id: string;
    deviceName?: string | null;
    lastActiveAt: string;
    expiresAt: string;
  }>;
  activeSessionCount: number;
  trustedDeviceCount: number;
  platformAdmin?: {
    role: string;
    isActive: boolean;
    requiresMfa: boolean;
  } | null;
};

type UserAction =
  "SUSPEND" | "REACTIVATE" | "FORCE_LOGOUT" | "RESET_MFA" | "REQUIRE_MFA";
type UsersResponse = {
  users: AdminUser[];
  metrics: {
    totalUsers: number;
    activeUsers: number;
    activeSessions: number;
    activeSuperAdmins: number;
  };
  pagination: { page: number; total: number; pages: number };
  error?: string;
};

const field =
  "min-h-11 w-full rounded-xl border bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100";
const button =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50";

export function AdminUsersPage({ canManage }: { canManage: boolean }) {
  const { locale, t } = useI18n();
  const [data, setData] = useState<UsersResponse | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "ALL");
  const [recordView, setRecordView] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [pendingAction, setPendingAction] = useState<UserAction | null>(null);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (recordView !== "all") params.set("view", recordView);
      if (appliedQuery) params.set("q", appliedQuery);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const response = await fetch(`/api/admin/users?${params}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as UsersResponse;
      if (!response.ok) throw new Error(apiErrorMessage(t, result));
      setData(result);
      setSelected((current) =>
        current
          ? (result.users.find((user) => user.id === current.id) ?? null)
          : null,
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : t("errors.generic"),
      );
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, page, statusFilter, recordView, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const initialSearch =
      new URLSearchParams(window.location.search).get("search")?.trim() ?? "";
    if (!initialSearch) return;
    setQuery(initialSearch);
    setAppliedQuery(initialSearch);
    setPage(1);
  }, []);

  useEffect(() => {
    setStatusFilter(searchParams.get("status") ?? "ALL");
    const initialQuery = searchParams.get("search") ?? searchParams.get("q") ?? "";
    setQuery(initialQuery); setAppliedQuery(initialQuery); setPage(1);
  }, [searchParams]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedQuery(query.trim());
  }

  async function runAction() {
    const action = pendingAction;
    if (
      !canManage ||
      !selected ||
      !action ||
      working ||
      reason.trim().length < 5 ||
      !password
    )
      return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const reauth = await fetch("/api/admin/security/re-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const reauthResult = await reauth.json();
      if (!reauth.ok) throw new Error(apiErrorMessage(t, reauthResult));
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(selected.id)}/action`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, reason: reason.trim() }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(t, result));
      setNotice(
        locale === "tr"
          ? "Yönetici işlemi başarıyla tamamlandı."
          : "Administrator action completed successfully.",
      );
      setReason("");
      setPassword("");
      setPendingAction(null);
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("errors.generic"),
      );
    } finally {
      setWorking(false);
    }
  }

  const actions = selected ? availableActions(selected) : [];
  const metrics = data?.metrics;

  return (
    <>
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">
            {t("adminUsers.eyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            {t("adminUsers.title")}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {t("adminUsers.description")}
          </p>
        </div>
        <button
          type="button"
          className={button}
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          {locale === "tr" ? "Yenile" : "Refresh"}
        </button>
      </header>
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300"
        >
          {notice}
        </p>
      ) : null}
      <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          [t("adminUsers.totalUsers"), metrics?.totalUsers ?? 0],
          [t("adminUsers.activeUsers"), metrics?.activeUsers ?? 0],
          [t("adminUsers.activeSessions"), metrics?.activeSessions ?? 0],
          [t("adminUsers.superAdmin"), metrics?.activeSuperAdmins ?? 0],
        ].map(([label, value], index) => <AdminMetricCard key={String(label)} label={String(label)} value={formatNumber(Number(value), locale)} onClick={() => { setRecordView(index === 2 ? "sessions" : index === 3 ? "admins" : "all"); setStatusFilter(index === 1 ? "ACTIVE" : "ALL"); setQuery(""); setAppliedQuery(""); setPage(1); document.getElementById("admin-records")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }} />)}
      </section>
      {recordView !== "all" ? <div role="status" className="mb-3 flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm"><span>{recordView === "sessions" ? (locale === "tr" ? "Aktif oturumu olan kullanıcılar" : "Users with active sessions") : t("adminUsers.superAdmin")}</span><button type="button" className={button} onClick={() => { setRecordView("all"); setPage(1); }}>{locale === "tr" ? "Filtreyi temizle" : "Clear filter"}</button></div> : null}
      <form
        onSubmit={search}
        className="mb-5 grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-[minmax(0,1fr)_220px_auto]"
      >
        <label className="relative">
          <span className="sr-only">{t("admin.searchPlaceholder")}</span>
          <Search className="pointer-events-none absolute start-3 top-3.5 size-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={`${field} ps-10`}
            placeholder={t("admin.searchPlaceholder")}
          />
        </label>
        <select
          value={statusFilter}
          aria-label={locale === "tr" ? "Durum filtresi" : "Status filter"}
          onChange={(event) => {
            setStatusFilter(event.target.value);
            setPage(1);
          }}
          className={field}
        >
          <option value="ALL">
            {locale === "tr" ? "Tüm durumlar" : "All statuses"}
          </option>
          <option value="ACTIVE">{t("users.active")}</option>
          <option value="SUSPENDED">{t("users.suspended")}</option>
          <option value="INVITED">{t("users.invitedStatus")}</option>
        </select>
        <button
          className={`${button} border-orange-600 bg-orange-600 px-5 text-white`}
          type="submit"
        >
          <Search className="size-4" />
          {locale === "tr" ? "Ara" : "Search"}
        </button>
      </form>
      <div id="admin-records" className="grid min-w-0 scroll-mt-24 gap-5">
        <section
          className="panel overflow-x-auto rounded-2xl p-5"
          aria-busy={loading}
        >
          {loading && !data ? (
            <div className="grid min-h-48 place-items-center">
              <LoaderCircle className="animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">{data?.users.map(user => <button key={user.id} type="button" onClick={() => { setSelected(user); setReason(""); setPassword(""); }} className="block w-full rounded-xl border p-4 text-start active:bg-orange-50"><span className="flex items-start justify-between gap-3"><strong className="min-w-0 break-words">{user.name}</strong><span className="shrink-0 text-xs text-orange-700">{userStatusLabel(user.status, t)}</span></span><span className="mt-1 block break-all text-xs text-slate-500">{user.email}</span><span className="mt-3 block text-xs font-semibold text-orange-600">{locale === "tr" ? "Ayrıntıları aç →" : "Open details →"}</span></button>)}</div>
              <table className="hidden w-full min-w-[720px] text-sm md:table">
                <thead>
                  <tr className="border-b text-left">
                    <th scope="col" className="py-3">
                      {t("users.user")}
                    </th>
                    <th scope="col">{t("common.company")}</th>
                    <th scope="col">{t("common.status")}</th>
                    <th scope="col">{t("adminUsers.lastActiveSession")}</th>
                    <th scope="col">{t("adminUsers.adminRole")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.users ?? []).map((user) => (
                    <tr key={user.id} className="border-b last:border-0">
                      <td className="py-3 pe-4">
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(user);
                            setReason("");
                            setPassword("");
                            setNotice("");
                          }}
                          className="text-start font-semibold text-primary hover:underline"
                        >
                          {user.name}
                        </button>
                        <p className="text-xs text-muted">{user.email}</p>
                      </td>
                      <td className="pe-4">
                        {user.memberships[0]?.company.name ?? "-"}
                      </td>
                      <td className="pe-4">
                        {userStatusLabel(user.status, t)}
                      </td>
                      <td className="whitespace-nowrap pe-4">
                        {user.sessions[0]?.lastActiveAt
                          ? formatDateTime(
                              user.sessions[0].lastActiveAt,
                              locale,
                            )
                          : "-"}
                      </td>
                      <td>
                        {user.platformAdmin?.isActive
                          ? user.platformAdmin.role.replaceAll("_", " ")
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data?.users.length ? (
                <p className="py-10 text-center text-sm text-muted">
                  {t("admin.list.empty")}
                </p>
              ) : null}
            </>
          )}
          {data && data.pagination.pages > 1 ? (
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                className={button}
                disabled={page <= 1 || loading}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                {locale === "tr" ? "Önceki" : "Previous"}
              </button>
              <span className="text-xs text-muted">
                {data.pagination.page} / {data.pagination.pages}
              </span>
              <button
                type="button"
                className={button}
                disabled={page >= data.pagination.pages || loading}
                onClick={() => setPage((value) => value + 1)}
              >
                {locale === "tr" ? "Sonraki" : "Next"}
              </button>
            </div>
          ) : null}
        </section>
        {selected ? (
          <AdminRecordDialog open={!pendingAction} title={selected.name} onClose={() => { if (!working) { setSelected(null); setPassword(""); } }}>
          <aside className="min-w-0">
            <p className="break-all text-sm text-muted">{selected.email}</p>
            <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-y py-4 text-xs">
              <dt className="text-muted">{t("common.status")}</dt>
              <dd className="text-end font-medium">
                {userStatusLabel(selected.status, t)}
              </dd>
              <dt className="text-muted">{t("adminUsers.mfa")}</dt>
              <dd className="text-end font-medium">
                {selected.mfaRequired
                  ? t("adminUsers.required")
                  : t("adminUsers.optional")}
              </dd>
              <dt className="text-muted">{t("adminUsers.activeSessions")}</dt>
              <dd className="text-end font-medium">
                {selected.activeSessionCount}
              </dd>
              <dt className="text-muted">
                {locale === "tr" ? "Güvenilen cihazlar" : "Trusted devices"}
              </dt>
              <dd className="text-end font-medium">
                {selected.trustedDeviceCount}
              </dd>
            </dl>
            {canManage ? (
              <>
                <label className="mt-5 block text-sm font-semibold">
                  {t("adminSubscriptions.actionReason")}
                  <textarea
                    required
                    minLength={5}
                    maxLength={500}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className={`${field} mt-2 min-h-24 py-3`}
                  />
                </label>
                <label className="mt-4 block text-sm font-semibold">
                  {t("auth.password")}
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={`${field} mt-2`}
                  />
                </label>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  {actions.map((action) => {
                    const Icon = actionIcon(action);
                    const destructive = [
                      "SUSPEND",
                      "FORCE_LOGOUT",
                      "RESET_MFA",
                    ].includes(action);
                    return (
                      <button
                        key={action}
                        type="button"
                        className={`${button} min-h-12 px-2 ${destructive ? "border-red-300 bg-red-50 text-red-800" : "border-slate-300 bg-white"}`}
                        onClick={() => setPendingAction(action)}
                        disabled={
                          working || reason.trim().length < 5 || !password
                        }
                      >
                        {working ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <Icon className="size-4" />
                        )}
                        {userActionLabel(action, locale)}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="mt-5 rounded-xl bg-slate-50 p-3 text-sm text-muted">
                {locale === "tr"
                  ? "Bu rol kullanıcı bilgilerini yalnızca görüntüleyebilir."
                  : "This role can only view user information."}
              </p>
            )}
          </aside>
          </AdminRecordDialog>
        ) : (
          <aside className="panel grid min-h-64 place-items-center rounded-2xl p-6 text-center text-sm text-muted">
            {locale === "tr"
              ? "Ayrıntıları görmek için bir kullanıcı seçin."
              : "Select a user to view details."}
          </aside>
        )}
      </div>
      {selected && pendingAction ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !working)
              setPendingAction(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-user-action-title"
            className="w-full max-w-lg rounded-2xl border bg-white p-6 text-slate-950 shadow-2xl"
          >
            <h2 id="admin-user-action-title" className="text-xl font-semibold">
              {locale === "tr"
                ? "Yönetici işlemini onaylayın"
                : "Confirm administrator action"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              <strong>{userActionLabel(pendingAction, locale)}</strong>
              {" — "}
              {selected.name} ({selected.email})
            </p>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-4 text-xs">
              <dt className="text-slate-500">
                {locale === "tr" ? "Hedef" : "Target"}
              </dt>
              <dd className="break-all text-end font-semibold">
                {selected.email}
              </dd>
              <dt className="text-slate-500">
                {locale === "tr" ? "Gerekçe" : "Reason"}
              </dt>
              <dd className="break-words text-end font-semibold">
                {reason.trim()}
              </dd>
            </dl>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              {locale === "tr"
                ? "Bu işlem yeniden doğrulanacak ve denetim kaydına yazılacaktır."
                : "This action will be re-authenticated and recorded in the audit log."}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className={button}
                disabled={working}
                onClick={() => setPendingAction(null)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                autoFocus
                className={`${button} border-red-700 bg-red-700 text-white`}
                disabled={working}
                onClick={() => void runAction()}
              >
                {working ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                {locale === "tr" ? "İşlemi onayla" : "Confirm action"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function availableActions(user: AdminUser): UserAction[] {
  return [
    user.status === "SUSPENDED" ? "REACTIVATE" : "SUSPEND",
    "FORCE_LOGOUT",
    "RESET_MFA",
    "REQUIRE_MFA",
  ];
}

function userStatusLabel(
  status: AdminUser["status"],
  t: ReturnType<typeof useI18n>["t"],
) {
  if (status === "ACTIVE") return t("users.active");
  if (status === "SUSPENDED") return t("users.suspended");
  return t("users.invitedStatus");
}

function userActionLabel(action: UserAction, locale: string) {
  const tr: Record<UserAction, string> = {
    SUSPEND: "Askıya al",
    REACTIVATE: "Yeniden etkinleştir",
    FORCE_LOGOUT: "Tüm oturumları kapat",
    RESET_MFA: "MFA'yı sıfırla",
    REQUIRE_MFA: "MFA'yı zorunlu kıl",
  };
  const en: Record<UserAction, string> = {
    SUSPEND: "Suspend",
    REACTIVATE: "Reactivate",
    FORCE_LOGOUT: "Revoke all sessions",
    RESET_MFA: "Reset MFA",
    REQUIRE_MFA: "Require MFA",
  };
  return (locale === "tr" ? tr : en)[action];
}

function actionIcon(action: UserAction) {
  if (action === "SUSPEND") return UserRoundX;
  if (action === "REACTIVATE") return UserRoundCheck;
  if (action === "FORCE_LOGOUT") return LogOut;
  if (action === "RESET_MFA") return KeyRound;
  return ShieldCheck;
}
