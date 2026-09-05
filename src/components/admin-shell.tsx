"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import styles from "./admin-shell.module.css";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Building2,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  Database,
  FileClock,
  FileLock2,
  FileText,
  Flag,
  Gauge,
  HeartPulse,
  Megaphone,
  Menu,
  PackageCheck,
  Search,
  Settings,
  ShieldAlert,
  Ticket,
  Users,
  Webhook,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";
import { useI18n } from "@/i18n/provider";
import { adminMenuLabel } from "@/i18n/status";

const nav = [
  ["/admin", "dashboard", Gauge, "admin.dashboard.read"],
  ["/admin/companies", "companies", Building2, "admin.companies.read"],
  ["/admin/users", "users", Users, "admin.users.read"],
  ["/admin/billing", "billing", CircleDollarSign, "admin.billing.read"],
  ["/admin/subscriptions", "subscriptions", FileClock, "admin.billing.read"],
  ["/admin/invoices", "invoices", FileText, "admin.billing.read"],
  ["/admin/payments", "payments", CircleDollarSign, "admin.payments.read"],
  ["/admin/whatsapp-accounts", "whatsappAccounts", Zap, "admin.whatsapp.read"],
  [
    "/admin/whatsapp-live-listing-sources",
    "whatsappLiveSources",
    Zap,
    "admin.whatsappIngestion.read",
  ],
  ["/admin/campaigns", "campaigns", Activity, "admin.campaignMetrics.read"],
  ["/admin/support", "support", Ticket, "admin.support.read"],
  ["/admin/security", "security", ShieldAlert, "admin.security.read"],
  ["/admin/trial-risk", "trialRisk", ShieldAlert, "admin.security.read"],
  ["/admin/compliance", "compliance", ClipboardCheck, "admin.audit.read"],
  ["/admin/privacy", "privacy", FileLock2, "admin.privacy.read"],
  ["/admin/audit", "audit", FileClock, "admin.audit.read"],
  ["/admin/activity", "activity", Activity, "admin.audit.read"],
  [
    "/admin/notifications",
    "notifications",
    Megaphone,
    "admin.notifications.read",
  ],
  ["/admin/data-requests", "dataRequests", FileText, "admin.privacy.read"],
  ["/admin/metrics", "metrics", Gauge, "admin.metrics.read"],
  [
    "/admin/system/health",
    "systemHealth",
    HeartPulse,
    "admin.systemHealth.read",
  ],
  ["/admin/system/backups", "backups", Database, "admin.backups.read"],
  [
    "/admin/disaster-recovery",
    "disasterRecovery",
    Database,
    "admin.backups.read",
  ],
  ["/admin/releases", "releases", PackageCheck, "admin.releases.read"],
] as const;
const settings = [
  [
    "/admin/settings/feature-flags",
    "featureFlags",
    Flag,
    "admin.settings.read",
  ],
  [
    "/admin/announcements",
    "announcements",
    Megaphone,
    "admin.notifications.read",
  ],
  ["/admin/api-usage", "apiUsage", Zap, "admin.apiUsage.read"],
  ["/admin/webhooks", "webhooks", Webhook, "admin.settings.read"],
  [
    "/admin/settings/platform",
    "platformSettings",
    Settings,
    "admin.settings.read",
  ],
] as const;

export function AdminShell({
  children,
  role,
  permissions,
}: {
  children: React.ReactNode;
  role: string;
  permissions: string[];
}) {
  const router = useRouter();
  const path = usePathname();
  const { t, locale } = useI18n();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any>();
  const [open, setOpen] = useState(true);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const canAccess = (permission: string) =>
    role === "SUPER_ADMIN" || permissions.includes(permission);
  const visibleNavigation = nav.filter((item) => canAccess(item[3]));
  const visibleSettings = settings.filter((item) => canAccess(item[3]));

  useEffect(() => {
    const root = document.documentElement;
    const alreadyContained = root.classList.contains("overflow-x-clip");
    root.classList.add("overflow-x-clip");

    return () => {
      if (!alreadyContained) root.classList.remove("overflow-x-clip");
    };
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/admin/search?q=${encodeURIComponent(q.trim())}`, {
        signal: controller.signal,
      })
        .then(async (response) =>
          response.ok
            ? response.json()
            : Promise.reject(new Error("ADMIN_SEARCH_FAILED")),
        )
        .then(setResults)
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setResults(undefined);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  useEffect(() => {
    if (!mobileNavigationOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const nav = document.getElementById("admin-navigation");
    const first = nav?.querySelector<HTMLElement>("button, a[href]");
    first?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileNavigationOpen(false);
      if (event.key !== "Tab" || !nav) return;
      const items = Array.from(nav.querySelectorAll<HTMLElement>("button, a[href]")).filter(item => item.offsetParent !== null);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [mobileNavigationOpen]);

  function goToUserDashboardFromAdmin() {
    setResults(undefined);
    setQ("");
    setMobileNavigationOpen(false);
    router.replace("/dashboard");
  }

  function replaceAdminRoute(href: string) {
    setResults(undefined);
    setMobileNavigationOpen(false);
    router.push(href);
  }

  function isActiveAdminRoute(href: string) {
    if (href === "/admin") return path === href;
    return path === href || path.startsWith(`${href}/`);
  }

  return (
    <div className={cn(styles.shell, "min-h-screen overflow-x-clip bg-[#f7f8fb] text-slate-900 lg:grid lg:grid-cols-[280px_minmax(0,1fr)]")}>
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-[80] focus:rounded-xl focus:bg-white focus:p-4">{locale === "tr" ? "İçeriğe geç" : "Skip to content"}</a>
      {mobileNavigationOpen ? (
        <button
          type="button"
          aria-label={t("common.close")}
          className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileNavigationOpen(false)}
        />
      ) : null}
      <aside
        id="admin-navigation"
        data-open={mobileNavigationOpen}
        aria-label={locale === "tr" ? "Yönetim menüsü" : "Admin navigation"}
        className={cn(styles.sidebar, "bg-[#090f1d] p-4 text-white shadow-2xl lg:shadow-none")}
      >
        <div className="mb-5 px-2">
          <div className="mb-3 flex justify-end lg:hidden">
            <button
              type="button"
              aria-label={t("common.close")}
              onClick={() => setMobileNavigationOpen(false)}
              className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white"
            >
              <X className="size-5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => replaceAdminRoute("/admin")}
            className="block text-left"
          >
            <BrandLogo dark className="w-44" />
            <small className="mt-2 block text-[10px] uppercase tracking-[.18em] text-white/40">
              {role === "SUPER_ADMIN" ? adminMenuLabel(t, "superAdmin") : role}
            </small>
          </button>
          <button
            type="button"
            onClick={goToUserDashboardFromAdmin}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2.5 text-xs font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            {t("admin.exit")}
          </button>
        </div>
        <nav className="space-y-1" aria-label={locale === "tr" ? "Yönetim bölümleri" : "Admin sections"}>
          {visibleNavigation.map(([href, labelKey, Icon]) => (
            <Link
              key={href}
              href={href}
              aria-current={isActiveAdminRoute(href) ? "page" : undefined}
              onClick={() => { setMobileNavigationOpen(false); setQ(""); }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs text-white/55 transition hover:bg-white/5 hover:text-white",
                isActiveAdminRoute(href) && "bg-orange-500/15 text-orange-300",
              )}
            >
              <Icon className="size-4" />
              {adminMenuLabel(t, labelKey)}
            </Link>
          ))}
          {visibleSettings.length ? (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs text-white/55"
            >
              <Settings className="size-4" />
              {adminMenuLabel(t, "settings")}
              <ChevronDown
                className={cn(
                  "ms-auto size-3 transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
          ) : null}
          {open &&
            visibleSettings.map(([href, labelKey, Icon]) => (
              <Link
                key={href}
                href={href}
                aria-current={isActiveAdminRoute(href) ? "page" : undefined}
                onClick={() => { setMobileNavigationOpen(false); setQ(""); }}
                className={cn(
                  "ms-4 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl px-3 py-2 text-left text-xs text-white/45 transition hover:bg-white/5 hover:text-white",
                  isActiveAdminRoute(href) &&
                    "bg-orange-500/10 text-orange-300",
                )}
              >
                <Icon className="size-4" />
                {adminMenuLabel(t, labelKey)}
              </Link>
            ))}
        </nav>
      </aside>
      <section className="min-w-0 max-w-full overflow-x-clip">
        <header className="sticky top-0 z-30 border-b bg-white/90 p-3 backdrop-blur sm:p-4">
          <div className="relative mx-auto flex max-w-5xl items-center gap-2">
            <button
              type="button"
              aria-controls="admin-navigation"
              aria-expanded={mobileNavigationOpen}
              aria-label={adminMenuLabel(t, "dashboard")}
              onClick={() => setMobileNavigationOpen(true)}
              className="grid size-11 shrink-0 place-items-center rounded-xl border bg-white lg:hidden"
            >
              <Menu className="size-5" />
            </button>
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border bg-white px-4">
              <Search className="size-4 shrink-0 text-slate-400" />
              <input
                value={q}
                aria-label={t("admin.searchPlaceholder")}
                onChange={(event) => { setQ(event.target.value); setResults(undefined); }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setQ("");
                    setResults(undefined);
                  }
                }}
                placeholder={t("admin.searchPlaceholder")}
                className="w-full min-w-0 py-3 text-sm outline-none"
              />
            </label>
            {q.trim().length >= 2 && (
              <div
                role="region"
                aria-live="polite"
                className="absolute inset-x-0 top-14 max-h-[70vh] overflow-y-auto rounded-2xl border bg-white p-4 shadow-2xl"
              >
                <SearchGroup
                  title={locale === "tr" ? "Bölümler" : "Sections"}
                  rows={[...visibleNavigation, ...visibleSettings].filter(item => adminMenuLabel(t, item[1]).toLocaleLowerCase(locale).includes(q.toLocaleLowerCase(locale))).map(item => ({ id: item[0], href: item[0], label: adminMenuLabel(t, item[1]) }))}
                  onSelect={replaceAdminRoute}
                />
                <SearchGroup
                  title={adminMenuLabel(t, "companies")}
                  rows={results?.companies}
                  onSelect={replaceAdminRoute}
                />
                <SearchGroup
                  title={adminMenuLabel(t, "users")}
                  rows={results?.users}
                  onSelect={replaceAdminRoute}
                />
                <SearchGroup
                  title={adminMenuLabel(t, "support")}
                  rows={results?.tickets}
                  onSelect={replaceAdminRoute}
                />
                {results && ![
                  ...(results?.companies ?? []),
                  ...(results?.users ?? []),
                  ...(results?.tickets ?? []),
                ].length ? (
                  <p className="py-4 text-center text-sm text-slate-500">
                    {t("admin.list.empty")}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </header>
        <main id="admin-main" tabIndex={-1} className="mx-auto min-w-0 max-w-[1600px] overflow-x-clip p-4 sm:p-5 md:p-8">
          {children}
        </main>
      </section>
    </div>
  );
}

function SearchGroup({
  title,
  rows,
  onSelect,
}: {
  title: string;
  rows?: any[];
  onSelect: (href: string) => void;
}) {
  if (!rows?.length) return null;
  return (
    <div className="mb-3">
      <b className="text-xs text-orange-600">{title}</b>
      {rows.map((row) => (
        <button
          type="button"
          key={row.id}
          onClick={() => onSelect(row.href)}
          className="mt-1 flex w-full items-start justify-between gap-3 rounded-lg px-2 py-2 text-start text-sm hover:bg-orange-50"
        >
          <span className="font-medium">{row.label}</span>
          <span className="break-all text-end text-xs text-slate-400">
            {row.detail}
          </span>
        </button>
      ))}
    </div>
  );
}
