"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { marketplaceCopy } from "./copy";
import { productJourneyCopy } from "../../../shared/product-journey-copy";
import { SUBSCRIPTION_HREF } from "@/lib/auth-return";

type Match = {
  id: string; score: number; status: string; matchedAt: string; sourcePlatform: string;
  listingKind: string; listingId: string;
  listing: { title: string; detail: string; sourceExcerpt?: string | null; contactPhone?: string | null; canCall?: boolean; canOpenWhatsApp?: boolean; telegramHref?: string | null; whatsappPrefilledMessage?: string | null; contactAccess?: string; date?: string | null };
};

export function DemandMatchesPage({ id }: { id: string }) {
  const { locale } = useI18n();
  const copy = marketplaceCopy(locale);
  const text = productJourneyCopy(locale);
  const [matches, setMatches] = useState<Match[]>([]);
  const [title, setTitle] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const base = `/api/marketplace/requests/${encodeURIComponent(id)}`;

  const load = useCallback(async (next?: string | null, signal?: AbortSignal) => {
    setLoading(true); setError(false);
    try {
      const response = await fetch(`${base}/matches?limit=20${next ? `&cursor=${encodeURIComponent(next)}` : ""}`, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error();
      const body = await response.json() as { matches: Match[]; pageInfo: { nextCursor: string | null } };
      if (signal?.aborted) return;
      setMatches(previous => next ? [...previous, ...body.matches.filter(item => !previous.some(old => old.id === item.id))] : body.matches);
      setCursor(body.pageInfo.nextCursor);
      void fetch(`${base}/matches`, { method: "PATCH" }).catch(() => undefined);
    } catch { if (!signal?.aborted) setError(true); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [base]);

  useEffect(() => {
    const controller = new AbortController();
    void load(null, controller.signal);
    void fetch(base, { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (response.ok) setTitle((await response.json()).request.title);
    }).catch(() => undefined);
    return () => { controller.abort(); };
  }, [base, load]);

  async function change(match: Match, status: "SAVED" | "DISMISSED") {
    setBusy(match.id); setError(false);
    try {
      const response = await fetch(`${base}/matches/${encodeURIComponent(match.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }), signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error();
      setMatches(previous => status === "DISMISSED" ? previous.filter(item => item.id !== match.id) : previous.map(item => item.id === match.id ? { ...item, status } : item));
    } catch { setError(true); }
    finally { setBusy(null); }
  }

  return <div className="mx-auto max-w-4xl space-y-5">
    <Link href="/marketplace/requests" className="inline-flex min-h-11 items-center text-primary">← {copy.requestsTitle}</Link>
    <h1 className="text-3xl font-semibold">{title || text.viewMatches}</h1>
    {error && <div role="alert" className="rounded-xl border border-danger p-4">{copy.loadError} <button className="min-h-11 px-4 text-primary" onClick={() => void load(cursor)}>{text.more}</button></div>}
    {!loading && !error && !matches.length && <p className="rounded-2xl border p-8 text-muted">{text.noMatches}</p>}
    {matches.map(match => {
      const phone = match.listing.contactPhone;
      const digits = phone?.replace(/[^0-9]/g, "");
      const validPhone = Boolean(phone && /^\+?[0-9 ().-]{7,24}$/.test(phone) && digits && digits.length >= 7 && digits.length <= 15);
      const segment = match.listingKind === "VEHICLE" ? "vehicles" : match.listingKind === "DRIVER" ? "drivers" : "loads";
      return <article key={match.id} className="space-y-4 rounded-2xl border bg-card p-5 md:p-7">
        <div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-semibold">{match.listing.title}</h2><span className="rounded-full bg-success-soft px-3 py-1 text-success-foreground">{match.score}%</span></div>
        <p className="text-sm text-muted">{match.sourcePlatform === "WHATSAPP" ? "WhatsApp" : match.sourcePlatform === "TELEGRAM" ? "Telegram" : "Logivya"} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(match.matchedAt))}</p>
        <p className="whitespace-pre-wrap break-words">{match.listing.detail}</p>
        {match.listing.sourceExcerpt && <p className="whitespace-pre-wrap break-words text-sm text-muted">{match.listing.sourceExcerpt}</p>}
        <div className="flex flex-wrap gap-3">
          {match.sourcePlatform === "LOGIVYA" && <Link className="min-h-11 rounded-xl border px-4 py-3" href={`/marketplace/listings/${segment}/${encodeURIComponent(match.listingId)}?requestId=${encodeURIComponent(id)}`}>{copy.detail}</Link>}
          {validPhone && match.listing.canCall && <a className="min-h-11 rounded-xl bg-primary px-4 py-3 text-primary-foreground" href={`tel:+${digits}`}>{text.callAdvertiser}</a>}
          {validPhone && match.listing.canOpenWhatsApp && <a className="min-h-11 rounded-xl border px-4 py-3" href={`https://wa.me/${digits}?text=${encodeURIComponent(match.listing.whatsappPrefilledMessage ?? "")}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          {match.listing.telegramHref && /^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}$/.test(match.listing.telegramHref) && <a className="min-h-11 rounded-xl border px-4 py-3" href={match.listing.telegramHref} target="_blank" rel="noopener noreferrer">Telegram</a>}
          {match.listing.contactAccess === "SUBSCRIPTION_REQUIRED" && <Link href={SUBSCRIPTION_HREF} className="min-h-11 rounded-xl border px-4 py-3">{text.subscribe}</Link>}
          {match.listing.contactAccess === "ALLOWED" && !validPhone && !match.listing.telegramHref && <p className="text-sm text-muted">{text.contactMissing}</p>}
          {match.sourcePlatform !== "LOGIVYA" && <button disabled={busy === match.id || match.status === "SAVED"} onClick={() => void change(match, "SAVED")} className="min-h-11 rounded-xl border px-4 disabled:opacity-50">{match.status === "SAVED" ? text.saved : text.save}</button>}
          <button disabled={busy === match.id} onClick={() => void change(match, "DISMISSED")} className="min-h-11 rounded-xl border px-4 disabled:opacity-50">{text.dismiss}</button>
        </div>
      </article>;
    })}
    {loading && <p role="status" className="p-5">{copy.loading}</p>}
    {cursor && !loading && <button onClick={() => void load(cursor)} className="min-h-12 w-full rounded-xl border font-semibold">{text.more}</button>}
  </div>;
}
