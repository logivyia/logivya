"use client";

/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any */
import {
  Fragment,
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { AdminInteractiveTable } from "./admin-interactive-table";
import { AdminMetricCard } from "./admin-metric-card";
import { AdminRecordDialog } from "./admin-record-dialog";
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
import { apiErrorMessage } from "@/i18n/api-error";
import { useI18n } from "@/i18n/provider";

const panel = "panel rounded-2xl p-5";
const button =
  "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const field =
  "w-full rounded-xl border bg-white px-3 py-3 text-sm outline-none";

function Loading() {
  return (
    <div className="grid min-h-60 place-items-center">
      <LoaderCircle className="animate-spin text-primary" />
    </div>
  );
}

function Header({
  title,
  description,
  eyebrow,
}: {
  title: string;
  description: string;
  eyebrow?: string;
}) {
  const { t } = useI18n();
  return (
    <header className="mb-7">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">
        {eyebrow ?? t("operations.eyebrow")}
      </p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </header>
  );
}

function Metric({
  label,
  value,
  Icon,
  href,
}: {
  href?: string;
  label: string;
  value: string | number;
  Icon: typeof Activity;
}) {
  const { locale } = useI18n();
  return (
    <AdminMetricCard label={label} value={typeof value === "number" ? formatNumber(value, locale) : value} href={href}><Icon className="size-5 text-primary" /></AdminMetricCard>
  );
}

function localizedStatus(
  status: string | null | undefined,
  t: ReturnType<typeof useI18n>["t"],
  locale?: string,
) {
  if (!status) return "-";
  const operationalLabel =
    locale === "tr"
      ? operationalStatusLabels.tr[status]
      : locale
        ? operationalStatusLabels.en[status]
        : undefined;
  if (operationalLabel) return operationalLabel;
  const key = `status.${status.toLowerCase()}`;
  const translated = t(key);
  if (translated !== key && translated !== status.toLowerCase())
    return translated;
  return status
    .replace(/[_-]+/g, " ")
    .toLocaleLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase());
}

const operationalStatusLabels: Record<"tr" | "en", Record<string, string>> = {
  tr: {
    HEALTHY: "Sağlıklı",
    DEGRADED: "Performansı düşmüş",
    UNAVAILABLE: "Kullanılamıyor",
    UNKNOWN: "Doğrulanamadı",
    MAINTENANCE: "Bakımda",
    OPEN: "Açık",
    ACKNOWLEDGED: "İncelemeye alındı",
    INVESTIGATING: "İnceleniyor",
    MITIGATED: "Etkisi azaltıldı",
    RESOLVED: "Çözüldü",
    INFO: "Bilgi",
    LOW: "Düşük",
    MEDIUM: "Orta",
    HIGH: "Yüksek",
    CRITICAL: "Kritik",
    AUTH_REFRESH_TOKEN_REJECTED: "Oturum yenileme isteği reddedildi",
    AUTH_REFRESH_TOKEN_REPLAY_DETECTED: "Yinelenen oturum yenileme isteği",
    RISING: "Yükseliyor",
    STABLE: "Kararlı",
    FALLING: "Düşüyor",
    COMPLETED: "Tamamlandı",
    SUCCESS: "Başarılı",
    FAILURE: "Başarısız",
  },
  en: {
    HEALTHY: "Healthy",
    DEGRADED: "Degraded",
    UNAVAILABLE: "Unavailable",
    UNKNOWN: "Unknown",
    MAINTENANCE: "Maintenance",
    OPEN: "Open",
    ACKNOWLEDGED: "Acknowledged",
    INVESTIGATING: "Investigating",
    MITIGATED: "Mitigated",
    RESOLVED: "Resolved",
    INFO: "Info",
    LOW: "Low",
    MEDIUM: "Medium",
    HIGH: "High",
    CRITICAL: "Critical",
    RISING: "Rising",
    STABLE: "Stable",
    FALLING: "Falling",
    COMPLETED: "Completed",
    SUCCESS: "Success",
    FAILURE: "Failure",
  },
};

const systemServiceLabels: Record<string, [string, string]> = {
  api: ["Arka uç API", "Backend API"],
  database: ["PostgreSQL veritabanı", "PostgreSQL database"],
  redis: ["Redis önbelleği", "Redis cache"],
  queues: ["BullMQ kuyrukları", "BullMQ queues"],
  worker: ["WhatsApp mesaj işleyicisi", "WhatsApp message worker"],
  whatsapp: ["WhatsApp operasyonları", "WhatsApp operations"],
  messaging: ["Mesaj teslimatı", "Message delivery"],
  scheduler: ["Zamanlanmış ve yinelenen işler", "Scheduled and recurring jobs"],
  sync: ["Kişi ve grup eşitleme", "Contact and group synchronization"],
  support: ["Destek akışı", "Support flow"],
  email: ["E-posta teslimatı", "Email delivery"],
  notifications: [
    "Bildirim teslimat platformu",
    "Notification delivery platform",
  ],
  authentication: ["Kimlik doğrulama", "Authentication"],
  subscriptions: ["Abonelik yetkileri", "Subscription entitlements"],
  storage: ["Oturum ve nesne depolama", "Session and object storage"],
  push: ["Anlık bildirimler", "Push notifications"],
  backups: ["Veritabanı yedekleri", "Database backups"],
  deployments: ["Üretim dağıtımı", "Production deployment"],
};

const systemSummaryLabels: Record<string, Record<string, string>> = {
  api: {
    HEALTHY: "API erişilebilir ve sağlık verilerini başarıyla topladı.",
  },
  database: {
    HEALTHY: "Veritabanı bağlantısı ve sınırlı sorgu gecikmesi sağlıklı.",
    UNAVAILABLE: "Veritabanı hazırlık kontrolü yanıt vermedi.",
  },
  redis: {
    HEALTHY: "Redis bağlantısı ve komut gecikmesi sağlıklı.",
    UNAVAILABLE: "Redis hazırlık kontrolü yanıt vermedi.",
  },
  queues: {
    HEALTHY: "Kuyruklar erişilebilir ve işlem gerektiren yığılma yok.",
    DEGRADED: "Kuyruk gecikmesi veya başarısız iş oranı inceleme gerektiriyor.",
    UNAVAILABLE: "Kuyruk hazırlık kontrolü yanıt vermedi.",
  },
  worker: {
    HEALTHY: "İşleyici yaşam sinyali güncel ve çalışabilir durumda.",
    DEGRADED: "İşleyici yaşam sinyali veya kapasitesi inceleme gerektiriyor.",
    UNKNOWN: "İşleyici yaşam sinyali doğrulanamadı.",
  },
  whatsapp: {
    HEALTHY: "WhatsApp işleyicisi ve toplu teslimat göstergeleri sağlıklı.",
    DEGRADED:
      "WhatsApp bağlantı veya teslimat göstergeleri inceleme gerektiriyor.",
    UNKNOWN: "WhatsApp operasyon göstergeleri okunamadı.",
  },
  messaging: {
    HEALTHY: "Toplu mesaj teslimatı işletim eşiği içinde.",
    DEGRADED: "Mesaj başarısızlık oranı işletim eşiğinin üzerinde.",
    UNKNOWN: "Mesaj teslimat göstergeleri okunamadı.",
  },
  scheduler: {
    HEALTHY: "Gecikme toleransını aşan zamanlanmış kampanya yok.",
    DEGRADED: "Zamanlanmış veya yinelenen kampanyalarda gecikme var.",
    UNKNOWN: "Zamanlayıcı göstergeleri okunamadı.",
  },
  sync: {
    HEALTHY: "Son kişi ve grup eşitlemeleri işletim eşiği içinde.",
    DEGRADED:
      "Takılı veya yinelenen başarısız eşitlemeler inceleme gerektiriyor.",
    UNKNOWN: "Eşitleme göstergeleri okunamadı.",
  },
  support: {
    HEALTHY: "Destek kayıtları ve bildirim kuyruğu işletim eşiği içinde.",
    DEGRADED: "Destek bildirim kuyruğu veya hataları inceleme gerektiriyor.",
    UNKNOWN: "Destek akışı göstergeleri okunamadı.",
  },
  email: {
    HEALTHY: "E-posta yapılandırması ve son teslimat göstergeleri sağlıklı.",
    DEGRADED:
      "E-posta hataları veya bekleyen teslimatlar inceleme gerektiriyor.",
    UNKNOWN: "E-posta teslimat göstergeleri doğrulanamadı.",
  },
  notifications: {
    HEALTHY:
      "Bildirim kuyruğu, teslimat ve başarısız iş göstergeleri sağlıklı.",
    DEGRADED: "Bildirim teslimat göstergeleri inceleme gerektiriyor.",
    UNKNOWN: "Bildirim platformu göstergeleri okunamadı.",
  },
  authentication: {
    HEALTHY: "Son toplu giriş göstergeleri işletim eşiği içinde.",
    DEGRADED: "Giriş başarısızlık oranı yükseldi.",
    UNKNOWN: "Kimlik doğrulama göstergeleri okunamadı.",
  },
  subscriptions: {
    HEALTHY: "Açık abonelik yetkisi uyarısı yok.",
    DEGRADED: "Abonelik yetkisi uyarıları inceleme gerektiriyor.",
    UNKNOWN: "Abonelik göstergeleri okunamadı.",
  },
  storage: {
    HEALTHY: "Şifreli oturum anlık görüntüleri kalıcı depolamada mevcut.",
    UNKNOWN: "Kalıcı depolama kanıtı doğrulanamadı.",
  },
  push: {
    HEALTHY:
      "Şifreli anlık bildirim belirteçleri mevcut ve teslimat makbuzları işleniyor.",
    UNKNOWN:
      "Sağlayıcı teslimatını doğrulayacak etkin anlık bildirim belirteci yok.",
  },
  backups: {
    HEALTHY:
      "Son zamanlanmış yedekleme güncellik süresi içinde başarıyla tamamlandı.",
    DEGRADED: "Son yedekleme eksik, eski, çalışıyor veya başarısız.",
    UNKNOWN: "Yedek güncelliği doğrulanamadı.",
  },
  deployments: {
    HEALTHY: "API ve işleyici etkin üretim sürümlerini bağımsız olarak bildiriyor.",
    DEGRADED: "Üretim bileşenlerinden biri sürüm doğrulaması gerektiriyor.",
    UNKNOWN: "Üretim bileşenlerinin sürüm kanıtı eksik.",
  },
};

const systemMetricLabels: Record<string, string> = {
  total: "Toplam bağlantı",
  active: "Etkin bağlantı",
  idle: "Boşta bağlantı",
  waiting: "Bekleyen",
  usedMemoryBytes: "Kullanılan bellek (bayt)",
  maxMemoryBytes: "Azami bellek (bayt)",
  connectedClients: "Bağlı istemci",
  evictedKeys: "Çıkarılan anahtar",
  queueCount: "Kuyruk sayısı",
  failedLast15m: "Son 15 dakikada başarısız",
  oldestWaitingAgeMs: "En eski bekleyen iş (ms)",
  heartbeatAgeMs: "Yaşam sinyali yaşı (ms)",
  currentJobs: "Çalışan iş",
  capacity: "Kapasite",
  connectedAccounts: "Bağlı hesap",
  connectingAccounts: "Bağlanan hesap",
  reconnectRequiredAccounts: "Yeniden bağlantı gereken hesap",
  failedAccounts: "Başarısız hesap",
  campaignsLast24h: "Son 24 saatte kampanya",
  failedCampaignsLast24h: "Son 24 saatte başarısız kampanya",
  sentTargetsLast24h: "Son 24 saatte teslim edilen hedef",
  failedTargetsLast24h: "Son 24 saatte başarısız hedef",
  failureRate: "Başarısızlık oranı",
  overdueScheduled: "Geciken zamanlanmış iş",
  overdueRecurring: "Geciken yinelenen iş",
  completedLast24h: "Son 24 saatte tamamlanan",
  failedLast24h: "Son 24 saatte başarısız",
  staleActiveRuns: "Güncelliğini yitiren etkin çalışma",
  discoveredLast24h: "Son 24 saatte keşfedilen",
  persistedLast24h: "Son 24 saatte kaydedilen",
  namedLast24h: "Son 24 saatte adlandırılan",
  fallbackLast24h: "Son 24 saatte yedek işleme düşen",
  ticketsLast24h: "Son 24 saatte destek talebi",
  waitingForAdmin: "Yönetici bekleyen",
  staleOutboxItems: "Güncelliğini yitiren giden kutusu kaydı",
  failedOutboxLast24h: "Son 24 saatte başarısız giden kutusu kaydı",
  provider: "Sağlayıcı",
  configured: "Yapılandırıldı",
  sentLast24h: "Son 24 saatte gönderilen",
  queued: "Sırada",
  staleQueued: "Güncelliğini yitiren sıradaki kayıt",
  staleProcessing: "Güncelliğini yitiren işlenen kayıt",
  unresolvedDeadLetters: "Çözümlenmemiş başarısız iş",
  loginAttemptsLastHour: "Son saatte giriş denemesi",
  loginFailuresLastHour: "Son saatte başarısız giriş",
  activeSubscriptions: "Etkin abonelik",
  expiredSubscriptions: "Süresi dolan abonelik",
  openEntitlementAlerts: "Açık yetki uyarısı",
  encryptedSessionSnapshots: "Şifreli oturum anlık görüntüsü",
  objectStorageConfigured: "Nesne depolama yapılandırıldı",
  activePushTokens: "Etkin anlık bildirim belirteci",
  notificationsLast24h: "Son 24 saatte bildirim",
  receiptProcessing: "Teslimat makbuzu işleme",
  workflowStatus: "İş akışı durumu",
  conclusion: "Sonuç",
  ageMs: "Yaş (ms)",
  apiRelease: "API sürümü",
  workerRelease: "İşleyici sürümü",
};

const systemOperationalValues: Record<string, string> = {
  NOTIFICATION_WORKER: "Bildirim işleyicisi",
  completed: "Tamamlandı",
  success: "Başarılı",
  failure: "Başarısız",
};

const systemAlertLabels: Record<string, string> = {
  SYNC_FAILURE_RATE_OR_STALE_RUN_HIGH:
    "Eşitleme başarısızlık oranı veya takılı çalışma uyarısı",
  DEPLOYMENT_RELEASE_MISMATCH: "API ve işleyici sürüm uyuşmazlığı",
  WORKER_UNHANDLED_REJECTION_ISOLATED: "İşleyici hatası yalıtıldı",
  WORKER_JOB_FINAL_FAILURE: "İşleyici görevi kalıcı olarak başarısız",
  WORKER_UNHANDLED_REJECTION: "İşleyicide yakalanmamış hata",
};

function systemServiceName(id: string, fallback: string, locale: string) {
  const label = systemServiceLabels[id];
  return label ? label[locale === "tr" ? 0 : 1] : fallback;
}

function systemServiceSummary(
  id: string,
  state: string,
  fallback: string,
  locale: string,
) {
  if (locale !== "tr") return fallback;
  return systemSummaryLabels[id]?.[state] ?? fallback;
}

function systemMetricLabel(key: string, locale: string) {
  return locale === "tr" ? (systemMetricLabels[key] ?? key) : key;
}

function systemMetricValue(
  value: unknown,
  locale: string,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (typeof value === "boolean") {
    return locale === "tr" ? (value ? "Evet" : "Hayır") : value ? "Yes" : "No";
  }
  if (typeof value === "string") {
    if (locale === "tr" && systemOperationalValues[value]) {
      return systemOperationalValues[value];
    }
    return localizedStatus(value, t, locale);
  }
  return value == null ? "-" : String(value);
}

function systemQueueName(name: string, locale: string) {
  if (locale !== "tr") return name;
  return (
    {
      "logivya-sync": "Logivya eşitleme",
      "logivya-message": "Logivya mesaj",
      "logivya-campaign": "Logivya kampanya",
    }[name] ?? name
  );
}

function systemAlertLabel(value: string, locale: string) {
  if (locale !== "tr") return value.replaceAll("_", " ");
  const normalized = value.replaceAll(" ", "_").toUpperCase();
  return systemAlertLabels[normalized] ?? value.replaceAll("_", " ");
}

export function SupportPage() {
  const { locale, t } = useI18n();
  const [tickets, setTickets] = useState<any[] | null>(null);
  const [status, setStatus] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/support/tickets");
    setTickets((await response.json()).tickets || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const ticketTypes = [
    "whatsappConnection",
    "qrCode",
    "messageDelivery",
    "subscriptionPayment",
    "invoice",
    "technical",
    "other",
  ];
  const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];

  return (
    <>
      <Header
        title={t("support.centerTitle")}
        description={t("support.centerDescription")}
      />
      <form
        onSubmit={submit}
        className={`${panel} mb-6 grid gap-3 md:grid-cols-2`}
      >
        <input
          required
          name="subject"
          placeholder={t("support.subject")}
          className={field}
        />
        <select name="type" className={field}>
          {ticketTypes.map((type) => (
            <option key={type} value={type}>
              {t(`support.type.${type}`)}
            </option>
          ))}
        </select>
        <select name="priority" className={field}>
          {priorities.map((priority) => (
            <option key={priority} value={priority}>
              {t(`priority.${priority.toLowerCase()}`)}
            </option>
          ))}
        </select>
        <textarea
          required
          name="message"
          placeholder={t("support.describeIssue")}
          className={`${field} min-h-28 md:col-span-2`}
        />
        <button className={button}>
          <Plus className="me-2 inline size-4" />
          {t("support.create")}
        </button>
        {status ? (
          <p className="self-center text-sm text-muted">{status}</p>
        ) : null}
      </form>
      {!tickets ? (
        <Loading />
      ) : (
        <div className="grid gap-4">
          {tickets.map((ticket) => (
            <article key={ticket.id} className={panel}>
              <div className="flex justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{ticket.subject}</h3>
                  <p className="mt-1 text-xs text-muted">
                    {t(`support.type.${ticket.type}`)} · {ticket.createdBy.name}{" "}
                    · {formatDateTime(ticket.createdAt, locale)}
                  </p>
                </div>
                <span className="h-fit rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                  {localizedStatus(ticket.status, t)}
                </span>
              </div>
              <p className="mt-4 text-sm text-muted">
                {ticket.messages[0]?.message}
              </p>
            </article>
          ))}
          {!tickets.length ? (
            <p className="py-12 text-center text-sm text-muted">
              {t("support.empty")}
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}

export function ActivityPage() {
  const { locale, t } = useI18n();
  const [logs, setLogs] = useState<any[] | null>(null);
  useEffect(() => {
    void fetch("/api/activity")
      .then((response) => response.json())
      .then((value) => setLogs(value.logs || []));
  }, []);
  return (
    <>
      <Header
        title={t("activity.title")}
        description={t("activity.description")}
      />
      {!logs ? (
        <Loading />
      ) : (
        <div className={panel}>
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex gap-4 border-b py-4 last:border-0"
            >
              <Activity className="mt-1 size-4 text-primary" />
              <div>
                <b className="text-sm">{t(`activity.action.${log.action}`)}</b>
                <p className="text-xs text-muted">
                  {t(`entity.${String(log.entityType).toLowerCase()}`)} ·{" "}
                  {log.user?.name || t("common.system")} ·{" "}
                  {formatDateTime(log.createdAt, locale)}
                </p>
              </div>
            </div>
          ))}
          {!logs.length ? (
            <p className="py-12 text-center text-sm text-muted">
              {t("activity.empty")}
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}

export function OnboardingPage() {
  const { t } = useI18n();
  const [data, setData] = useState<any>();
  useEffect(() => {
    void fetch("/api/onboarding")
      .then((response) => response.json())
      .then((value) => setData(value.onboarding));
  }, []);
  if (!data) return <Loading />;
  const items = [
    ["onboarding.company", data.companyProfileCompleted, "/settings/company"],
    ["onboarding.whatsapp", data.whatsappConnected, "/accounts"],
    ["onboarding.groups", data.groupsSynced, "/groups"],
    ["onboarding.category", data.categoryCreated, "/categories"],
    ["onboarding.message", data.firstMessageSent, "/send-message"],
  ] as const;
  const progress = Math.round(
    (items.filter((item) => item[1]).length / items.length) * 100,
  );
  return (
    <>
      <Header
        title={t("onboarding.title")}
        description={t("onboarding.description")}
      />
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <Link
          href="/accounts"
          className={`${panel} group transition hover:border-primary`}
        >
          <MessageSquare className="size-6 text-primary" />
          <h2 className="mt-4 font-semibold">
            {t("onboarding.guideConnectTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {t("onboarding.guideConnectDescription")}
          </p>
        </Link>
        <Link
          href="/categories"
          className={`${panel} group transition hover:border-primary`}
        >
          <Users className="size-6 text-primary" />
          <h2 className="mt-4 font-semibold">
            {t("onboarding.guideOrganizeTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {t("onboarding.guideOrganizeDescription")}
          </p>
        </Link>
        <Link
          href="/settings/security"
          className={`${panel} group transition hover:border-primary`}
        >
          <ShieldAlert className="size-6 text-primary" />
          <h2 className="mt-4 font-semibold">
            {t("onboarding.guideControlTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {t("onboarding.guideControlDescription")}
          </p>
        </Link>
      </div>
      <div className={`${panel} mb-5`}>
        <div className="flex justify-between text-sm">
          <b>{t("onboarding.progress")}</b>
          <span>{progress}%</span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-primary-soft">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="grid gap-3">
        {items.map(([labelKey, done, href]) => (
          <a
            key={labelKey}
            href={href}
            className={`${panel} flex items-center gap-4 hover:border-primary`}
          >
            <CheckCircle2 className={done ? "text-green-600" : "text-muted"} />
            <span className="font-medium">{t(labelKey)}</span>
            <span className="ms-auto text-xs text-muted">
              {done ? t("common.completed") : t("common.continue")}
            </span>
          </a>
        ))}
      </div>
    </>
  );
}

export function AdminDashboardPage() {
  const { locale, t } = useI18n();
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/dashboard", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(t, body));
      setData(body);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "ADMIN_DASHBOARD_LOAD_FAILED",
      );
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);
  if (loading && !data) return <Loading />;
  const metrics = data?.metrics || {};
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <Header
          eyebrow={t("operations.eyebrow")}
          title={t("admin.dashboard.title")}
          description={t("admin.dashboard.description")}
        />
        <button
          type="button"
          className={button}
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw
            className={`me-2 inline size-4 ${loading ? "animate-spin" : ""}`}
          />
          {locale === "tr" ? "Yenile" : "Refresh"}
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          href="/admin/companies"
          label={t("admin.metrics.totalCompanies")}
          value={formatNumber(metrics.companies || 0, locale)}
          Icon={Building2}
        />
        <Metric
          href="/admin/users"
          label={t("admin.metrics.totalUsers")}
          value={formatNumber(metrics.users || 0, locale)}
          Icon={Users}
        />
        <Metric
          href="/admin/subscriptions#subscription-requests"
          label={t("admin.metrics.pendingSubscriptions")}
          value={formatNumber(metrics.pendingSubscriptionRequests || 0, locale)}
          Icon={Activity}
        />
        <Metric
          href="/admin/subscriptions?status=ACTIVE"
          label={t("admin.metrics.activeSubscriptions")}
          value={formatNumber(metrics.activeSubscriptions || 0, locale)}
          Icon={CheckCircle2}
        />
        <Metric
          href="/admin/subscriptions?status=TRIALING"
          label={t("admin.metrics.trials")}
          value={formatNumber(metrics.trials || 0, locale)}
          Icon={Activity}
        />
        <Metric
          href="/admin/subscriptions?expiring=1"
          label={t("admin.metrics.expiringSoon")}
          value={formatNumber(metrics.expiringInSevenDays || 0, locale)}
          Icon={Activity}
        />
        <Metric
          href="/admin/billing"
          label={t("admin.metrics.approvedPayments")}
          value={formatCurrency(
            metrics.monthlyConfirmedPaymentTotal || 0,
            "TRY",
            locale,
          )}
          Icon={Activity}
        />
        <Metric
          href="/admin/whatsapp-accounts?status=CONNECTED"
          label={t("admin.metrics.connectedWhatsApp")}
          value={`${formatNumber(metrics.connected || 0, locale)} / ${formatNumber(metrics.accounts || 0, locale)}`}
          Icon={MessageSquare}
        />
        <Metric
          href="/admin/campaigns"
          label={t("admin.metrics.totalCampaigns")}
          value={formatNumber(metrics.campaigns || 0, locale)}
          Icon={Send}
        />
        <Metric
          href="/admin/campaigns"
          label={t("admin.metrics.totalMessages")}
          value={formatNumber(metrics.messages || 0, locale)}
          Icon={MessageSquare}
        />
      </div>
      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              {locale === "tr" ? "Müdahale kuyruğu" : "Action queue"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {locale === "tr"
                ? "Önce incelenmesi gereken operasyonel durumlar."
                : "Operational conditions that should be reviewed first."}
            </p>
          </div>
          <p className="text-xs text-muted">
            {locale === "tr" ? "Son güncelleme" : "Last updated"}:{" "}
            {data?.generatedAt ? formatDateTime(data.generatedAt, locale) : "-"}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label:
                locale === "tr"
                  ? "Kritik güvenlik olayı"
                  : "Critical security events",
              value: metrics.criticalSecurityAlerts || 0,
              href: "/admin/security/events",
              tone: "border-red-300 bg-red-50 text-red-950",
            },
            {
              label:
                locale === "tr"
                  ? "Acil destek kaydı"
                  : "Urgent support tickets",
              value: metrics.urgentTickets || 0,
              href: "/admin/support",
              tone: "border-amber-300 bg-amber-50 text-amber-950",
            },
            {
              label:
                locale === "tr"
                  ? "Bekleyen abonelik talebi"
                  : "Pending subscription requests",
              value: metrics.pendingSubscriptionRequests || 0,
              href: "/admin/subscriptions",
              tone: "border-blue-300 bg-blue-50 text-blue-950",
            },
            {
              label:
                locale === "tr"
                  ? "Sorunlu WhatsApp hesabı"
                  : "Failed WhatsApp accounts",
              value: metrics.failedAccounts || 0,
              href: "/admin/whatsapp-accounts",
              tone: "border-violet-300 bg-violet-50 text-violet-950",
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200 ${item.tone}`}
            >
              <p className="text-xs font-semibold">{item.label}</p>
              <p className="mt-3 text-3xl font-semibold">
                {formatNumber(Number(item.value), locale)}
              </p>
              <span className="mt-3 inline-block text-xs font-semibold underline underline-offset-4">
                {locale === "tr" ? "İncele" : "Review"}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="mt-8 grid gap-5 xl:grid-cols-2">
        <DashboardFeed
          title={
            locale === "tr" ? "Son güvenlik olayları" : "Recent security events"
          }
          href="/admin/security/events"
          empty={
            locale === "tr" ? "Güvenlik olayı yok." : "No security events."
          }
          items={(data?.securityEvents || []).map((item: any) => ({
            id: item.id,
            title: localizedStatus(item.type, t, locale),
            detail: `${localizedStatus(item.severity, t, locale)} · ${localizedStatus(item.status || item.result, t, locale)}`,
            date: item.createdAt,
          }))}
        />
        <DashboardFeed
          title={
            locale === "tr" ? "Son destek kayıtları" : "Recent support tickets"
          }
          href="/admin/support"
          empty={locale === "tr" ? "Destek kaydı yok." : "No support tickets."}
          items={(data?.tickets || []).map((item: any) => ({
            id: item.id,
            href: `/admin/support/${encodeURIComponent(item.publicId || item.id)}`,
            title: `${item.publicId} · ${item.title}`,
            detail: `${localizedStatus(item.priority, t)} · ${localizedStatus(item.status, t)}`,
            date: item.lastMessageAt,
          }))}
        />
        <DashboardFeed
          title={
            locale === "tr"
              ? "Son abonelik olayları"
              : "Recent subscription events"
          }
          href="/admin/subscriptions"
          empty={
            locale === "tr" ? "Abonelik olayı yok." : "No subscription events."
          }
          items={(data?.billingEvents || []).map((item: any) => ({
            id: item.id,
            title: item.message || localizedStatus(item.type, t),
            detail: item.company?.name || localizedStatus(item.type, t),
            date: item.createdAt,
          }))}
        />
        <DashboardFeed
          title={
            locale === "tr"
              ? "Son yönetici erişimleri"
              : "Recent administrator access"
          }
          href="/admin/audit"
          empty={
            locale === "tr"
              ? "Yönetici erişim kaydı yok."
              : "No administrator access records."
          }
          items={(data?.recentAdminActions || []).map((item: any) => ({
            id: item.id,
            title: `${item.method} ${item.path}`,
            detail: item.permission || "-",
            date: item.createdAt,
          }))}
        />
      </section>
    </>
  );
}

function DashboardFeed({
  title,
  href,
  items,
  empty,
}: {
  title: string;
  href: string;
  items: Array<{ id: string; title: string; detail: string; date: string; href?: string }>;
  empty: string;
}) {
  const { locale } = useI18n();
  const [selected, setSelected] = useState<(typeof items)[number] | null>(null);
  return (
    <section className={`${panel} min-w-0`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <Link
          href={href}
          className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
        >
          {locale === "tr" ? "Tümünü gör" : "View all"}
        </Link>
      </div>
      <div className="divide-y">
        {items.map((item) => (
          <article key={item.id} className="py-3 first:pt-0 last:pb-0">
            <button type="button" onClick={() => setSelected(item)} className="w-full rounded-lg p-2 text-left transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
            <p className="break-words text-sm font-semibold">{item.title}<span aria-hidden="true" className="ml-2 text-primary">→</span></p>
            <div className="mt-1 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted">
              <span className="break-all">{item.detail}</span>
              <time dateTime={item.date}>
                {formatDateTime(item.date, locale)}
              </time>
            </div>
            </button>
          </article>
        ))}
        {!items.length ? (
          <p className="py-8 text-center text-sm text-muted">{empty}</p>
        ) : null}
      </div>
      <AdminRecordDialog open={Boolean(selected)} title={selected?.title || title} onClose={() => setSelected(null)}>
        {selected ? <div className="space-y-5">
          <p className="break-words text-sm text-muted">{selected.detail}</p>
          <time className="block text-sm" dateTime={selected.date}>{formatDateTime(selected.date, locale)}</time>
          <Link href={selected.href || href} className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white">{locale === "tr" ? "İlgili bölümü aç" : "Open related section"}</Link>
        </div> : null}
      </AdminRecordDialog>
    </section>
  );
}

export function AdminListPage({
  titleKey,
  endpoint,
  kind,
}: {
  titleKey: string;
  endpoint: string;
  kind: string;
}) {
  const { locale, t } = useI18n();
  const [data, setData] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const separator = endpoint.includes("?") ? "&" : "?";
      const response = await fetch(`${endpoint}${separator}page=${page}`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(t, body));
      setData(body);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "ADMIN_LIST_LOAD_FAILED",
      );
    } finally {
      setLoading(false);
    }
  }, [endpoint, page, t]);
  useEffect(() => {
    void load();
  }, [load]);
  const rows = data?.[kind] || [];
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <Header title={t(titleKey)} description={t("admin.list.description")} />
        <button
          type="button"
          className={button}
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw
            className={`me-2 inline size-4 ${loading ? "animate-spin" : ""}`}
          />
          {locale === "tr" ? "Yenile" : "Refresh"}
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}
      {loading && !data ? (
        <Loading />
      ) : (
        <AdminInteractiveTable emptyLabel={t("admin.list.empty")} headers={[t("admin.list.record"), t("common.status"), t("admin.list.companyUser"), t("admin.list.date"), ...(kind === "invoices" ? [t("adminPayments.amount"), (locale === "tr" ? "Para birimi" : "Currency")] : [])]} rows={rows.map((row: any) => [row.subject || (row.action ? localizedStatus(row.action, t, locale) : row.type ? localizedStatus(row.type, t, locale) : row.invoiceNumber || row.id), localizedStatus(row.status || row.severity, t, locale), row.company?.name || row.createdBy?.email || row.user?.email || "-", formatDateTime(row.createdAt || row.lastMessageAt, locale), ...(kind === "invoices" ? [String(row.totalAmount ?? "-"), row.currency ?? "-"] : [])])} />
      )}
      {data?.pagination?.pages > 1 ? (
        <nav
          aria-label={locale === "tr" ? "Sayfalama" : "Pagination"}
          className="mt-4 flex items-center justify-center gap-3"
        >
          <button
            type="button"
            className="min-h-10 rounded-xl border px-4 text-xs font-semibold disabled:opacity-40"
            disabled={loading || page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            {locale === "tr" ? "Önceki" : "Previous"}
          </button>
          <span className="text-xs text-muted">
            {locale === "tr" ? "Sayfa" : "Page"} {page} /{" "}
            {data.pagination.pages}
          </span>
          <button
            type="button"
            className="min-h-10 rounded-xl border px-4 text-xs font-semibold disabled:opacity-40"
            disabled={loading || page >= data.pagination.pages}
            onClick={() => setPage((value) => value + 1)}
          >
            {locale === "tr" ? "Sonraki" : "Next"}
          </button>
        </nav>
      ) : null}
    </>
  );
}

export function SystemHealthPage({ canManage }: { canManage: boolean }) {
  const { locale, t } = useI18n();
  const [data, setData] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/system/health", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(t, body));
      setData(body);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : t("errors.generic"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateIncidentStatus(id: string, status: string) {
    if (!canManage) {
      setError(
        locale === "tr"
          ? "Bu rol olay kayıtlarını yalnızca görüntüleyebilir."
          : "This role can only view incidents.",
      );
      return;
    }
    if (note.trim().length < 5 || !adminPassword) {
      setError(
        locale === "tr"
          ? "En az 5 karakterlik işlem notu ve yönetici parolası gereklidir."
          : "An operation note of at least 5 characters and the administrator password are required.",
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const reauthResponse = await fetch("/api/admin/security/re-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      if (!reauthResponse.ok)
        throw new Error(
          locale === "tr"
            ? "Yönetici parolası doğrulanamadı."
            : "Administrator password could not be verified.",
        );
      const response = await fetch(
        `/api/admin/incidents/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status, note: note.trim() }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(t, body));
      setNote("");
      setAdminPassword("");
      setSelectedIncident(null);
      await load();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : t("errors.generic"),
      );
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
    HEALTHY:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    DEGRADED:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    UNAVAILABLE:
      "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
    UNKNOWN:
      "border-zinc-500/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
    MAINTENANCE:
      "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  };
  const serviceIcons: Record<string, typeof Activity> = {
    api: Server,
    database: Database,
    redis: Wifi,
    queues: Activity,
    worker: Server,
    whatsapp: MessageSquare,
    messaging: Send,
    scheduler: Clock3,
    support: CircleHelp,
    email: Send,
    backups: Database,
    deployments: Activity,
  };
  return (
    <>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <Header
          title={t("systemHealth.title")}
          description={t("systemHealth.description")}
        />
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          {locale === "tr" ? "Yenile" : "Refresh"}
        </button>
      </div>
      {error ? (
        <div className="mb-5 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}
      <section className="mb-6 flex flex-wrap items-center justify-between gap-4 border-y py-5">
        <div className="flex items-center gap-3">
          <HeartPulse className="size-7 text-primary" />
          <div>
            <p className="text-xs font-semibold uppercase text-muted">
              {locale === "tr"
                ? "Genel platform durumu"
                : "Overall platform status"}
            </p>
            <p className="mt-1 text-2xl font-semibold">
              {localizedStatus(data?.status || "UNKNOWN", t, locale)}
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-muted">
          <p>{data?.release ? String(data.release).slice(0, 12) : "-"}</p>
          <p>
            {data?.generatedAt ? formatDateTime(data.generatedAt, locale) : "-"}
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">
          {locale === "tr" ? "Servisler" : "Services"}
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {services.map((item: any) => {
            const Icon = serviceIcons[item.id] || Activity;
            const metricEntries = Object.entries(item.metrics || {}).slice(
              0,
              4,
            );
            return (
              <article key={item.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <Icon className="size-5 text-primary" />
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${stateTone[item.state] || stateTone.UNKNOWN}`}
                  >
                    {localizedStatus(item.state, t, locale)}
                  </span>
                </div>
                <h3 className="mt-4 font-semibold">
                  {systemServiceName(item.id, item.name, locale)}
                </h3>
                <p className="mt-1 min-h-10 text-xs leading-5 text-muted">
                  {systemServiceSummary(
                    item.id,
                    item.state,
                    item.summary,
                    locale,
                  )}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3 text-xs">
                  <span className="text-muted">
                    {locale === "tr" ? "Gecikme" : "Latency"}
                  </span>
                  <span className="text-right font-medium">
                    {item.latencyMs == null ? "-" : `${item.latencyMs} ms`}
                  </span>
                  <span className="text-muted">
                    {locale === "tr" ? "Eğilim" : "Trend"}
                  </span>
                  <span className="text-right font-medium">
                    {localizedStatus(item.trend || "UNKNOWN", t, locale)}
                  </span>
                  <span className="text-muted">
                    {locale === "tr"
                      ? "Son başarılı kontrol"
                      : "Last successful check"}
                  </span>
                  <span className="text-right font-medium">
                    {item.lastSuccessfulCheckAt
                      ? formatDateTime(item.lastSuccessfulCheckAt, locale)
                      : "-"}
                  </span>
                  <span className="text-muted">
                    {locale === "tr" ? "Son hata" : "Last failure"}
                  </span>
                  <span className="text-right font-medium">
                    {item.lastFailureAt
                      ? formatDateTime(item.lastFailureAt, locale)
                      : "-"}
                  </span>
                  <span className="text-muted">
                    {locale === "tr" ? "Sürüm" : "Release"}
                  </span>
                  <span className="break-all text-right font-medium">
                    {item.release ? String(item.release).slice(0, 16) : "-"}
                  </span>
                  <span className="text-muted">
                    {locale === "tr" ? "Hata kodu" : "Error code"}
                  </span>
                  <span className="break-all text-right font-medium">
                    {item.safeErrorCode || "-"}
                  </span>
                </div>
                {metricEntries.length ? (
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3 text-xs">
                    {metricEntries.map(([key, value]) => (
                      <Fragment key={key}>
                        <dt className="break-words text-muted">
                          {systemMetricLabel(key, locale)}
                        </dt>
                        <dd className="break-all text-right font-medium">
                          {systemMetricValue(value, locale, t)}
                        </dd>
                      </Fragment>
                    ))}
                  </dl>
                ) : null}
                {item.incidentId ? (
                  <a
                    href="#active-incidents"
                    onClick={() => setSelectedIncident(item.incidentId)}
                    className="mt-4 inline-flex min-h-10 items-center text-xs font-semibold text-primary"
                  >
                    {locale === "tr"
                      ? "Açık olayı görüntüle"
                      : "View open incident"}
                  </a>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">
          {locale === "tr" ? "Kuyruk özeti" : "Queue summary"}
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b bg-black/[.03]">
              <tr>
                <th scope="col" className="p-3">
                  {locale === "tr" ? "Kuyruk" : "Queue"}
                </th>
                <th scope="col">{locale === "tr" ? "Durum" : "State"}</th>
                <th scope="col">{locale === "tr" ? "Bekleyen" : "Waiting"}</th>
                <th scope="col">{locale === "tr" ? "Aktif" : "Active"}</th>
                <th scope="col">
                  {locale === "tr" ? "En eski iş" : "Oldest job"}
                </th>
                <th scope="col">
                  {locale === "tr" ? "Dakika hızı" : "Per minute"}
                </th>
                <th scope="col">
                  {locale === "tr" ? "95. yüzdelik" : "95th percentile"}
                </th>
              </tr>
            </thead>
            <tbody>
              {queues.map((queue: any) => (
                <tr key={queue.name} className="border-b last:border-0">
                  <td className="p-3 font-medium">
                    {systemQueueName(queue.name, locale)}
                  </td>
                  <td>{localizedStatus(queue.state, t, locale)}</td>
                  <td>{queue.counts?.waiting || 0}</td>
                  <td>{queue.counts?.active || 0}</td>
                  <td>
                    {queue.oldestWaitingAgeMs == null
                      ? "-"
                      : `${Math.round(queue.oldestWaitingAgeMs / 1000)} sn`}
                  </td>
                  <td>{queue.throughputPerMinute}</td>
                  <td>
                    {queue.p95ProcessingMs == null
                      ? "-"
                      : `${queue.p95ProcessingMs} ms`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8 grid gap-6 xl:grid-cols-2">
        <div id="active-incidents">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle className="size-5 text-amber-500" />
            {locale === "tr" ? "Aktif olaylar" : "Active incidents"}
          </h2>
          <div className="grid gap-3">
            {incidents.map((incident: any) => (
              <article key={incident.id} className="rounded-lg border p-4">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedIncident(
                      selectedIncident === incident.id ? null : incident.id,
                    )
                  }
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">
                        {systemAlertLabel(incident.title, locale)}
                      </h3>
                      <p className="mt-1 text-xs text-muted">
                        {localizedStatus(incident.severity, t, locale)} ·{" "}
                        {formatDateTime(incident.startedAt, locale)}
                      </p>
                    </div>
                    <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold">
                      {localizedStatus(incident.status, t, locale)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    {incident.description}
                  </p>
                </button>
                {selectedIncident === incident.id ? (
                  canManage ? (
                    <div className="mt-4 grid gap-3 border-t pt-4">
                      <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder={
                          locale === "tr"
                            ? "İnceleme veya çözüm notu"
                            : "Investigation or resolution note"
                        }
                        className={`${field} min-h-24`}
                      />
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={adminPassword}
                        onChange={(event) =>
                          setAdminPassword(event.target.value)
                        }
                        placeholder={
                          locale === "tr"
                            ? "Yönetici parolası"
                            : "Administrator password"
                        }
                        className={field}
                      />
                      <div className="flex flex-wrap gap-2">
                        {[
                          [
                            "ACKNOWLEDGED",
                            locale === "tr" ? "Kabul et" : "Acknowledge",
                          ],
                          [
                            "INVESTIGATING",
                            locale === "tr" ? "İncele" : "Investigate",
                          ],
                          [
                            "MITIGATED",
                            locale === "tr" ? "Azaltıldı" : "Mitigated",
                          ],
                          ["RESOLVED", locale === "tr" ? "Çözüldü" : "Resolve"],
                        ].map(([status, label]) => (
                          <button
                            key={status}
                            type="button"
                            disabled={
                              saving || note.trim().length < 5 || !adminPassword
                            }
                            onClick={() =>
                              void updateIncidentStatus(incident.id, status)
                            }
                            className="min-h-10 rounded-lg border px-3 text-xs font-semibold disabled:opacity-50"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 border-t pt-4 text-xs text-muted">
                      {locale === "tr"
                        ? "Bu rol olay kayıtlarını yalnızca görüntüleyebilir."
                        : "This role can only view incidents."}
                    </p>
                  )
                ) : null}
              </article>
            ))}
            {!incidents.length ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted">
                {locale === "tr" ? "Aktif olay yok." : "No active incidents."}
              </p>
            ) : null}
          </div>
        </div>
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <ShieldAlert className="size-5 text-primary" />
            {locale === "tr" ? "Son uyarılar" : "Recent alerts"}
          </h2>
          <div className="grid gap-3">
            {alerts.slice(0, 12).map((alert: any) => (
              <article key={alert.id} className="rounded-lg border p-4">
                <div className="flex justify-between gap-3">
                  <h3 className="text-sm font-semibold">
                    {systemAlertLabel(alert.type, locale)}
                  </h3>
                  <span className="text-xs font-semibold">
                    {localizedStatus(alert.severity, t, locale)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted">{alert.message}</p>
                <p className="mt-3 text-[11px] text-muted">
                  {systemServiceName(alert.service, alert.service, locale)} ·{" "}
                  {formatDateTime(alert.lastSeenAt, locale)}
                </p>
              </article>
            ))}
            {!alerts.length ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted">
                {locale === "tr" ? "Açık uyarı yok." : "No open alerts."}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}

export function AdminMetricsPage() {
  const { locale, t } = useI18n();
  const [data, setData] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/metrics", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(t, body));
      setData(body.metrics);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : t("errors.generic"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);
  if (loading && !data) return <Loading />;
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <Header
          title={t("admin.saasMetrics.title")}
          description={t("admin.saasMetrics.description")}
        />
        <button
          type="button"
          className={button}
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw
            className={`me-2 inline size-4 ${loading ? "animate-spin" : ""}`}
          />
          {locale === "tr" ? "Yenile" : "Refresh"}
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(data).map(([key, value]) => (
          <Metric
            key={key}
            label={t(`admin.metric.${key}`)}
            value={
              value === null
                ? t("common.preparing")
                : formatNumber(Number(value), locale)
            }
            Icon={Activity}
          />
        ))}
      </div>
    </>
  );
}
