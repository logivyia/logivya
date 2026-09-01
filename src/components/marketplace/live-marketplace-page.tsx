"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BellRing, LoaderCircle, Radio, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { marketplaceCopy } from "@/components/marketplace/copy";
import { LiveListingCard } from "@/components/marketplace/live-listing-card";
import type { WebMarketplaceEvent, WebMarketplaceKind, WebMarketplaceListing } from "@/components/marketplace/types";
import { useI18n } from "@/i18n/provider";

const scopes = ["GLOBAL", "HOME_MOVING", "PARTIAL_LOAD", "HEAVY_HAUL"] as const;
const kinds: Array<"ALL" | WebMarketplaceKind> = ["ALL", "LOAD", "VEHICLE", "DRIVER"];

export function LiveMarketplacePage() {
  const { locale } = useI18n();
  const copy = marketplaceCopy(locale);
  const searchParams = useSearchParams();
  const requestedScope = searchParams.get("scope");
  const scope = scopes.includes(requestedScope as (typeof scopes)[number])
    ? requestedScope as (typeof scopes)[number]
    : "GLOBAL";
  const [listings, setListings] = useState<WebMarketplaceListing[]>([]);
  const [kind, setKind] = useState<"ALL" | WebMarketplaceKind>("ALL");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  const applyEvents = useCallback((events: WebMarketplaceEvent[], replace = false) => {
    setListings((current) => {
      const next = new Map((replace ? [] : current).map((item) => [`${item.kind}:${item.id}`, item]));
      for (const item of events) {
        const key = `${item.listing.kind}:${item.listing.id}`;
        if (item.event === "listing.deleted" || item.event === "listing.expired" || item.listing.status !== "ACTIVE") {
          next.delete(key);
          continue;
        }
        const previous = next.get(key);
        const match = item.match ?? previous?.match ?? null;
        next.set(key, {
          ...item.listing,
          href: item.match || !previous?.match ? item.listing.href : previous.href,
          match,
        });
      }
      return [...next.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setConnected(false);
    try {
      const response = await fetch(`/api/marketplace/listings/live?scope=${encodeURIComponent(scope)}&limit=100`, {
        cache: "no-store",
      });
      const payload = await response.json() as { events?: WebMarketplaceEvent[]; cursor?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "LOAD_FAILED");
      applyEvents(payload.events ?? [], true);
      setCursor(payload.cursor ?? new Date().toISOString());
    } catch {
      setError(copy.loadError);
    } finally {
      setLoading(false);
    }
  }, [applyEvents, copy.loadError, scope]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!cursor || error) return;
    const source = new EventSource(`/api/marketplace/listings/live?stream=1&scope=${encodeURIComponent(scope)}&after=${encodeURIComponent(cursor)}&limit=100`);
    const onReady = () => setConnected(true);
    const onMarketplace = (event: MessageEvent<string>) => {
      try {
        const item = JSON.parse(event.data) as WebMarketplaceEvent;
        applyEvents([item]);
        setConnected(true);
      } catch {
        // Ignore malformed events without disturbing the current feed.
      }
    };
    source.addEventListener("ready", onReady);
    source.addEventListener("marketplace", onMarketplace as EventListener);
    source.onerror = () => setConnected(false);
    return () => {
      source.removeEventListener("ready", onReady);
      source.removeEventListener("marketplace", onMarketplace as EventListener);
      source.close();
    };
  }, [applyEvents, cursor, error, scope]);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    return listings.filter((listing) => {
      if (kind !== "ALL" && listing.kind !== kind) return false;
      if (!normalizedQuery) return true;
      return [
        listing.publicTitle,
        listing.publicDescription,
        listing.publicAdvertiserName,
        listing.loadingDisplayName,
        listing.deliveryDisplayName,
        listing.vehicleDisplayName,
        listing.tonnageDisplay,
      ].some((value) => value?.toLocaleLowerCase(locale).includes(normalizedQuery));
    });
  }, [kind, listings, locale, query]);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border bg-card p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{copy.eyebrow}</p>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${connected ? "bg-success-soft text-success-foreground" : "bg-warning-soft text-warning-foreground"}`}>
                <Radio aria-hidden className={`size-3.5 ${connected ? "animate-pulse motion-reduce:animate-none" : ""}`} />
                {connected ? copy.live : copy.reconnecting}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">{copy.title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted md:text-base">{copy.subtitle}</p>
          </div>
          <Link href="/marketplace/requests" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:brightness-95">
            <BellRing aria-hidden className="size-4" />{copy.requests}
          </Link>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto]">
          <label className="flex min-h-12 items-center gap-3 rounded-xl border bg-background px-4">
            <Search aria-hidden className="size-4 text-muted" />
            <span className="sr-only">{copy.search}</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full border-0 bg-transparent text-sm outline-none" placeholder={copy.search} />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label={copy.requestKind}>
            {kinds.map((value) => (
              <button key={value} type="button" onClick={() => setKind(value)} aria-pressed={kind === value} className={`min-h-12 shrink-0 rounded-xl border px-4 text-sm font-semibold ${kind === value ? "border-primary bg-primary-soft text-accent-foreground" : "bg-card hover:bg-muted-background"}`}>
                {kindLabel(value, copy)}
              </button>
            ))}
          </div>
        </div>

        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label={copy.sector}>
          <SlidersHorizontal aria-hidden className="mt-3 size-4 shrink-0 text-muted" />
          {scopes.map((value) => (
            <Link key={value} href={value === "GLOBAL" ? "/marketplace" : `/marketplace?scope=${value}`} aria-current={scope === value ? "page" : undefined} className={`inline-flex min-h-10 shrink-0 items-center rounded-lg px-3 text-xs font-semibold ${scope === value ? "bg-secondary text-secondary-foreground" : "text-muted hover:bg-muted-background"}`}>
              {scopeLabel(value, copy)}
            </Link>
          ))}
        </nav>
      </header>

      {loading ? (
        <div className="grid min-h-72 place-items-center rounded-2xl border bg-card" role="status">
          <div className="text-center"><LoaderCircle aria-hidden className="mx-auto size-7 animate-spin text-primary" /><p className="mt-3 text-sm text-muted">{copy.loading}</p></div>
        </div>
      ) : null}
      {!loading && error ? (
        <div className="grid min-h-64 place-items-center rounded-2xl border bg-card p-6 text-center" role="alert">
          <div><p className="font-semibold">{error}</p><button type="button" onClick={() => void load()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"><RefreshCw aria-hidden className="size-4" />{copy.retry}</button></div>
        </div>
      ) : null}
      {!loading && !error && !visible.length ? (
        <div className="grid min-h-64 place-items-center rounded-2xl border bg-card p-8 text-center"><p className="text-sm text-muted">{copy.empty}</p></div>
      ) : null}
      {!loading && !error && visible.length ? (
        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-live="polite" aria-label={copy.title}>
          {visible.map((listing) => <LiveListingCard key={`${listing.kind}:${listing.id}`} listing={listing} copy={copy} locale={locale} />)}
        </section>
      ) : null}
    </div>
  );
}

function kindLabel(kind: "ALL" | WebMarketplaceKind, copy: ReturnType<typeof marketplaceCopy>) {
  if (kind === "LOAD") return copy.loads;
  if (kind === "VEHICLE") return copy.vehicles;
  if (kind === "DRIVER") return copy.drivers;
  return copy.all;
}

function scopeLabel(scope: (typeof scopes)[number], copy: ReturnType<typeof marketplaceCopy>) {
  if (scope === "HOME_MOVING") return copy.homeMoving;
  if (scope === "PARTIAL_LOAD") return copy.partialLoad;
  if (scope === "HEAVY_HAUL") return copy.heavyHaul;
  return copy.global;
}
