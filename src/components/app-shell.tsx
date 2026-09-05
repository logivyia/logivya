"use client";
import { productStatusCopy } from "../../shared/product-status-copy";
import { WhatsAppIcon } from "@/components/whatsapp-icon";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Bell,
  Boxes,
  ChevronDown,
  CircleHelp,
  ContactRound,
  CreditCard,
  House,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PackageOpen,
  PanelsTopLeft,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  UserCog,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { notificationDeepLinkToWebHref } from "@/lib/notifications/deep-link";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageSelector } from "@/components/language-selector";
import { LowbedIcon } from "@/components/lowbed-icon";
import { adminMenuLabel, statusLabel } from "@/i18n/status";

const primaryNav = [
  { href: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/accounts", key: "nav.accounts", icon: WhatsAppIcon },
  {
    href: "/telegram",
    key: "nav.telegramManagement",
    icon: Send,
    feature: "telegram",
  },
  {
    href: "/facebook",
    key: "nav.facebookManagement",
    icon: PanelsTopLeft,
    feature: "facebook",
  },
  {
    href: "/marketplace?scope=HOME_MOVING",
    activePath: "/marketplace",
    activeScope: "HOME_MOVING",
    key: "nav.homeMoving",
    icon: House,
    feature: "freight",
  },
  {
    href: "/marketplace?scope=PARTIAL_LOAD",
    activePath: "/marketplace",
    activeScope: "PARTIAL_LOAD",
    key: "nav.partialLoad",
    icon: PackageOpen,
    feature: "freight",
  },
  {
    href: "/marketplace?scope=HEAVY_HAUL",
    activePath: "/marketplace",
    activeScope: "HEAVY_HAUL",
    key: "nav.heavyHaul",
    icon: LowbedIcon,
    feature: "freight",
    wideIcon: true,
  },
  { href: "/groups", key: "nav.groups", icon: UsersRound },
  { href: "/categories", key: "nav.categories", icon: Boxes },
  { href: "/support", key: "nav.support", icon: CircleHelp },
  {
    href: "/settings/subscriptions",
    key: "settings.billing",
    icon: CreditCard,
  },
  { href: "/settings/users", key: "users.addUser", icon: UserCog },
] as const;
const settingsNav = [
  {
    href: "/settings/profile",
    key: "settings.profile",
    icon: UserRound,
    ownerOnly: false,
  },
  {
    href: "/settings/company",
    key: "settings.company",
    icon: ContactRound,
    ownerOnly: false,
  },
  {
    href: "/settings/security",
    key: "settings.security",
    icon: ShieldCheck,
    ownerOnly: false,
  },
  {
    href: "/settings/delete-account",
    key: "settings.deleteAccount",
    icon: Trash2,
    ownerOnly: false,
  },
] as const;

type NoticeItem = {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  deepLink?: string | null;
};
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

function latestSubscriptionEnd(subscription?: ShellSubscription) {
  if (!subscription) return undefined;
  return [
    subscription.currentPeriodEndsAt,
    subscription.endsAt,
    subscription.trialEndsAt,
  ]
    .filter((value): value is string => Boolean(value))
    .sort(
      (left, right) => new Date(right).getTime() - new Date(left).getTime(),
    )[0];
}

function localizedSubscriptionBanner(
  subscription: ShellSubscription | undefined,
  t: ReturnType<typeof useI18n>["t"],
  now: number,
) {
  if (!subscription)
    return { text: t("subscription.noPackage"), isPositive: false };
  const status = subscription.status;
  const endDate = latestSubscriptionEnd(subscription);
  if (status === "TRIAL" || status === "TRIALING") {
    const days = remainingDays(endDate, now);
    return { text: t("subscription.trialActive", { days }), isPositive: true };
  }
  if (status === "ACTIVE") {
    const days = remainingDays(endDate, now);
    return {
      text: t("subscription.activePlan", { plan: subscription.planName, days }),
      isPositive: true,
    };
  }
  if (status === "SUSPENDED")
    return { text: t("subscription.suspended"), isPositive: false };
  if (status === "EXPIRED" || status === "CANCELED" || status === "CANCELLED") {
    return { text: t("subscription.expired"), isPositive: false };
  }
  return { text: statusLabel(t, "subscription", status), isPositive: false };
}

type AppShellFeatureAvailability = {
  telegram: boolean;
  facebook: boolean;
  freight: boolean;
};

export function AppShell({
  children,
  userName,
  subscription,
  isPlatformAdmin = false,
  memberRole,
  featureAvailability,
}: {
  children: React.ReactNode;
  userName: string;
  memberRole: string;
  isPlatformAdmin?: boolean;
  subscription?: ShellSubscription;
  featureAvailability?: AppShellFeatureAvailability;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const settingsRouteActive = settingsNav.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  const { theme, setTheme } = useTheme();
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(value => !value); }
      if (event.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, []);
  const [notifications, setNotifications] = useState(false);
  const [noticeItems, setNoticeItems] = useState<NoticeItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [currentTime] = useState(() => Date.now());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const enabledFeatures: AppShellFeatureAvailability = featureAvailability ?? {
    telegram: false,
    facebook: false,
    freight: false,
  };
  const currentScope = searchParams.get("scope");
  const visibleNav = primaryNav.filter(
    (item) => !("feature" in item) || enabledFeatures[item.feature],
  );
  const settingsExpanded = settingsRouteActive || settingsOpen;
  useEffect(() => {
    let active = true;
    const load = () =>
      void fetch("/api/notifications?limit=10")
        .then((r) => r.json())
        .then((value) => {
          if (active) {
            setNoticeItems(value.notifications || []);
            setUnread(value.unread || 0);
          }
        })
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  const subscriptionEndDate = latestSubscriptionEnd(subscription);
  const trialDays = remainingDays(subscriptionEndDate, currentTime);
  const periodDays = remainingDays(subscriptionEndDate, currentTime);
  const banner = localizedSubscriptionBanner(subscription, t, currentTime);
  const visibleSettings = settingsNav.filter(
    (item) => !item.ownerOnly || memberRole === "OWNER",
  );
  if (pathname.startsWith("/admin")) return <>{children}</>;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[252px_1fr]">
      {open && (
        <button
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label={t("common.closeMenu")}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-50 flex w-[252px] flex-col overflow-y-auto overscroll-contain border-e border-white/6 bg-sidebar px-4 py-5 text-white transition-transform lg:sticky lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full",
        )}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <Link href="/dashboard">
            <BrandLogo dark className="w-44" />
          </Link>
          <button className="lg:hidden" onClick={() => setOpen(false)}>
            <X className="size-5" />
          </button>
        </div>
        <nav aria-label={t("nav.primary")} className="space-y-1">
          {visibleNav.map((item) => {
            const { href, key, icon: Icon } = item;
            const activePath = "activePath" in item ? item.activePath : href;
            const active =
              pathname.startsWith(activePath) &&
              (!("activeScope" in item) || currentScope === item.activeScope);
            const label = t(key);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/72 outline-none hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-primary",
                  active && "bg-primary/16 text-primary",
                )}
              >
                <span className="inline-grid h-6 w-[42px] shrink-0 place-items-center">
                  <Icon
                    aria-hidden
                    className={"wideIcon" in item ? undefined : "size-[18px]"}
                  />
                </span>
                <span>{label}</span>
                {active && (
                  <span
                    aria-hidden
                    className="ms-auto size-1.5 rounded-full bg-primary shadow-[0_0_10px_currentColor]"
                  />
                )}
              </Link>
            );
          })}
          {isPlatformAdmin && (
            <Link
              href="/admin"
              aria-current={pathname.startsWith("/admin") ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-orange-200 outline-none hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-primary",
                pathname.startsWith("/admin") && "bg-primary/16 text-primary",
              )}
            >
              <span className="inline-grid h-6 w-[42px] shrink-0 place-items-center">
                <ShieldCheck aria-hidden className="size-[18px]" />
              </span>
              {adminMenuLabel(t, "superAdmin")}
            </Link>
          )}
          <button
            type="button"
            aria-controls="settings-navigation"
            aria-expanded={settingsExpanded}
            aria-current={settingsRouteActive ? "page" : undefined}
            onClick={() => setSettingsOpen((value) => !value)}
            className={cn(
              "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/72 outline-none hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-primary",
              settingsRouteActive && "bg-primary/16 text-primary",
            )}
          >
            <span className="inline-grid h-6 w-[42px] shrink-0 place-items-center">
              <Settings aria-hidden className="size-[18px]" />
            </span>
            <span>{t("nav.settings")}</span>
            <ChevronDown
              aria-hidden
              className={cn(
                "ms-auto size-4 transition-transform motion-reduce:transition-none",
                settingsExpanded && "rotate-180",
              )}
            />
          </button>
          {settingsExpanded && (
            <div
              id="settings-navigation"
              className="ms-4 space-y-1 border-s border-white/15 ps-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1"
            >
              {visibleSettings.map(({ href, key, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={pathname === href ? "page" : undefined}
                  className={cn(
                    "flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/65 outline-none hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-primary",
                    pathname === href && "bg-white/10 text-primary",
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                  {t(key)}
                </Link>
              ))}
            </div>
          )}
        </nav>
        <div className="mt-auto rounded-2xl border border-white/12 bg-white/[.06] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="rounded-full bg-primary/18 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
              {subscription?.planName || t("trial.professional")}
            </span>
            <span className="text-xs text-white/68">
              {subscription?.status === "TRIALING"
                ? t("trial.days", { count: trialDays })
                : subscription?.status === "ACTIVE"
                  ? t("trial.days", { count: periodDays })
                  : subscription?.status
                    ? statusLabel(t, "subscription", subscription.status)
                    : ""}
            </span>
          </div>
          <p className="text-xs leading-5 text-white/70">
            {t("trial.description")}
          </p>
          <Link
            href="/settings/subscriptions"
            className="mt-3 block w-full rounded-lg bg-primary px-3 py-2 text-center text-xs font-semibold text-primary-foreground hover:brightness-95"
          >
            {t("trial.upgrade")}
          </Link>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-18 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-xl md:px-8">
          <button
            className="rounded-lg border p-2 lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <div className="ms-auto flex items-center gap-2">
            <button type="button" onClick={() => setSearchOpen(true)} className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2" aria-label={productStatusCopy(locale).navigationSearch}>
              <Search className="size-4 text-muted" /><span className="hidden text-xs md:block">{productStatusCopy(locale).navigationSearch}</span><kbd className="hidden text-[10px] text-muted md:block">Ctrl K</kbd>
            </button>
            {searchOpen && <div className="absolute inset-x-4 top-20 z-50 max-h-[65vh] overflow-y-auto rounded-xl border bg-card p-4 shadow-xl md:left-auto md:w-96" role="search">
              <label className="text-sm font-semibold">{productStatusCopy(locale).navigationSearch}<input autoFocus value={searchText} onChange={event => setSearchText(event.target.value)} className="mt-2 w-full rounded-lg border bg-background p-3" /></label>
              <ul className="mt-2">{[...visibleNav, ...visibleSettings].filter(item => t(item.key).toLocaleLowerCase(locale).includes(searchText.toLocaleLowerCase(locale))).map(item => <li key={item.href}><Link className="block rounded-lg px-3 py-2 hover:bg-secondary" href={item.href} onClick={() => { setSearchOpen(false); setSearchText(""); }}>{t(item.key)}</Link></li>)}</ul>
              <button className="mt-2 rounded-lg border p-2 text-sm" onClick={() => setSearchOpen(false)}>{t("common.close")}</button>
            </div>}
            <LanguageSelector />
            <button
              className="rounded-xl border bg-card p-2"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={t("common.toggleTheme")}
            >
              {theme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </button>
            <div className="relative">
              <button
                className="relative rounded-xl border bg-card p-2"
                onClick={() => setNotifications(!notifications)}
              >
                <Bell className="size-4" />
                {unread > 0 && (
                  <span className="absolute end-1 top-1 grid size-4 place-items-center rounded-full bg-primary text-[8px] font-bold text-white">
                    {Math.min(unread, 9)}
                  </span>
                )}
              </button>
              {notifications && (
                <div className="panel absolute end-0 top-12 max-h-96 w-80 overflow-auto rounded-2xl p-3">
                  <div className="flex items-center justify-between p-2">
                    <b className="text-sm">{t("notifications.title")}</b>
                    <button
                      onClick={async () => {
                        await fetch("/api/notifications", { method: "POST" });
                        setUnread(0);
                        setNoticeItems((items) =>
                          items.map((item) => ({ ...item, isRead: true })),
                        );
                      }}
                      className="text-xs text-primary"
                    >
                      {t("notifications.markAll")}
                    </button>
                  </div>
                  {noticeItems.length ? (
                    noticeItems.map((item) => (
                      <Notice
                        key={item.id}
                        title={item.title}
                        text={item.message}
                        unread={!item.isRead}
                        href={notificationDeepLinkToWebHref(item.deepLink)}
                        onOpen={async () => {
                          if (!item.isRead) {
                            await fetch(
                              `/api/notifications/${encodeURIComponent(item.id)}`,
                              {
                                method: "PATCH",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ action: "read" }),
                              },
                            );
                            setNoticeItems((items) =>
                              items.map((value) =>
                                value.id === item.id
                                  ? { ...value, isRead: true }
                                  : value,
                              ),
                            );
                            setUnread((value) => Math.max(0, value - 1));
                          }
                          setNotifications(false);
                        }}
                      />
                    ))
                  ) : (
                    <p className="p-4 text-xs text-muted">
                      {t("notifications.empty")}
                    </p>
                  )}
                  <Link
                    href="/notifications"
                    onClick={() => setNotifications(false)}
                    className="mt-2 block border-t p-3 text-center text-xs font-semibold text-primary"
                  >
                    {t("notifications.viewAll")}
                  </Link>
                </div>
              )}
            </div>
            <button
              title={t("auth.logout")}
              onClick={async () => {
                localStorage.removeItem("logivya.selectedGroupIds");
                await fetch("/api/auth/logout", { method: "POST" });
                location.href = "/login";
              }}
              className="ms-1 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white"
            >
              <span>
                {userName
                  .split(" ")
                  .map((x) => x[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <LogOut className="size-3.5" />
            </button>
          </div>
        </header>
        <div
          className={cn(
            "border-b px-4 py-2 text-center text-xs font-medium md:px-8",
            banner.isPositive
              ? "bg-success-soft text-success-foreground"
              : "bg-danger-soft text-danger-foreground",
          )}
        >
          {banner.text}
        </div>
        <main className="mx-auto max-w-[1600px] p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
function Notice({
  title,
  text,
  unread,
  href,
  onOpen,
}: {
  title: string;
  text: string;
  unread: boolean;
  href: string | null;
  onOpen: () => void | Promise<void>;
}) {
  const content = (
    <>
      <span
        className={cn(
          "mt-1 size-2 shrink-0 rounded-full",
          unread ? "bg-primary" : "bg-muted/30",
        )}
      />
      <span>
        <span className="block text-xs font-medium">{title}</span>
        <span className="mt-1 block text-[11px] leading-4 text-muted">
          {text}
        </span>
      </span>
    </>
  );
  return href ? (
    <Link
      href={href}
      onClick={() => void onOpen()}
      className="flex gap-3 rounded-xl p-2 outline-none hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary"
    >
      {content}
    </Link>
  ) : (
    <div className="flex gap-3 rounded-xl p-2">{content}</div>
  );
}
