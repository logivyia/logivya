"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, X, Grid2X2, Home, Layers, Send, Users, Tags, CircleHelp, CreditCard, UserPlus, PlusCircle, Search, ClipboardList, BusFront, UserRound, Bell } from "lucide-react";
import { LanguageSelector } from "@/components/language-selector";
import { guestMarketplaceCopy, guestMarketplaceLabels } from "../../../shared/guest-marketplace-copy";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import { useI18n } from "@/i18n/provider";
import { LowbedIcon } from "@/components/lowbed-icon";
import { publicMarketplaceSections } from "../../../shared/public-marketplace-sections";
const icons = [Grid2X2, WhatsAppIcon, Send, Home, Layers, LowbedIcon, Users, Tags, CircleHelp, CreditCard, UserPlus, PlusCircle, Search, ClipboardList, BusFront, BusFront, UserRound, Bell];
export function PublicMarketplaceShell({ children }: { children: ReactNode }) {
  const { locale } = useI18n(); const copy = guestMarketplaceCopy(locale); const labels = guestMarketplaceLabels(locale).labels;
  const path = usePathname(); const params = useSearchParams();
  const section = params.get("section") ?? "overview";
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!open) return; closeRef.current?.focus(); const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; document.addEventListener("keydown", escape); return () => document.removeEventListener("keydown", escape); }, [open]);
  const nav = (index: number) => { const item = publicMarketplaceSections[index]!; const Icon = icons[index]!; return <Link key={item.id} onClick={() => setOpen(false)} href={`/explore?section=${item.id}`} aria-current={section === item.id && path === "/explore" ? "page" : undefined} className={`flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${section === item.id ? "bg-primary-soft text-accent-foreground" : "text-muted hover:bg-muted-background"}`}><Icon className="size-5 shrink-0" /><span>{labels[item.id]}</span></Link>; };
  return <div className="min-h-dvh bg-background text-foreground">
    <header className="sticky top-0 z-40 flex min-h-20 flex-wrap items-center justify-between gap-3 py-3 border-b bg-card px-4 md:px-8">
      <div className="flex w-full items-center gap-3 sm:w-auto"><button type="button" onClick={() => setOpen(true)} aria-label={copy.openMenu} aria-expanded={open} className="grid size-11 place-items-center rounded-xl border lg:hidden"><Menu /></button><Link href="/explore" aria-label="Logivya"><span className="text-xl font-bold tracking-[.2em]">LOGIVYA</span></Link><div className="ms-auto sm:hidden"><LanguageSelector /></div></div>
      <div className="flex w-full items-center justify-end gap-2 sm:w-auto"><div className="hidden sm:block"><LanguageSelector /></div><Link href="/login" className="min-h-11 flex-1 text-center sm:flex-none rounded-xl border px-4 py-3 text-sm font-semibold">{labels.login}</Link><Link href="/register" className="min-h-11 flex-1 text-center sm:flex-none rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">{labels.register}</Link></div>
    </header>
    {open ? <button className="fixed inset-0 z-40 bg-black/60 lg:hidden" aria-label={copy.closeMenu} onClick={() => setOpen(false)} /> : null}
    <aside aria-label={copy.services} className={`${open ? "flex" : "hidden"} fixed inset-y-0 start-0 z-50 w-[min(86vw,290px)] flex-col border-e bg-card p-4 lg:top-20 lg:z-20 lg:flex lg:w-64`}>
      <div className="mb-3 flex items-center justify-between lg:hidden"><span className="font-bold tracking-widest">LOGIVYA</span><button ref={closeRef} onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-xl border" aria-label={copy.closeMenu}><X /></button></div>
      <nav className="overflow-y-auto pb-4">{publicMarketplaceSections.map((_, index) => nav(index))}</nav>
    </aside>
    <main className="mx-auto max-w-[1800px] px-4 py-6 pb-32 md:px-8 lg:ms-64">{children}</main>
    <nav aria-label={copy.quickActions} className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card px-1 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 lg:hidden">{[11,12,13,14,16].map((index) => { const item = publicMarketplaceSections[index]!; const Icon = icons[index]!; return <Link key={item.id} href={`/explore?section=${item.id}`} className={`flex min-h-16 flex-col items-center justify-center gap-2 rounded-xl px-1 text-center text-[11px] font-semibold ${section === item.id ? "bg-primary-soft text-accent-foreground" : "text-muted"}`}><Icon className="size-6" />{labels[item.id]}</Link>; })}</nav>
  </div>;
}
