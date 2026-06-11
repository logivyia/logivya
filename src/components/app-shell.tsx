"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Bell, Boxes, ChevronDown, History, Languages, LayoutDashboard, Menu, MessageSquareText, Moon, Search, Send, Settings, Smartphone, Sun, UsersRound, X, Zap } from "lucide-react";
import { useState } from "react";
import { locales, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

const nav = [
  ["/dashboard", "nav.dashboard", LayoutDashboard], ["/accounts", "nav.accounts", Smartphone],
  ["/groups", "nav.groups", UsersRound], ["/categories", "nav.categories", Boxes],
  ["/send-message", "nav.sendMessage", Send], ["/message-history", "nav.history", History],
  ["/settings", "nav.settings", Settings],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { locale, localeNames, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const title = t(nav.find(([href]) => pathname.startsWith(href))?.[1] ?? "nav.dashboard");

  return <div className="min-h-screen lg:grid lg:grid-cols-[252px_1fr]">
    {open && <button className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)} aria-label={t("common.closeMenu")} />}
    <aside className={cn("fixed inset-y-0 start-0 z-50 flex w-[252px] flex-col border-e border-white/6 bg-sidebar px-4 py-5 text-white transition-transform lg:sticky lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full")}>
      <div className="mb-8 flex items-center justify-between px-2"><Link href="/dashboard" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary text-sidebar shadow-[0_0_28px_rgba(54,211,153,.24)]"><Zap className="size-5 fill-current" /></span><div><div className="text-lg font-semibold tracking-tight">{t("brand.name")}</div><div className="text-[10px] uppercase tracking-[.24em] text-white/35">{t("brand.tagline")}</div></div></Link><button className="lg:hidden" onClick={() => setOpen(false)}><X className="size-5" /></button></div>
      <nav className="space-y-1">{nav.map(([href, key, Icon]) => { const active = pathname.startsWith(href); return <Link key={href} href={href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/55 hover:bg-white/5 hover:text-white", active && "bg-primary/12 text-primary")}><Icon className="size-[18px]" /><span>{t(key)}</span>{active && <span className="ms-auto size-1.5 rounded-full bg-primary shadow-[0_0_10px_currentColor]" />}</Link>; })}</nav>
      <div className="mt-auto rounded-2xl border border-white/8 bg-white/[.035] p-4"><div className="mb-3 flex items-center justify-between"><span className="rounded-full bg-primary/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">{t("trial.professional")}</span><span className="text-xs text-white/40">{t("trial.days", { count: 2 })}</span></div><div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-2/3 rounded-full bg-primary" /></div><p className="text-xs leading-5 text-white/40">{t("trial.description")}</p><button className="mt-3 w-full rounded-lg bg-white px-3 py-2 text-xs font-semibold text-sidebar hover:bg-primary">{t("trial.upgrade")}</button></div>
    </aside>
    <div className="min-w-0"><header className="sticky top-0 z-30 flex h-18 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-xl md:px-8"><button className="rounded-lg border p-2 lg:hidden" onClick={() => setOpen(true)}><Menu className="size-5" /></button><div><p className="text-xs text-muted">{t("header.workspace")} / Logivya Transport</p><h1 className="text-lg font-semibold tracking-tight">{title}</h1></div><div className="ms-auto flex items-center gap-2">
      <label className="hidden items-center gap-2 rounded-xl border bg-card px-3 py-2 md:flex"><Search className="size-4 text-muted" /><input className="w-32 bg-transparent text-xs outline-none" placeholder={t("header.search")} /><kbd className="text-[10px] text-muted">{t("header.shortcut")}</kbd></label>
      <div className="relative"><button className="flex items-center gap-1 rounded-xl border bg-card px-2.5 py-2 text-xs" onClick={() => setLanguageOpen(!languageOpen)}><Languages className="size-4" />{locale.toUpperCase()}<ChevronDown className="size-3 text-muted" /></button>{languageOpen && <div className="panel absolute end-0 top-11 z-50 max-h-80 w-48 overflow-auto rounded-xl p-2">{locales.map(item => <button key={item} onClick={() => { void setLocale(item as Locale); setLanguageOpen(false); }} className={cn("block w-full rounded-lg px-3 py-2 text-start text-xs hover:bg-primary-soft", locale === item && "bg-primary-soft text-primary")}>{localeNames[item]}</button>)}</div>}</div>
      <button className="rounded-xl border bg-card p-2" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={t("common.toggleTheme")}>{theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>
      <div className="relative"><button className="relative rounded-xl border bg-card p-2" onClick={() => setNotifications(!notifications)}><Bell className="size-4" /><span className="absolute end-1.5 top-1.5 size-1.5 rounded-full bg-primary" /></button>{notifications && <div className="panel absolute end-0 top-12 w-80 rounded-2xl p-3"><div className="flex items-center justify-between p-2"><b className="text-sm">{t("notifications.title")}</b><span className="text-xs text-primary">{t("notifications.markAll")}</span></div><Notice icon={MessageSquareText} title={t("notifications.campaignCompleted")} text={t("notifications.delivered")} /><Notice icon={Smartphone} title={t("notifications.disconnected")} text={t("notifications.reconnect")} /></div>}</div>
      <button className="ms-1 grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-emerald-700 text-xs font-bold text-white">BK</button>
    </div></header><main className="mx-auto max-w-[1600px] p-4 md:p-8">{children}</main></div>
  </div>;
}
function Notice({ icon: Icon, title, text }: { icon: typeof Bell; title: string; text: string }) { return <div className="flex gap-3 rounded-xl p-2 hover:bg-primary-soft"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><Icon className="size-4" /></span><div><p className="text-xs font-medium">{title}</p><p className="mt-1 text-[11px] leading-4 text-muted">{text}</p></div></div>; }
