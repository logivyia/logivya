"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminMetricCard } from "./admin-metric-card";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  Building2,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { useSearchParams } from "next/navigation";
import { apiErrorMessage } from "@/i18n/api-error";
import { formatDateTime, formatNumber } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";

type CompanyRow = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  securityStatus: "ACTIVE" | "UNDER_INVESTIGATION" | "DISABLED";
  createdAt: string;
  lastActivityAt: string;
  owner: {
    name: string;
    email?: string;
    phone?: string | null;
    status?: string;
  };
  subscriptions: Array<{ status: string; plan: { name: string } }>;
  seatUsage?: { used: number; limit: number; integrityStatus: string } | null;
  whatsAppAccountCount?: number | null;
};

type CompanyMetrics = {
  total: number;
  active: number;
  disabled: number;
  members: number | null;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type PendingAction = { company: CompanyRow; kind: "suspend" | "reactivate" };

const field =
  "min-h-11 w-full rounded-xl border bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100";
const button =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50";

export function AdminCompaniesPage({
  canManage,
  canReadUsers,
  canReadBilling,
  canReadWhatsApp,
}: {
  canManage: boolean;
  canReadUsers: boolean;
  canReadBilling: boolean;
  canReadWhatsApp: boolean;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "ALL");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [metrics, setMetrics] = useState<CompanyMetrics>({
    total: 0,
    active: 0,
    disabled: 0,
    members: null,
  });
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (appliedQuery) params.set("q", appliedQuery);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      params.set("page", String(page));
      params.set("pageSize", "50");
      const response = await fetch(
        `/api/admin/companies${params.size ? `?${params}` : ""}`,
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(t, body));
      setCompanies(body.companies || []);
      setMetrics(
        body.metrics || {
          total: 0,
          active: 0,
          disabled: 0,
          members: null,
        },
      );
      setPagination(
        body.pagination || {
          page,
          pageSize: 50,
          total: 0,
          totalPages: 1,
        },
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : t("errors.generic"),
      );
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, page, statusFilter, t]);

  useEffect(() => {
    void load();
  }, [load]);

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

  function openAction(company: CompanyRow, kind: PendingAction["kind"]) {
    setPending({ company, kind });
    setReason("");
    setPassword("");
    setError("");
    setNotice("");
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !canManage ||
      !pending ||
      working ||
      reason.trim().length < 5 ||
      !password
    )
      return;
    setWorking(true);
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
      const response = await fetch(
        `/api/admin/companies/${encodeURIComponent(pending.company.id)}/${pending.kind}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(t, body));
      setPending(null);
      setReason("");
      setPassword("");
      setNotice(
        locale === "tr"
          ? "Şirket güvenlik durumu güncellendi ve işlem denetim kaydına alındı."
          : "Company security status was updated and audit logged.",
      );
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

  const visible = companies ?? [];
  const metricCards: Array<{ label: string; value: number; Icon: LucideIcon }> =
    [
      {
        label: t("admin.metrics.totalCompanies"),
        value: metrics.total,
        Icon: Building2,
      },
      { label: t("users.active"), value: metrics.active, Icon: ShieldCheck },
      { label: t("users.suspended"), value: metrics.disabled, Icon: ShieldOff },
      ...(canReadUsers && metrics.members !== null
        ? [{ label: t("users.user"), value: metrics.members, Icon: Users }]
        : []),
    ];
  return (
    <>
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">
            {t("adminCompanies.eyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            {t("adminCompanies.title")}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {locale === "tr"
              ? "Çalışma alanlarını, üyelik kapasitesini ve güvenlik durumunu tek merkezden yönetin."
              : "Manage workspaces, seat capacity, and security status from one center."}
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
          className="mb-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="mb-5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {notice}
        </p>
      ) : null}
      <section
        className={`mb-5 grid grid-cols-2 gap-3 ${metricCards.length > 3 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}
      >
        {metricCards.map(({ label, value, Icon }, index) => <AdminMetricCard key={label} label={label} value={formatNumber(value, locale)} onClick={() => { if (index === 3) router.push("/admin/users"); else { setStatusFilter(["ALL", "ACTIVE", "DISABLED"][index]); setPage(1); } }}><Icon className="size-5 text-orange-600" /></AdminMetricCard>)}

      </section>
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
            setPage(1);
            setStatusFilter(event.target.value);
          }}
          className={field}
        >
          <option value="ALL">
            {locale === "tr" ? "Tüm durumlar" : "All statuses"}
          </option>
          <option value="ACTIVE">{t("status.active")}</option>
          <option value="UNDER_INVESTIGATION">
            {locale === "tr" ? "İncelemede" : "Under investigation"}
          </option>
          <option value="DISABLED">{t("adminFeatureFlags.disabled")}</option>
        </select>
        <button
          type="submit"
          className={`${button} border-orange-600 bg-orange-600 px-5 text-white`}
        >
          <Search className="size-4" />
          {locale === "tr" ? "Ara" : "Search"}
        </button>
      </form>
      <section
        className="panel overflow-x-auto rounded-2xl p-5"
        aria-busy={loading}
      >
        {loading && !companies ? (
          <div className="grid min-h-52 place-items-center">
            <LoaderCircle className="animate-spin text-primary" />
          </div>
        ) : (
          <>
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="py-3">
                    {t("common.company")}
                  </th>
                  {canReadBilling ? (
                    <>
                      <th scope="col">{t("adminSubscriptions.plan")}</th>
                      <th scope="col">{t("adminSubscriptions.seats")}</th>
                    </>
                  ) : null}
                  {canReadWhatsApp ? <th scope="col">WhatsApp</th> : null}
                  <th scope="col">{t("common.status")}</th>
                  <th scope="col">
                    {locale === "tr" ? "Son etkinlik" : "Last activity"}
                  </th>
                  <th scope="col">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((company) => (
                  <tr
                    key={company.id}
                    className="border-b align-top last:border-0"
                  >
                    <td className="py-4 pe-4">
                      <Link
                        className="font-semibold text-primary hover:underline"
                        href={`/admin/companies/${company.id}`}
                      >
                        {company.name}
                      </Link>
                      <p className="mt-1 text-xs text-muted">
                        {company.owner.name}
                        {canReadUsers && company.owner.email
                          ? ` · ${company.owner.email}`
                          : ""}
                      </p>
                    </td>
                    {canReadBilling ? (
                      <>
                        <td className="pe-4">
                          {company.subscriptions[0]?.plan.name || "-"}
                        </td>
                        <td className="pe-4">
                          {company.seatUsage
                            ? `${company.seatUsage.used} / ${company.seatUsage.limit}`
                            : "-"}
                          {company.seatUsage &&
                          company.seatUsage.integrityStatus !== "OK" ? (
                            <p className="mt-1 text-xs font-semibold text-amber-700">
                              {readableStatus(
                                company.seatUsage.integrityStatus,
                                locale,
                              )}
                            </p>
                          ) : null}
                        </td>
                      </>
                    ) : null}
                    {canReadWhatsApp ? (
                      <td className="pe-4">
                        {formatNumber(
                          company.whatsAppAccountCount ?? 0,
                          locale,
                        )}
                      </td>
                    ) : null}
                    <td className="pe-4">
                      {companyStatus(company.securityStatus, locale, t)}
                    </td>
                    <td className="whitespace-nowrap pe-4">
                      {formatDateTime(company.lastActivityAt, locale)}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/companies/${company.id}`}
                          className={button}
                        >
                          {locale === "tr" ? "Detay" : "Details"}
                        </Link>
                        {canManage ? (
                          company.securityStatus === "DISABLED" ? (
                            <button
                              type="button"
                              className={`${button} border-emerald-300 text-emerald-800`}
                              onClick={() => openAction(company, "reactivate")}
                            >
                              <ShieldCheck className="size-4" />
                              {locale === "tr" ? "Etkinleştir" : "Reactivate"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={`${button} border-red-300 text-red-800`}
                              onClick={() => openAction(company, "suspend")}
                            >
                              <ShieldOff className="size-4" />
                              {locale === "tr" ? "Askıya al" : "Suspend"}
                            </button>
                          )
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length ? (
              <p className="py-12 text-center text-sm text-muted">
                {t("admin.list.empty")}
              </p>
            ) : null}
          </>
        )}
      </section>
      {pagination.totalPages > 1 ? (
        <nav
          className="mt-4 flex items-center justify-between gap-3"
          aria-label={locale === "tr" ? "Şirket sayfaları" : "Company pages"}
        >
          <p className="text-xs text-muted">
            {locale === "tr"
              ? `${pagination.total} şirket · ${pagination.page}/${pagination.totalPages}. sayfa`
              : `${pagination.total} companies · page ${pagination.page} of ${pagination.totalPages}`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={button}
              disabled={loading || page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {locale === "tr" ? "Önceki" : "Previous"}
            </button>
            <button
              type="button"
              className={button}
              disabled={loading || page >= pagination.totalPages}
              onClick={() =>
                setPage((current) =>
                  Math.min(pagination.totalPages, current + 1),
                )
              }
            >
              {locale === "tr" ? "Sonraki" : "Next"}
            </button>
          </div>
        </nav>
      ) : null}
      {canManage && pending ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !working)
              setPending(null);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="company-action-title"
            onSubmit={submitAction}
            className="w-full max-w-lg rounded-2xl bg-white p-6 text-slate-900 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-orange-600">
                  {pending.company.name}
                </p>
                <h2
                  id="company-action-title"
                  className="mt-2 text-xl font-semibold"
                >
                  {pending.kind === "suspend"
                    ? locale === "tr"
                      ? "Şirketi askıya al"
                      : "Suspend company"
                    : locale === "tr"
                      ? "Şirketi yeniden etkinleştir"
                      : "Reactivate company"}
                </h2>
              </div>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => setPending(null)}
                disabled={working}
                className="grid size-10 place-items-center rounded-xl border"
              >
                <X className="size-4" />
              </button>
            </div>
            {pending.kind === "suspend" ? (
              <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                {locale === "tr"
                  ? "Şirket erişimi kapatılır, kampanyalar duraklatılır ve aktif kullanıcı oturumları sonlandırılır."
                  : "Company access is disabled, campaigns are paused, and active user sessions are revoked."}
              </p>
            ) : null}
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
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className={button}
                onClick={() => setPending(null)}
                disabled={working}
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className={`${button} ${pending.kind === "suspend" ? "border-red-700 bg-red-700" : "border-emerald-700 bg-emerald-700"} text-white`}
                disabled={working || reason.trim().length < 5 || !password}
              >
                {working ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                {locale === "tr" ? "Onayla" : "Confirm"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

function companyStatus(
  status: CompanyRow["securityStatus"],
  locale: string,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (status === "ACTIVE") return t("status.active");
  if (status === "DISABLED") return t("adminFeatureFlags.disabled");
  return locale === "tr" ? "İncelemede" : "Under investigation";
}

function readableStatus(status: string, locale: string) {
  return status
    .replaceAll("_", " ")
    .toLocaleLowerCase(locale)
    .replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase(locale));
}
