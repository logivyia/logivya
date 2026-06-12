"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Activity, Bell, Boxes, Building2, ChevronDown, CircleHelp, CreditCard, History, Languages, LayoutDashboard, LogOut, Menu, Moon, Search, Send, Settings, ShieldCheck, Smartphone, Sun, Trash2, UserCog, UsersRound, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { locales, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

const nav = [
  ["/dashboard", "nav.dashboard", LayoutDashboard], ["/accounts", "nav.accounts", Smartphone],
  ["/groups", "nav.groups", UsersRound], ["/categories", "nav.categories", Boxes],
  ["/send-message", "nav.sendMessage", Send], ["/message-history", "nav.history", History],
  ["/activity", "Aktivite", Activity], ["/support", "Destek", CircleHelp],
] as const;
const settingsNav = [["/settings/company","settings.company",Building2],["/settings/users","settings.users",UserCog],["/settings/subscriptions","settings.billing",CreditCard],["/settings/delete-account","settings.deleteAccount",Trash2]] as const;

type NoticeItem={id:string;title:string;message:string;isRead:boolean;createdAt:string};
export function AppShell({ children, userName, subscription, isPlatformAdmin=false }: { children: React.ReactNode; userName: string; isPlatformAdmin?:boolean; subscription?: { planName:string;status:string;trialEndsAt?:string;currentPeriodEndsAt?:string } }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { locale, localeNames, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [noticeItems,setNoticeItems]=useState<NoticeItem[]>([]);
  const [unread,setUnread]=useState(0);
  const [currentTime]=useState(()=>Date.now());
  const [settingsOpen,setSettingsOpen]=useState(pathname.startsWith("/settings"));
  useEffect(()=>{void fetch("/api/notifications").then(r=>r.json()).then(value=>{setNoticeItems(value.notifications||[]);setUnread(value.unread||0)})},[]);
  const trialDays=subscription?.trialEndsAt?Math.max(0,Math.ceil((new Date(subscription.trialEndsAt).getTime()-currentTime)/86400000)):0;
  const banner=subscription?.status==="TRIALING"?`Deneme süreniz devam ediyor. Kalan süre: ${trialDays} gün.`:subscription?.status==="ACTIVE"?`Aktif Paket: ${subscription.planName}`:"Aboneliğiniz aktif değil. Mesaj göndermek için paketinizi yenileyin.";
  if(pathname.startsWith("/admin"))return <>{children}</>;

  return <div className="min-h-screen lg:grid lg:grid-cols-[252px_1fr]">
    {open && <button className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)} aria-label={t("common.closeMenu")} />}
    <aside className={cn("fixed inset-y-0 start-0 z-50 flex w-[252px] flex-col border-e border-white/6 bg-sidebar px-4 py-5 text-white transition-transform lg:sticky lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full")}>
      <div className="mb-8 flex items-center justify-between px-2"><Link href="/dashboard" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary text-sidebar shadow-[0_0_28px_rgba(54,211,153,.24)]"><Zap className="size-5 fill-current" /></span><div><div className="text-lg font-semibold tracking-tight">{t("brand.name")}</div><div className="text-[10px] uppercase tracking-[.24em] text-white/35">{t("brand.tagline")}</div></div></Link><button className="lg:hidden" onClick={() => setOpen(false)}><X className="size-5" /></button></div>
      <nav className="space-y-1">{nav.map(([href, key, Icon]) => { const active = pathname.startsWith(href); const label=key.includes(".")?t(key):key; return <Link key={href} href={href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/55 hover:bg-white/5 hover:text-white", active && "bg-primary/12 text-primary")}><Icon className="size-[18px]" /><span>{label}</span>{active && <span className="ms-auto size-1.5 rounded-full bg-primary shadow-[0_0_10px_currentColor]" />}</Link>; })}{isPlatformAdmin&&<Link href="/admin" className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-orange-300 hover:bg-white/5",pathname.startsWith("/admin")&&"bg-primary/12")}><ShieldCheck className="size-[18px]"/>Super Admin</Link>}<button onClick={()=>setSettingsOpen(value=>!value)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/55 hover:bg-white/5 hover:text-white",pathname.startsWith("/settings")&&"bg-primary/12 text-primary")}><Settings className="size-[18px]"/><span>{t("nav.settings")}</span><ChevronDown className={cn("ms-auto size-4 transition-transform",settingsOpen&&"rotate-180")}/></button>{settingsOpen&&<div className="ms-4 space-y-1 border-s border-white/10 ps-3">{settingsNav.map(([href,key,Icon])=><Link key={href} href={href} onClick={()=>setOpen(false)} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/45 hover:bg-white/5 hover:text-white",pathname===href&&"bg-white/8 text-primary")}><Icon className="size-4"/>{t(key)}</Link>)}</div>}</nav>
      <div className="mt-auto rounded-2xl border border-white/8 bg-white/[.035] p-4"><div className="mb-3 flex items-center justify-between"><span className="rounded-full bg-primary/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">{subscription?.planName||t("trial.professional")}</span><span className="text-xs text-white/40">{subscription?.status==="TRIALING"?`${trialDays} gün`:subscription?.status}</span></div><p className="text-xs leading-5 text-white/40">{t("trial.description")}</p><Link href="/settings/subscriptions" className="mt-3 block w-full rounded-lg bg-white px-3 py-2 text-center text-xs font-semibold text-sidebar hover:bg-primary">{t("trial.upgrade")}</Link></div>
    </aside>
    <div className="min-w-0"><header className="sticky top-0 z-30 flex h-18 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-xl md:px-8"><button className="rounded-lg border p-2 lg:hidden" onClick={() => setOpen(true)}><Menu className="size-5" /></button><div className="ms-auto flex items-center gap-2">
      <label className="hidden items-center gap-2 rounded-xl border bg-card px-3 py-2 md:flex"><Search className="size-4 text-muted" /><input className="w-32 bg-transparent text-xs outline-none" placeholder={t("header.search")} /><kbd className="text-[10px] text-muted">{t("header.shortcut")}</kbd></label>
      <div className="relative"><button className="flex items-center gap-1 rounded-xl border bg-card px-2.5 py-2 text-xs" onClick={() => setLanguageOpen(!languageOpen)}><Languages className="size-4" />{locale.toUpperCase()}<ChevronDown className="size-3 text-muted" /></button>{languageOpen && <div className="panel absolute end-0 top-11 z-50 max-h-80 w-48 overflow-auto rounded-xl p-2">{locales.map(item => <button key={item} onClick={() => { void setLocale(item as Locale); setLanguageOpen(false); }} className={cn("block w-full rounded-lg px-3 py-2 text-start text-xs hover:bg-primary-soft", locale === item && "bg-primary-soft text-primary")}>{localeNames[item]}</button>)}</div>}</div>
      <button className="rounded-xl border bg-card p-2" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={t("common.toggleTheme")}>{theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>
      <div className="relative"><button className="relative rounded-xl border bg-card p-2" onClick={() => setNotifications(!notifications)}><Bell className="size-4" />{unread>0&&<span className="absolute end-1 top-1 grid size-4 place-items-center rounded-full bg-primary text-[8px] font-bold text-white">{Math.min(unread,9)}</span>}</button>{notifications && <div className="panel absolute end-0 top-12 max-h-96 w-80 overflow-auto rounded-2xl p-3"><div className="flex items-center justify-between p-2"><b className="text-sm">{t("notifications.title")}</b><button onClick={async()=>{await fetch("/api/notifications",{method:"POST"});setUnread(0);setNoticeItems(items=>items.map(item=>({...item,isRead:true})))}} className="text-xs text-primary">{t("notifications.markAll")}</button></div>{noticeItems.length?noticeItems.map(item=><Notice key={item.id} title={item.title} text={item.message} unread={!item.isRead}/>):<p className="p-4 text-xs text-muted">Bildirim bulunmuyor.</p>}</div>}</div>
      <button title={t("auth.logout")} onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});location.href="/login";}} className="ms-1 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white"><span>{userName.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase()}</span><LogOut className="size-3.5"/></button>
    </div></header><div className={cn("border-b px-4 py-2 text-center text-xs font-medium md:px-8",subscription?.status==="ACTIVE"?"bg-green-50 text-green-700":subscription?.status==="TRIALING"?"bg-orange-50 text-orange-700":"bg-red-50 text-danger")}>{banner}</div><main className="mx-auto max-w-[1600px] p-4 md:p-8">{children}</main></div>
  </div>;
}
function Notice({title,text,unread}:{title:string;text:string;unread:boolean}){return <div className="flex gap-3 rounded-xl p-2 hover:bg-primary-soft"><span className={cn("mt-1 size-2 shrink-0 rounded-full",unread?"bg-primary":"bg-muted/30")}/><div><p className="text-xs font-medium">{title}</p><p className="mt-1 text-[11px] leading-4 text-muted">{text}</p></div></div>}
