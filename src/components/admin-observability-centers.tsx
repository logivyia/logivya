"use client";
import { AdminMetricCard } from "./admin-metric-card";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";

import { formatDateTime } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";

type PageInfo = { page: number; limit: number; total: number; pages: number };
type RelatedEntity = {
  id: string;
  name?: string | null;
  emailMasked?: string | null;
} | null;
type AuditRow = {
  id: string;
  actorType: string;
  actorEmailMasked?: string | null;
  action: string;
  result: string;
  reason?: string | null;
  entityType: string;
  entityId?: string | null;
  correlationId?: string | null;
  clientPlatform?: string | null;
  appVersion?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  metadata?: unknown;
  createdAt: string;
  company: { id: string; name: string };
  user: RelatedEntity;
};
type SecurityRow = {
  id: string;
  severity: string;
  type: string;
  message: string;
  result: string;
  status: string;
  errorCode?: string | null;
  source?: string | null;
  correlationId?: string | null;
  clientPlatform?: string | null;
  appVersion?: string | null;
  investigationNote?: string | null;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  company: { id: string; name: string } | null;
  user: RelatedEntity;
};
type SecurityMetrics = {
  total: number;
  open: number;
  critical: number;
  failedLogins: number;
  blockedAttempts: number;
  mfaEnabledUsers: number;
  suspiciousDevices: number;
  suspiciousIps: number;
  tenantViolations: number;
  recentAdminActions: number;
};

const emptySecurityMetrics: SecurityMetrics = {
  total: 0,
  open: 0,
  critical: 0,
  failedLogins: 0,
  blockedAttempts: 0,
  mfaEnabledUsers: 0,
  suspiciousDevices: 0,
  suspiciousIps: 0,
  tenantViolations: 0,
  recentAdminActions: 0,
};

const field =
  "min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-orange-400";
const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold disabled:opacity-40";

function useLabels() {
  const { locale } = useI18n();
  const tr = locale === "tr";
  return {
    locale,
    search: tr ? "Ara" : "Search",
    apply: tr ? "Uygula" : "Apply",
    reset: tr ? "Temizle" : "Reset",
    all: tr ? "Tümü" : "All",
    dateFrom: tr ? "Başlangıç tarihi" : "Date from",
    dateTo: tr ? "Bitiş tarihi" : "Date to",
    details: tr ? "Olay detayı" : "Event detail",
    empty: tr ? "Kayıt bulunamadı." : "No records found.",
    failed: tr ? "Veriler yüklenemedi." : "Data could not be loaded.",
    previous: tr ? "Önceki" : "Previous",
    next: tr ? "Sonraki" : "Next",
    close: tr ? "Kapat" : "Close",
  };
}

function safeJson(value: unknown) {
  if (value == null) return "-";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "-";
  }
}

function readableEnum(value: string | null | undefined, locale: string) {
  if (!value) return "-";
  if (locale === "tr" && turkishOperationalLabels[value]) {
    return turkishOperationalLabels[value];
  }
  return value
    .replace(/[_-]+/g, " ")
    .toLocaleLowerCase(locale)
    .replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase(locale));
}

const turkishOperationalLabels: Record<string, string> = {
  SUCCESS: "Başarılı",
  DENIED: "Reddedildi",
  FAILED: "Başarısız",
  PARTIAL: "Kısmi",
  OPEN: "Açık",
  ACKNOWLEDGED: "İncelemeye alındı",
  RESOLVED: "Çözüldü",
  DISMISSED: "Geçersiz sinyal",
  INFO: "Bilgi",
  LOW: "Düşük",
  MEDIUM: "Orta",
  HIGH: "Yüksek",
  CRITICAL: "Kritik",
  AUTH_LOGIN_SUCCEEDED: "Giriş başarılı",
  AUTH_LOGIN_FAILED: "Giriş başarısız",
  AUTH_RATE_LIMITED: "Giriş denemesi sınırlandı",
  AUTH_REFRESH_TOKEN_REPLAY_DETECTED:
    "Oturum yenileme anahtarı yeniden kullanıldı",
  AUTH_REFRESH_TOKEN_REJECTED: "Oturum yenileme reddedildi",
  AUTH_REFRESH_TOKEN_RETRY_RECOVERED: "Oturum yenileme tekrarında düzeldi",
  MFA_SETUP_REQUIRED: "İki aşamalı doğrulama kurulumu gerekli",
  MFA_CHALLENGE_ISSUED: "İki aşamalı doğrulama istendi",
  MFA_VERIFICATION_FAILED: "İki aşamalı doğrulama başarısız",
  MFA_LOGIN_SUCCEEDED: "İki aşamalı doğrulamalı giriş başarılı",
  MFA_RECOVERY_CODE_USED: "Kurtarma kodu kullanıldı",
  MFA_ENABLED: "İki aşamalı doğrulama etkinleştirildi",
  MFA_METHOD_DISABLED: "Doğrulama yöntemi kapatıldı",
  MFA_TRUSTED_DEVICE_REVOKED: "Güvenilir cihaz yetkisi kaldırıldı",
  MFA_RECOVERY_CODES_REGENERATED: "Kurtarma kodları yenilendi",
  MFA_EMAIL_ENABLED: "E-posta doğrulaması etkinleştirildi",
  MFA_EMAIL_ENROLLMENT_STARTED: "E-posta doğrulama kurulumu başlatıldı",
  MFA_ENROLLMENT_STARTED: "Doğrulama kurulumu başlatıldı",
  MFA_ENROLLMENT_FAILED: "Doğrulama kurulumu başarısız",
  MFA_ENROLLMENT_CANCELLED: "Doğrulama kurulumu iptal edildi",
  ADMIN_REAUTH_FAILED: "Yönetici yeniden doğrulaması başarısız",
  ADMIN_REAUTH_SUCCEEDED: "Yönetici yeniden doğrulaması başarılı",
  PLATFORM_ADMIN: "Platform yöneticisi",
  ADMIN_AUDIT_LOG_ACCESSED: "Denetim kayıtları görüntülendi",
  ADMIN_SECURITY_LOG_ACCESSED: "Güvenlik kayıtları görüntülendi",
  ADMIN_SECURITY_EVENT_STATUS_CHANGED: "Güvenlik olayı durumu değiştirildi",
  ADMIN_PRIVACY_REQUEST_STATUS_CHANGED: "Gizlilik talebi durumu değiştirildi",
  WHATSAPP_GROUPS_SYNCED: "WhatsApp grupları eşitlendi",
  WHATSAPP_CONNECTED: "WhatsApp bağlantısı kuruldu",
  WHATSAPP_DISCONNECTED: "WhatsApp bağlantısı kesildi",
  WHATSAPP_SESSION_RECOVERY_REQUESTED: "WhatsApp oturum kurtarma istendi",
  WHATSAPP_QR_GENERATED: "WhatsApp QR kodu oluşturuldu",
  AUTH_DEVICE_SESSION_REVOKED: "Cihaz oturumu sonlandırıldı",
  AUTH_LOGOUT_EVERYWHERE: "Tüm oturumlar sonlandırıldı",
  USER_CREATED_BY_OWNER: "Çalışma alanı sahibi kullanıcı oluşturdu",
  USER_FIRST_LOGIN: "Kullanıcı ilk girişini yaptı",
  USER_PASSWORD_CHANGED_FIRST_LOGIN: "İlk giriş parolası değiştirildi",
  USER_REMOVED: "Kullanıcı kaldırıldı",
  USER_ROLE_CHANGE_ATTEMPT_REJECTED: "Rol değiştirme girişimi reddedildi",
  USER_TEMPORARY_PASSWORD_RESET: "Geçici parola yenilendi",
  PAYMENT_FAILED: "Ödeme başarısız",
  PAYMENT_RECEIVED: "Ödeme alındı",
  INVOICE_CREATED: "Fatura oluşturuldu",
  IYZICO_CHECKOUT_INITIALIZED: "iyzico ödeme oturumu başlatıldı",
  TRIAL_ELIGIBILITY_REJECTED: "Deneme uygunluğu reddedildi",
  DELETION_REQUEST_CANCELED: "Silme talebi iptal edildi",
};

function Pagination({
  page,
  onPage,
  labels,
}: {
  page: PageInfo;
  onPage: (page: number) => void;
  labels: ReturnType<typeof useLabels>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
      <span className="text-slate-500">
        {page.total} · {page.page}/{page.pages}
      </span>
      <div className="flex gap-2">
        <button
          className={button}
          disabled={page.page <= 1}
          onClick={() => onPage(page.page - 1)}
        >
          <ChevronLeft className="size-4" />
          {labels.previous}
        </button>
        <button
          className={button}
          disabled={page.page >= page.pages}
          onClick={() => onPage(page.page + 1)}
        >
          {labels.next}
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

function DetailDialog({
  title,
  onClose,
  children,
  labels,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  labels: ReturnType<typeof useLabels>;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={labels.details}
    >
      <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-2xl">
        <header className="sticky top-0 flex items-center justify-between gap-4 border-b bg-white px-5 py-4">
          <h2 className="min-w-0 truncate font-semibold">{title}</h2>
          <button className={button} onClick={onClose}>
            {labels.close}
          </button>
        </header>
        <div className="grid gap-4 p-5">{children}</div>
      </section>
    </div>
  );
}

function DetailFields({
  values,
}: {
  values: Array<[string, string | null | undefined]>;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {values.map(([label, value]) => (
        <div key={label} className="border-b border-slate-100 pb-2">
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className="mt-1 break-all text-sm">{value || "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AdminAuditCenter() {
  const labels = useLabels();
  const tr = labels.locale === "tr";
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [pagination, setPagination] = useState<PageInfo>({
    page: 1,
    limit: 50,
    total: 0,
    pages: 1,
  });
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    q: "",
    action: "",
    result: "",
    entityType: "",
    dateFrom: "",
    dateTo: "",
  });

  const load = useCallback(
    async (page = 1, nextFilters = filters) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: String(page), limit: "50" });
        Object.entries(nextFilters).forEach(([key, value]) => {
          if (value) params.set(key, value);
        });
        const response = await fetch(`/api/admin/activity?${params}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("AUDIT_LOAD_FAILED");
        const payload = await response.json();
        setRows(payload.logs || []);
        setPagination(payload.pagination);
      } catch {
        setError(labels.failed);
      } finally {
        setLoading(false);
      }
    },
    [filters, labels.failed],
  );

  useEffect(() => {
    void load(1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    const empty = {
      q: "",
      action: "",
      result: "",
      entityType: "",
      dateFrom: "",
      dateTo: "",
    };
    setFilters(empty);
    void load(1, empty);
  }

  return (
    <>
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase text-orange-600">
          {tr ? "İzlenebilirlik" : "Traceability"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          {tr ? "Denetim Merkezi" : "Audit Center"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {pagination.total} {tr ? "değiştirilemez olay" : "immutable events"}
        </p>
      </header>
      <form
        className="mb-5 grid gap-3 lg:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault();
          void load(1);
        }}
      >
        <label className="relative lg:col-span-2">
          <Search className="absolute left-3 top-3.5 size-4 text-slate-400" />
          <input
            className={`${field} w-full pl-10`}
            aria-label={labels.search}
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder={labels.search}
          />
        </label>
        <input
          className={field}
          aria-label={tr ? "Eylem" : "Action"}
          value={filters.action}
          onChange={(e) =>
            setFilters({ ...filters, action: e.target.value.toUpperCase() })
          }
          placeholder={tr ? "Eylem" : "Action"}
        />
        <input
          className={field}
          aria-label={tr ? "Hedef türü" : "Target type"}
          value={filters.entityType}
          onChange={(e) =>
            setFilters({ ...filters, entityType: e.target.value })
          }
          placeholder={tr ? "Hedef türü" : "Target type"}
        />
        <select
          className={field}
          aria-label={tr ? "Sonuç" : "Result"}
          value={filters.result}
          onChange={(e) => setFilters({ ...filters, result: e.target.value })}
        >
          <option value="">{labels.all}</option>
          {["SUCCESS", "DENIED", "FAILED", "PARTIAL"].map((x) => (
            <option key={x} value={x}>
              {readableEnum(x, labels.locale)}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button className={`${button} flex-1 bg-orange-500 text-slate-950`}>
            <Search className="size-4" />
            {labels.apply}
          </button>
          <button
            type="button"
            className={button}
            onClick={reset}
            aria-label={labels.reset}
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
        <input
          className={field}
          type="date"
          aria-label={labels.dateFrom}
          value={filters.dateFrom}
          onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
        />
        <input
          className={field}
          type="date"
          aria-label={labels.dateTo}
          value={filters.dateTo}
          onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
        />
      </form>
      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th scope="col" className="p-4">
                  {tr ? "Eylem" : "Action"}
                </th>
                <th scope="col">{tr ? "Sonuç" : "Result"}</th>
                <th scope="col">{tr ? "Hedef" : "Target"}</th>
                <th scope="col">{tr ? "Çalışma alanı" : "Workspace"}</th>
                <th scope="col">{tr ? "Aktör" : "Actor"}</th>
                <th scope="col">{tr ? "Tarih" : "Date"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t hover:bg-slate-50">
                  <td className="p-4 font-medium">
                    <button
                      type="button"
                      className="text-left font-medium text-orange-700 hover:underline"
                      onClick={() => setSelected(row)}
                    >
                      {readableEnum(row.action, labels.locale)}
                    </button>
                  </td>
                  <td>{readableEnum(row.result, labels.locale)}</td>
                  <td>
                    {row.entityType}
                    {row.entityId ? ` · ${row.entityId}` : ""}
                  </td>
                  <td>{row.company.name}</td>
                  <td>
                    {row.actorEmailMasked ||
                      row.user?.emailMasked ||
                      readableEnum(row.actorType, labels.locale)}
                  </td>
                  <td>{formatDateTime(row.createdAt, labels.locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !rows.length ? (
          <p className="p-10 text-center text-sm text-slate-500">
            {labels.empty}
          </p>
        ) : null}
        {loading ? (
          <p className="p-10 text-center text-sm text-slate-500">...</p>
        ) : null}
        <Pagination
          page={pagination}
          onPage={(page) => void load(page)}
          labels={labels}
        />
      </div>
      {selected ? (
        <DetailDialog
          title={selected.action}
          onClose={() => setSelected(null)}
          labels={labels}
        >
          <DetailFields
            values={[
              [tr ? "Sonuç" : "Result", selected.result],
              [
                tr ? "Aktör" : "Actor",
                selected.actorEmailMasked ||
                  selected.user?.emailMasked ||
                  selected.actorType,
              ],
              [tr ? "Çalışma alanı" : "Workspace", selected.company.name],
              [
                tr ? "Hedef" : "Target",
                `${selected.entityType}${selected.entityId ? ` · ${selected.entityId}` : ""}`,
              ],
              [tr ? "Neden" : "Reason", selected.reason],
              [
                tr ? "Korelasyon kimliği" : "Correlation ID",
                selected.correlationId,
              ],
              [tr ? "İstemci" : "Client", selected.clientPlatform],
              [tr ? "Uygulama sürümü" : "App version", selected.appVersion],
              [
                tr ? "Tarih" : "Date",
                formatDateTime(selected.createdAt, labels.locale),
              ],
            ]}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">
                {tr ? "Önce" : "Before"}
              </h3>
              <pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                {safeJson(selected.beforeState)}
              </pre>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">
                {tr ? "Sonra" : "After"}
              </h3>
              <pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                {safeJson(selected.afterState)}
              </pre>
            </div>
          </div>
        </DetailDialog>
      ) : null}
    </>
  );
}

export function AdminSecurityCenter({ canManage }: { canManage: boolean }) {
  const labels = useLabels();
  const tr = labels.locale === "tr";
  const [rows, setRows] = useState<SecurityRow[]>([]);
  const [pagination, setPagination] = useState<PageInfo>({
    page: 1,
    limit: 50,
    total: 0,
    pages: 1,
  });
  const [metrics, setMetrics] = useState<SecurityMetrics>(emptySecurityMetrics);
  const [selected, setSelected] = useState<SecurityRow | null>(null);
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    q: "",
    eventStatus: "",
    severity: "",
    dateFrom: "",
    dateTo: "",
  });

  const load = useCallback(
    async (page = 1, nextFilters = filters) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: String(page), limit: "50" });
        Object.entries(nextFilters).forEach(([key, value]) => {
          if (value) params.set(key, value);
        });
        const response = await fetch(`/api/admin/security/events?${params}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("SECURITY_LOAD_FAILED");
        const payload = await response.json();
        setRows(payload.events || []);
        setPagination(payload.pagination);
        setMetrics({ ...emptySecurityMetrics, ...(payload.metrics || {}) });
      } catch {
        setError(labels.failed);
      } finally {
        setLoading(false);
      }
    },
    [filters, labels.failed],
  );

  useEffect(() => {
    void load(1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function update(status: "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED") {
    if (!canManage || !selected || note.trim().length < 5 || !password) return;
    setLoading(true);
    setError("");
    try {
      const reauth = await fetch("/api/admin/security/re-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!reauth.ok) throw new Error("ADMIN_REAUTH_FAILED");
      const response = await fetch(
        `/api/admin/security/events/${selected.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, investigationNote: note.trim() }),
        },
      );
      if (!response.ok) throw new Error("SECURITY_UPDATE_FAILED");
      setSelected(null);
      setNote("");
      setPassword("");
      await load(pagination.page);
    } catch {
      setError(labels.failed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase text-orange-600">
          {tr ? "Güvenlik" : "Security"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          {tr ? "Güvenlik Olayları" : "Security Events"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {tr
            ? `${metrics.open} açık · ${metrics.critical} kritik`
            : `${metrics.open} open · ${metrics.critical} critical`}
        </p>
      </header>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [
            tr ? "Başarısız girişler (24s)" : "Failed logins (24h)",
            metrics.failedLogins,
          ],
          [
            tr ? "Engellenen denemeler (24s)" : "Blocked attempts (24h)",
            metrics.blockedAttempts,
          ],
          [
            tr ? "2FA etkin kullanıcı" : "2FA enabled users",
            metrics.mfaEnabledUsers,
          ],
          [
            tr ? "Şüpheli cihaz sinyali" : "Suspicious device signals",
            metrics.suspiciousDevices,
          ],
          [
            tr ? "Şüpheli IP (24s)" : "Suspicious IPs (24h)",
            metrics.suspiciousIps,
          ],
          [
            tr ? "Tenant ihlali (24s)" : "Tenant violations (24h)",
            metrics.tenantViolations,
          ],
          [
            tr ? "Yönetici işlemi (24s)" : "Admin actions (24h)",
            metrics.recentAdminActions,
          ],
          [tr ? "Açık güvenlik olayı" : "Open security events", metrics.open],
        ].map(([label,value]) => <AdminMetricCard key={String(label)} label={String(label)} value={String(value ?? "-")} recordsAvailable />)}
      </div>
      <form id="admin-records"
        className="mb-5 grid gap-3 lg:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault();
          void load(1);
        }}
      >
        <label className="relative lg:col-span-2">
          <Search className="absolute left-3 top-3.5 size-4 text-slate-400" />
          <input
            className={`${field} w-full pl-10`}
            aria-label={labels.search}
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder={labels.search}
          />
        </label>
        <select
          className={field}
          aria-label={tr ? "Durum" : "Status"}
          value={filters.eventStatus}
          onChange={(e) =>
            setFilters({ ...filters, eventStatus: e.target.value })
          }
        >
          <option value="">{labels.all}</option>
          {["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"].map((x) => (
            <option key={x} value={x}>
              {readableEnum(x, labels.locale)}
            </option>
          ))}
        </select>
        <select
          className={field}
          aria-label={tr ? "Önem" : "Severity"}
          value={filters.severity}
          onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
        >
          <option value="">{labels.all}</option>
          {["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((x) => (
            <option key={x} value={x}>
              {readableEnum(x, labels.locale)}
            </option>
          ))}
        </select>
        <input
          className={field}
          type="date"
          aria-label={labels.dateFrom}
          value={filters.dateFrom}
          onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
        />
        <input
          className={field}
          type="date"
          aria-label={labels.dateTo}
          value={filters.dateTo}
          onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
        />
        <button className={`${button} bg-orange-500 text-slate-950`}>
          <Search className="size-4" />
          {labels.apply}
        </button>
      </form>
      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th scope="col" className="p-4">
                  {tr ? "Olay" : "Event"}
                </th>
                <th scope="col">{tr ? "Önem" : "Severity"}</th>
                <th scope="col">{tr ? "Durum" : "Status"}</th>
                <th scope="col">
                  {tr ? "Çalışma alanı / Kullanıcı" : "Workspace / User"}
                </th>
                <th scope="col">
                  {tr ? "Korelasyon kimliği" : "Correlation ID"}
                </th>
                <th scope="col">{tr ? "Tarih" : "Date"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t hover:bg-slate-50">
                  <td className="p-4 font-medium">
                    <button
                      type="button"
                      className="text-left font-medium text-orange-700 hover:underline"
                      onClick={() => {
                        setSelected(row);
                        setNote(row.investigationNote || "");
                      }}
                    >
                      {readableEnum(row.type, labels.locale)}
                    </button>
                  </td>
                  <td>{readableEnum(row.severity, labels.locale)}</td>
                  <td>{readableEnum(row.status, labels.locale)}</td>
                  <td>{row.company?.name || row.user?.emailMasked || "-"}</td>
                  <td className="font-mono text-xs">
                    {row.correlationId || "-"}
                  </td>
                  <td>{formatDateTime(row.createdAt, labels.locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !rows.length ? (
          <p className="p-10 text-center text-sm text-slate-500">
            {labels.empty}
          </p>
        ) : null}
        {loading ? (
          <p className="p-10 text-center text-sm text-slate-500">...</p>
        ) : null}
        <Pagination
          page={pagination}
          onPage={(page) => void load(page)}
          labels={labels}
        />
      </div>
      {selected ? (
        <DetailDialog
          title={readableEnum(selected.type, labels.locale)}
          onClose={() => {
            setSelected(null);
            setPassword("");
          }}
          labels={labels}
        >
          <DetailFields
            values={[
              [
                tr ? "Önem" : "Severity",
                readableEnum(selected.severity, labels.locale),
              ],
              [
                tr ? "Durum" : "Status",
                readableEnum(selected.status, labels.locale),
              ],
              [
                tr ? "Sonuç" : "Result",
                readableEnum(selected.result, labels.locale),
              ],
              [tr ? "Kaynak" : "Source", selected.source],
              [
                tr ? "Güvenli hata kodu" : "Safe error code",
                selected.errorCode,
              ],
              [tr ? "Çalışma alanı" : "Workspace", selected.company?.name],
              [tr ? "Kullanıcı" : "User", selected.user?.emailMasked],
              [
                tr ? "Korelasyon kimliği" : "Correlation ID",
                selected.correlationId,
              ],
              [tr ? "İstemci" : "Client", selected.clientPlatform],
              [tr ? "Uygulama sürümü" : "App version", selected.appVersion],
              [
                tr ? "Tarih" : "Date",
                formatDateTime(selected.createdAt, labels.locale),
              ],
            ]}
          />
          {canManage && ["OPEN", "ACKNOWLEDGED"].includes(selected.status) ? (
            <>
              <label className="grid gap-2 text-sm font-semibold">
                {tr ? "İnceleme notu" : "Investigation note"}
                <textarea
                  className="min-h-24 rounded-lg border border-slate-200 p-3 font-normal outline-none focus:border-orange-400"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                {tr ? "Yönetici parolası" : "Administrator password"}
                <input
                  type="password"
                  autoComplete="current-password"
                  className={field}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                {selected.status === "OPEN" ? (
                  <button
                    className={button}
                    disabled={note.trim().length < 5 || !password || loading}
                    onClick={() => void update("ACKNOWLEDGED")}
                  >
                    <ShieldAlert className="size-4" />
                    {tr ? "İncelemeye al" : "Acknowledge"}
                  </button>
                ) : null}
                <button
                  className={button}
                  disabled={note.trim().length < 5 || !password || loading}
                  onClick={() => void update("RESOLVED")}
                >
                  <CheckCircle2 className="size-4" />
                  {tr ? "Çözüldü" : "Resolve"}
                </button>
                <button
                  className={button}
                  disabled={note.trim().length < 5 || !password || loading}
                  onClick={() => void update("DISMISSED")}
                >
                  {tr ? "Geçersiz sinyal" : "Dismiss"}
                </button>
              </div>
            </>
          ) : (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
              {!canManage
                ? tr
                  ? "Bu rol güvenlik olaylarını yalnızca görüntüleyebilir."
                  : "This role can only view security events."
                : tr
                  ? "Bu olay için uygulanabilir başka durum geçişi yok."
                  : "No further status transition is available for this event."}
            </p>
          )}
        </DetailDialog>
      ) : null}
    </>
  );
}
