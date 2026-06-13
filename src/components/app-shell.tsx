"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Bell, Boxes, Building2, ChevronDown, CircleHelp, CreditCard, History, LayoutDashboard, LogOut, Menu, Moon, Search, Send, Settings, ShieldCheck, Smartphone, Sun, Trash2, UserCog, UsersRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageSelector } from "@/components/language-selector";

const nav = [
  ["/dashboard", "nav.dashboard", LayoutDashboard], ["/accounts", "nav.accounts", Smartphone],
  ["/groups", "nav.groups", UsersRound], ["/categories", "nav.categories", Boxes],
  ["/send-message", "nav.sendMessage", Send], ["/message-history", "nav.history", History],
  ["/support", "Destek", CircleHelp],
] as const;
const settingsNav = [["/settings/company","settings.company",Building2],["/settings/users","settings.users",UserCog],["/settings/subscriptions","settings.billing",CreditCard],["/settings/delete-account","settings.deleteAccount",Trash2]] as const;

type NoticeItem={id:string;title:string;message:string;isRead:boolean;createdAt:string};
type ShellSubscription = {
  planName: string;
  status: string;
  trialEndsAt?: string;
  currentPeriodEndsAt?: string;
  endsAt?: string;
};

function remainingDays(endDate?: string, now = Date.now()) {
  if (!endDate) return 0;
  const timestamp = new Date(endDate).getTime();
  if (Number.isNaN(timestamp)) return 0;
  return Math.max(0, Math.ceil((timestamp - now) / 86_400_000));
}

function subscriptionBanner(subscription: ShellSubscription | undefined, t: ReturnType<typeof useI18n>["t"], now: number) {
  if (!subscription) return { text: t("trial.inactive"), isPositive: false };

  const status = subscription.status;
  if (status === "TRIALING") {
    const days = remainingDays(subscription.trialEndsAt || subscription.currentPeriodEndsAt || subscription.endsAt, now);
    return { text: `Deneme süreniz devam ediyor. Kalan süre: ${days} gün`, isPositive: true };
  }

  if (status === "ACTIVE") {
    const days = remainingDays(subscription.currentPeriodEndsAt || subscription.endsAt || subscription.trialEndsAt, now);
    return { text: `Aktif Paket: ${subscription.planName} · Kalan süre: ${days} gün`, isPositive: true };
  }

  if (status === "SUSPENDED") return { text: "Paketiniz askıya alındı", isPositive: false };
  if (status === "EXPIRED" || status === "CANCELED" || status === "CANCELLED") return { text: "Paket süreniz doldu", isPositive: false };
  return { text: t("trial.inactive"), isPositive: false };
}

export function AppShell({ children, userName, subscription, isPlatformAdmin=false }: { children: React.ReactNode; userName: string; isPlatformAdmin?:boolean; subscription?: ShellSubscription }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [noticeItems,setNoticeItems]=useState<NoticeItem[]>([]);
  const [unread,setUnread]=useState(0);
  const [currentTime]=useState(()=>Date.now());
  const [settingsOpen,setSettingsOpen]=useState(pathname.startsWith("/settings"));
  useEffect(()=>{void fetch("/api/notifications").then(r=>r.json()).then(value=>{setNoticeItems(value.notifications||[]);setUnread(value.unread||0)})},[]);
  const trialDays=remainingDays(subscription?.trialEndsAt||subscription?.currentPeriodEndsAt||subscription?.endsAt,currentTime);
  const periodDays=remainingDays(subscription?.currentPeriodEndsAt||subscription?.endsAt||subscription?.trialEndsAt,currentTime);
  const banner=subscriptionBanner(subscription,t,currentTime);
  if(pathname.startsWith("/admin"))return <>{children}</>;

  return <div className="min-h-screen lg:grid lg:grid-cols-[252px_1fr]">
    {open && <button className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)} aria-label={t("common.closeMenu")} />}
    <aside className={cn("fixed inset-y-0 start-0 z-50 flex w-[252px] flex-col border-e border-white/6 bg-sidebar px-4 py-5 text-white transition-transform lg:sticky lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full")}>
      <div className="mb-8 flex items-center justify-between px-2"><Link href="/dashboard"><BrandLogo dark className="w-44" /></Link><button className="lg:hidden" onClick={() => setOpen(false)}><X className="size-5" /></button></div>
      <nav className="space-y-1">{nav.map(([href, key, Icon]) => { const active = pathname.startsWith(href); const label=key.includes(".")?t(key):key; return <Link key={href} href={href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/55 hover:bg-white/5 hover:text-white", active && "bg-primary/12 text-primary")}><Icon className="size-[18px]" /><span>{label}</span>{active && <span className="ms-auto size-1.5 rounded-full bg-primary shadow-[0_0_10px_currentColor]" />}</Link>; })}{isPlatformAdmin&&<Link href="/admin" className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-orange-300 hover:bg-white/5",pathname.startsWith("/admin")&&"bg-primary/12")}><ShieldCheck className="size-[18px]"/>Super Admin</Link>}<button onClick={()=>setSettingsOpen(value=>!value)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/55 hover:bg-white/5 hover:text-white",pathname.startsWith("/settings")&&"bg-primary/12 text-primary")}><Settings className="size-[18px]"/><span>{t("nav.settings")}</span><ChevronDown className={cn("ms-auto size-4 transition-transform",settingsOpen&&"rotate-180")}/></button>{settingsOpen&&<div className="ms-4 space-y-1 border-s border-white/10 ps-3">{settingsNav.map(([href,key,Icon])=><Link key={href} href={href} onClick={()=>setOpen(false)} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/45 hover:bg-white/5 hover:text-white",pathname===href&&"bg-white/8 text-primary")}><Icon className="size-4"/>{t(key)}</Link>)}</div>}</nav>
      <div className="mt-auto rounded-2xl border border-white/8 bg-white/[.035] p-4"><div className="mb-3 flex items-center justify-between"><span className="rounded-full bg-primary/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">{subscription?.planName||t("trial.professional")}</span><span className="text-xs text-white/40">{subscription?.status==="TRIALING"?t("trial.days",{count:trialDays}):subscription?.status==="ACTIVE"?t("trial.days",{count:periodDays}):subscription?.status}</span></div><p className="text-xs leading-5 text-white/40">{t("trial.description")}</p><Link href="/settings/subscriptions" className="mt-3 block w-full rounded-lg bg-white px-3 py-2 text-center text-xs font-semibold text-sidebar hover:bg-primary">{t("trial.upgrade")}</Link></div>
    </aside>
    <div className="min-w-0"><header className="sticky top-0 z-30 flex h-18 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-xl md:px-8"><button className="rounded-lg border p-2 lg:hidden" onClick={() => setOpen(true)}><Menu className="size-5" /></button><div className="ms-auto flex items-center gap-2">
      <label className="hidden items-center gap-2 rounded-xl border bg-card px-3 py-2 md:flex"><Search className="size-4 text-muted" /><input className="w-32 bg-transparent text-xs outline-none" placeholder={t("header.search")} /><kbd className="text-[10px] text-muted">{t("header.shortcut")}</kbd></label>
      <LanguageSelector />
      <button className="rounded-xl border bg-card p-2" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={t("common.toggleTheme")}>{theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>
      <div className="relative"><button className="relative rounded-xl border bg-card p-2" onClick={() => setNotifications(!notifications)}><Bell className="size-4" />{unread>0&&<span className="absolute end-1 top-1 grid size-4 place-items-center rounded-full bg-primary text-[8px] font-bold text-white">{Math.min(unread,9)}</span>}</button>{notifications && <div className="panel absolute end-0 top-12 max-h-96 w-80 overflow-auto rounded-2xl p-3"><div className="flex items-center justify-between p-2"><b className="text-sm">{t("notifications.title")}</b><button onClick={async()=>{await fetch("/api/notifications",{method:"POST"});setUnread(0);setNoticeItems(items=>items.map(item=>({...item,isRead:true})))}} className="text-xs text-primary">{t("notifications.markAll")}</button></div>{noticeItems.length?noticeItems.map(item=><Notice key={item.id} title={item.title} text={item.message} unread={!item.isRead}/>):<p className="p-4 text-xs text-muted">{t("notifications.empty")}</p>}</div>}</div>
      <button title={t("auth.logout")} onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});location.href="/login";}} className="ms-1 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white"><span>{userName.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase()}</span><LogOut className="size-3.5"/></button>
    </div></header><div className={cn("border-b px-4 py-2 text-center text-xs font-medium md:px-8",banner.isPositive?"bg-green-50 text-green-700":"bg-red-50 text-danger")}>{banner.text}</div><main className="mx-auto max-w-[1600px] p-4 md:p-8">{children}</main></div>
  </div>;
}
function Notice({title,text,unread}:{title:string;text:string;unread:boolean}){return <div className="flex gap-3 rounded-xl p-2 hover:bg-primary-soft"><span className={cn("mt-1 size-2 shrink-0 rounded-full",unread?"bg-primary":"bg-muted/30")}/><div><p className="text-xs font-medium">{title}</p><p className="mt-1 text-[11px] leading-4 text-muted">{text}</p></div></div>}
