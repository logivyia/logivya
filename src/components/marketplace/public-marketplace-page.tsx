"use client";
import { guestMarketplaceCopy, guestMarketplaceLabels, guestSectionDescription } from "../../../shared/guest-marketplace-copy";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, RefreshCw, ArrowRight, LockKeyhole } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { CatalogFilters } from "./catalog-filters";
import { LiveListingCard } from "./live-listing-card";
import { marketplaceCopy } from "./copy";
import type { WebMarketplaceListing } from "./types";
import { marketplaceFilterParams, parseMarketplaceFilters } from "../../../shared/marketplace-filters";
import { publicMarketplaceSection } from "../../../shared/public-marketplace-sections";

export function PublicMarketplacePage() {
  const { locale } = useI18n(); const guest = guestMarketplaceCopy(locale); const labels = guestMarketplaceLabels(locale).labels; const copy = marketplaceCopy(locale);
  const params = useSearchParams(); const router = useRouter();
  const section = publicMarketplaceSection(params.get("section"));
  const privateSection = "private" in section && section.private;
  const scope = "scope" in section ? section.scope : "GLOBAL";
  const filters = { ...parseMarketplaceFilters(new URLSearchParams(params.toString())), kind: "kind" in section ? section.kind : params.get("kind") ?? "" };
  const filterQuery = marketplaceFilterParams(filters);
  const [items, setItems] = useState<WebMarketplaceListing[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const generation = useRef(0);
  const loadedCount = useRef(60);
  const inFlight = useRef(false);
  const load = useCallback(async (before?: string, background = false) => {
    if (background && inFlight.current) return;
    inFlight.current = true;
    const run = ++generation.current;
    if (!background) setLoading(true);
    try {
      const response = await fetch(`/api/public/marketplace?scope=${scope}&${filterQuery}&limit=${before ? Math.min(60, 1000 - loadedCount.current) : loadedCount.current}${before ? `&before=${encodeURIComponent(before)}` : ""}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error("UNAVAILABLE");
      if (run !== generation.current) return;
      setItems((current) => before ? [...new Map([...current, ...payload.data.items].map((item) => [`${item.kind}:${item.id}`, item])).values()] : payload.data.items);
      loadedCount.current = Math.min(1000, before ? loadedCount.current + payload.data.items.length : Math.max(60, payload.data.items.length));
      setNext(loadedCount.current < 1000 ? payload.data.nextCursor : null); setError(false);
    } catch { if (run === generation.current) setError(true); }
    finally { if (run === generation.current) { setLoading(false); inFlight.current = false; } }
  }, [filterQuery, scope]);
  useEffect(() => {
    if (privateSection) return;
    loadedCount.current = 60; setItems([]); setNext(null);
    void load(); const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(undefined, true); }, 20_000);
    return () => { window.clearInterval(timer); generation.current += 1; };
  }, [load, privateSection]);
  return <div className="space-y-6">
    <header className="rounded-3xl border bg-card p-6 md:p-8"><p className="text-xs font-bold uppercase tracking-[.2em] text-primary">{labels.marketplace}</p><h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">{section.id === "overview" ? labels.liveListings : labels[section.id]}</h1><p className="mt-3 max-w-3xl leading-7 text-muted">{guestSectionDescription(locale, section.id)}</p>
      {!privateSection ? <CatalogFilters value={filters} onApply={(value) => router.replace(`/explore?section=${section.id}&${marketplaceFilterParams(value)}`, { scroll: false })} /> : null}
      {section.id === "vehicles" ? <Link href="/explore?section=share-vehicle" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground">{labels["share-vehicle"]}<ArrowRight size={18} /></Link> : null}
    </header>
    {privateSection ? <section className="rounded-3xl border bg-card px-6 py-12 text-center"><LockKeyhole className="mx-auto size-9 text-primary" /><h2 className="mt-4 text-xl font-semibold">{guest.continueAccount}</h2><p className="mx-auto mt-3 max-w-xl leading-7 text-muted">{guestSectionDescription(locale, section.id)}</p><AccessLinks locale={locale} /><Link href="/explore" className="mt-5 inline-block text-sm font-semibold text-primary">{labels.liveListings}</Link></section> : <>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted">{guest.contactRequired}</p><button onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm"><RefreshCw size={16} />{labels.refresh}</button></div>
      {error ? <p role="alert" className="rounded-2xl border p-5">{copy.loadError}</p> : null}
      {loading && !items.length ? <div role="status" className="grid min-h-60 place-items-center"><LoaderCircle className="size-8 animate-spin text-primary" /><span className="sr-only">{copy.loading}</span></div> : null}
      {!loading && !error && !items.length ? <p className="rounded-3xl border bg-card p-12 text-center text-muted">{guest.empty}</p> : null}
      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label={copy.title}>{items.map((listing) => <LiveListingCard key={`${listing.kind}:${listing.id}`} listing={{ ...listing, href: `${listing.href}?returnTo=${encodeURIComponent(`/explore?section=${section.id}&${filterQuery}`)}` }} copy={copy} locale={locale} />)}</section>
      {next ? <button disabled={loading} onClick={() => void load(next)} className="mx-auto block min-h-12 rounded-xl border bg-card px-6 font-semibold disabled:opacity-50">{guest.more}</button> : null}
    </>}
  </div>;
}
function AccessLinks({ locale }: { locale: string }) { const guest = guestMarketplaceCopy(locale); const labels = guestMarketplaceLabels(locale).labels; return <div className="mt-6 flex flex-wrap justify-center gap-3"><Link href="/register" className="min-h-12 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">{guest.registerTrial}</Link><Link href="/login" className="min-h-12 rounded-xl border px-5 py-3 font-semibold">{labels.login}</Link></div>; }
