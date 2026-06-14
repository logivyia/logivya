"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { usePathname, useRouter } from "next/navigation";
import { Activity, ArrowLeft, Building2, ChevronDown, CircleDollarSign, ClipboardCheck, Database, FileClock, FileText, Flag, Gauge, HeartPulse, Megaphone, Search, Settings, ShieldAlert, Ticket, Users, Webhook, Zap } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";
import { useI18n } from "@/i18n/provider";
import { getAdminMenuLabel } from "@/lib/i18n/status-labels";

const nav = [
  ["/admin", "dashboard", Gauge],
  ["/admin/companies", "companies", Building2],
  ["/admin/users", "users", Users],
  ["/admin/billing", "billing", CircleDollarSign],
  ["/admin/subscriptions", "subscriptions", FileClock],
  ["/admin/invoices", "invoices", FileText],
  ["/admin/payments", "payments", CircleDollarSign],
  ["/admin/whatsapp-accounts", "whatsappAccounts", Zap],
  ["/admin/campaigns", "campaigns", Activity],
  ["/admin/support", "support", Ticket],
  ["/admin/security", "security", ShieldAlert],
  ["/admin/compliance", "compliance", ClipboardCheck],
  ["/admin/audit", "audit", FileClock],
  ["/admin/activity", "activity", Activity],
  ["/admin/notifications", "notifications", Megaphone],
  ["/admin/data-requests", "dataRequests", FileText],
  ["/admin/metrics", "metrics", Gauge],
  ["/admin/system/health", "systemHealth", HeartPulse],
  ["/admin/system/backups", "backups", Database],
  ["/admin/disaster-recovery", "disasterRecovery", Database],
] as const;
const settings = [
  ["/admin/settings/feature-flags", "featureFlags", Flag],
  ["/admin/announcements", "announcements", Megaphone],
  ["/admin/api-usage", "apiUsage", Zap],
  ["/admin/webhooks", "webhooks", Webhook],
  ["/admin/settings/platform", "platformSettings", Settings],
] as const;

export function AdminShell({ children, role, permissions }: { children: React.ReactNode; role: string; permissions: string[] }) {
  const router = useRouter();
  const path = usePathname();
  const { locale } = useI18n();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any>();
  const [open, setOpen] = useState(true);
  const canAccessAdminNavigation = role === "SUPER_ADMIN" || permissions.length > 0;

  function goToUserDashboardFromAdmin() {
    setResults(undefined);
    setQ("");
    router.replace("/dashboard");
  }

  function replaceAdminRoute(href: string) {
    setResults(undefined);
    router.replace(href);
  }

  function isActiveAdminRoute(href: string) {
    if (href === "/admin") return path === href;
    return path === href || path.startsWith(`${href}/`);
  }

  async function search(value: string) {
    setQ(value);
    if (value.length < 2) return setResults(undefined);
    setResults(await fetch(`/api/admin/search?q=${encodeURIComponent(value)}`).then((response) => response.json()));
  }
  return <div className="min-h-screen bg-[#f7f8fb] text-slate-900 lg:grid lg:grid-cols-[280px_1fr]">
    <aside className="bg-[#090f1d] p-4 text-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
      <div className="mb-5 px-2">
        <button type="button" onClick={() => replaceAdminRoute("/admin")} className="block text-left">
          <BrandLogo dark className="w-44" />
          <small className="mt-2 block text-[10px] uppercase tracking-[.18em] text-white/40">
            {role === "SUPER_ADMIN" ? getAdminMenuLabel("superAdmin", locale) : role}
          </small>
        </button>
        <button
          type="button"
          onClick={goToUserDashboardFromAdmin}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2.5 text-xs font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Panele dön
        </button>
      </div>
      <nav className="space-y-1">
        {canAccessAdminNavigation && nav.map(([href, labelKey, Icon]) => (
          <button
            key={href}
            type="button"
            onClick={() => replaceAdminRoute(href)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs text-white/55 transition hover:bg-white/5 hover:text-white",
              isActiveAdminRoute(href) && "bg-orange-500/15 text-orange-300",
            )}
          >
            <Icon className="size-4" />
            {getAdminMenuLabel(labelKey, locale)}
          </button>
        ))}
        <button onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs text-white/55"><Settings className="size-4" />{getAdminMenuLabel("settings", locale)}<ChevronDown className={cn("ms-auto size-3", open && "rotate-180")} /></button>
        {canAccessAdminNavigation && open && settings.map(([href, labelKey, Icon]) => (
          <button
            key={href}
            type="button"
            onClick={() => replaceAdminRoute(href)}
            className={cn(
              "ms-4 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl px-3 py-2 text-left text-xs text-white/45 transition hover:bg-white/5 hover:text-white",
              isActiveAdminRoute(href) && "bg-orange-500/10 text-orange-300",
            )}
          >
            <Icon className="size-4" />
            {getAdminMenuLabel(labelKey, locale)}
          </button>
        ))}
      </nav>
    </aside>
    <section>
      <header className="sticky top-0 z-30 border-b bg-white/90 p-4 backdrop-blur"><div className="relative mx-auto max-w-5xl"><label className="flex items-center gap-2 rounded-xl border bg-white px-4"><Search className="size-4 text-slate-400" /><input value={q} onChange={(event) => void search(event.target.value)} placeholder={locale === "tr" ? "Şirket, kullanıcı, fatura, kampanya veya destek talebi ara..." : "Search companies, users, invoices, campaigns or support tickets..."} className="w-full py-3 text-sm outline-none" /></label>{results && <div className="absolute inset-x-0 top-14 rounded-2xl border bg-white p-4 shadow-2xl"><SearchGroup title={getAdminMenuLabel("companies", locale)} rows={results.companies} /><SearchGroup title={getAdminMenuLabel("users", locale)} rows={results.users} /><SearchGroup title={getAdminMenuLabel("campaigns", locale)} rows={results.campaigns} /><SearchGroup title={getAdminMenuLabel("support", locale)} rows={results.tickets} /></div>}</div></header>
      <main className="mx-auto max-w-[1600px] p-5 md:p-8">{children}</main>
    </section>
  </div>;
}

function SearchGroup({ title, rows }: { title: string; rows?: any[] }) {
  if (!rows?.length) return null;
  return <div className="mb-3"><b className="text-xs text-orange-600">{title}</b>{rows.map((row) => <p key={row.id} className="mt-1 text-sm">{row.label}<span className="ms-2 text-xs text-slate-400">{row.detail}</span></p>)}</div>;
}
