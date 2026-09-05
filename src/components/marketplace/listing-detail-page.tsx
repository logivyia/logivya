"use client";
import { localizeListingSummary } from "../../../shared/localize-listing-summary";
import { WhatsAppIcon } from "@/components/whatsapp-icon";

import Link from "next/link";
import { authHref, safeAuthReturn, SUBSCRIPTION_HREF } from "@/lib/auth-return";
import { productJourneyCopy } from "../../../shared/product-journey-copy";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Building2, CheckCircle2, ExternalLink, Flag, LoaderCircle, MapPin, MessageCircle, Phone, Scale, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { marketplaceCopy } from "@/components/marketplace/copy";
import type { WebMarketplaceListingDetail } from "@/components/marketplace/types";
import { useI18n } from "@/i18n/provider";

export function ListingDetailPage({ kind, id, requestId, guest = false }: { kind: string; id: string; requestId?: string; guest?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useI18n();
  const copy = marketplaceCopy(locale);
  const text = productJourneyCopy(locale);
  const rememberedList = safeAuthReturn(searchParams.get("returnTo"), guest ? "/explore" : "/marketplace");
  const authenticatedDetail = `/marketplace/listings/${encodeURIComponent(kind)}/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(rememberedList)}`;
  const [rawListing, setListing] = useState<WebMarketplaceListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const query = requestId ? `?requestId=${encodeURIComponent(requestId)}` : "";

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const stateTimer = window.setTimeout(() => {
      if (!active) return;
      setLoading(true);
      setError("");
      setListing(null);
    }, 0);
    void fetch(guest ? `/api/public/marketplace?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}` : `/api/marketplace/listings/${encodeURIComponent(kind)}/${encodeURIComponent(id)}${query}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) })
      .then(async (response) => {
        window.clearTimeout(stateTimer);
        const payload = await response.json();
        const body = (guest ? payload.data ?? {} : payload) as { listing?: WebMarketplaceListingDetail; error?: string };
        if (!response.ok || !body.listing) throw new Error(body.error ?? "NOT_FOUND");
        if (active) setListing(body.listing);
      })
      .catch((fetchError: unknown) => { if (active && !(fetchError instanceof DOMException && fetchError.name === "AbortError")) setError(copy.detailNotFound); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; window.clearTimeout(stateTimer); controller.abort(); };
  }, [copy.detailNotFound, guest, id, kind, query]);

  const listing = rawListing ? localizeListingSummary(rawListing, locale) : null;
  const detailRows = useMemo(() => listing ? buildDetailRows(listing, copy, locale) : [], [copy, listing, locale]);

  if (loading) {
    return <div className="grid min-h-[60vh] place-items-center rounded-3xl border bg-card" role="status"><div className="text-center"><LoaderCircle aria-hidden className="mx-auto size-8 animate-spin text-primary" /><p className="mt-3 text-sm text-muted">{copy.detailLoading}</p></div></div>;
  }
  if (error || !listing) {
    return <div className="grid min-h-[55vh] place-items-center rounded-3xl border bg-card p-8 text-center" role="alert"><div><AlertTriangle aria-hidden className="mx-auto size-9 text-warning" /><p className="mt-4 font-semibold">{error || copy.detailNotFound}</p><Link href="/marketplace" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"><ArrowLeft aria-hidden className="size-4" />{copy.backToListings}</Link></div></div>;
  }

  const requestedReturn = searchParams.get("returnTo");
  const backHref = requestedReturn ? rememberedList : listing.requestId ? `/marketplace/requests/${encodeURIComponent(listing.requestId)}/matches` : guest ? "/explore" : "/marketplace";
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <button onClick={() => router.push(backHref)} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-muted-background hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />{listing.requestId ? copy.backToRequests : copy.backToListings}
      </button>

      {listing.requestId ? (
        <div className="flex items-center gap-3 rounded-2xl border border-success/25 bg-success-soft p-4 text-sm font-semibold text-success-foreground">
          <CheckCircle2 aria-hidden className="size-5 shrink-0" />{copy.matched}
        </div>
      ) : null}
      {!listing.isActive ? (
        <div className="rounded-2xl border border-warning/30 bg-warning-soft p-4 text-warning-foreground" role="status">
          <p className="font-semibold">{copy.listingUnavailable}</p><p className="mt-1 text-sm">{copy.listingUnavailableText}</p>
        </div>
      ) : null}

      <article className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <header className="border-b bg-gradient-to-br from-primary-soft via-card to-card p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-sm font-semibold"><Building2 aria-hidden className="size-4 text-primary" />{listing.publicAdvertiserName}</span>
            {listing.publishedAt ? <time className="text-xs text-muted" dateTime={listing.publishedAt}>{formatDateTime(listing.publishedAt, locale)}</time> : null}
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">{listing.publicTitle}</h1>
          {listing.publicDescription ? <p className="mt-4 max-w-3xl text-sm leading-7 text-muted md:text-base">{listing.publicDescription}</p> : null}
          <div className="mt-5 flex flex-wrap gap-2">
            {listing.vehicleDisplayName ? <Pill icon={Truck} label={listing.vehicleDisplayName} /> : null}
            {listing.tonnageDisplay ? <Pill icon={Scale} label={listing.tonnageDisplay} accessibleLabel={listing.tonnageAccessibilityLabel} /> : null}
            {listing.vehicleCountDisplay ? <Pill icon={Truck} label={listing.vehicleCountDisplay} /> : null}
          </div>
        </header>

        <div className="grid gap-6 p-6 md:p-8 lg:grid-cols-[1fr_300px]">
          <div className="space-y-6">
            {(listing.loadingDisplayName || listing.deliveryDisplayName) ? (
              <section className="grid gap-3 sm:grid-cols-2" aria-label={copy.routeAria}>
                <RouteBlock label={listing.kind === "DRIVER" ? copy.locationLabel : copy.loadingLabel} value={listing.loadingDisplayName} />
                {listing.kind !== "DRIVER" ? <RouteBlock label={copy.deliveryLabel} value={listing.deliveryDisplayName} /> : null}
              </section>
            ) : null}
            <dl className="grid gap-x-8 sm:grid-cols-2">
              {detailRows.map((row) => <DetailRow key={row.label} label={row.label} value={row.value} />)}
              <DetailRow label={copy.advertiser} value={listing.publicAdvertiserName} />
              <DetailRow label={copy.source} value={listing.sourcePlatformDisplay} />
              {listing.publishedAt ? <DetailRow label={copy.published} value={formatDateTime(listing.publishedAt, locale)} /> : null}
            </dl>
          </div>

          <aside className="h-fit rounded-2xl border bg-muted-background/55 p-4">
            <h2 className="font-semibold">{copy.advertiser}</h2>
            <p className="mt-1 text-sm text-muted">{listing.publicAdvertiserName}</p>
            {listing.contact ? (
              <div className="mt-5 grid gap-3">
                <a href={listing.contact.telHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border bg-card px-4 text-sm font-semibold hover:border-primary/40"><Phone aria-hidden className="size-4 text-primary" />{copy.call}</a>
                <a href={listing.contact.whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95"><WhatsAppIcon aria-hidden className="size-4" />{copy.whatsapp}<ExternalLink aria-hidden className="size-3.5" /></a>
              </div>
            ) : guest || listing.contactAccess === "SUBSCRIPTION_REQUIRED" ? <div className="mt-4 space-y-3"><p className="text-sm leading-6 text-muted">{text.contactRequired}</p><Link href={guest ? authHref("register", authenticatedDetail) : SUBSCRIPTION_HREF} className="flex min-h-12 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">{guest ? text.registerTrial : text.subscribe}</Link>{guest ? <Link href={authHref("login", authenticatedDetail)} className="block py-2 text-center text-sm font-semibold text-primary">{text.login}</Link> : null}</div> : <p className="mt-4 text-sm leading-6 text-muted">{copy.contactMissing}</p>}
            <a href={`mailto:support@logivya.com?subject=${encodeURIComponent(`İlan bildirimi: ${listing.id}`)}`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold text-muted hover:bg-card hover:text-foreground"><Flag aria-hidden className="size-3.5" />{copy.report}</a>
          </aside>
        </div>
      </article>
    </div>
  );
}

function buildDetailRows(listing: WebMarketplaceListingDetail, copy: ReturnType<typeof marketplaceCopy>, locale: string) {
  const attributes = listing.attributes;
  const rows: Array<{ label: string; value: string | null }> = [
    { label: copy.vehicle, value: listing.vehicleDisplayName },
    { label: copy.tonnage, value: listing.tonnageDisplay },
    { label: copy.vehicleCount, value: listing.vehicleCountDisplay },
    { label: copy.loadingDate, value: attributes.relevantDate ? formatDate(attributes.relevantDate, locale) : null },
    { label: copy.availableUntil, value: attributes.availableUntil ? formatDate(attributes.availableUntil, locale) : null },
    { label: copy.cargo, value: attributes.cargoType },
    { label: copy.price, value: formatMoney(attributes.priceAmount, attributes.currency, locale) },
    { label: copy.customs, value: attributes.customsInfo ?? null },
    { label: copy.container, value: attributes.containerStatusDisplay ?? null },
    { label: copy.international, value: booleanLabel(attributes.internationalTransport, copy) },
    { label: copy.adr, value: booleanLabel(attributes.adrSuitable, copy) },
    { label: copy.preferredRoute, value: attributes.preferredRoute ?? null },
    { label: copy.listingType, value: attributes.listingTypeDisplay ?? null },
    { label: copy.licenses, value: attributes.licenseClasses?.join(", ") || null },
    { label: copy.experience, value: attributes.experienceYears != null ? `${attributes.experienceYears} ${copy.years}` : null },
    { label: copy.employment, value: attributes.employmentTypeDisplay ?? null },
    { label: copy.international, value: booleanLabel(attributes.internationalExperience, copy) },
    { label: copy.adr, value: booleanLabel(attributes.adrCertificate, copy) },
    { label: copy.certificates, value: certificateLabel(attributes, copy) },
  ];
  return rows.filter((row) => row.value);
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <div className="border-b py-4"><dt className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</dt><dd className="mt-1.5 text-sm font-medium">{value}</dd></div>;
}

function RouteBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <div className="rounded-2xl border bg-muted-background/55 p-4"><p className="text-[10px] font-semibold tracking-[.16em] text-muted">{label}</p><p className="mt-2 flex items-center gap-2 font-semibold"><MapPin aria-hidden className="size-4 text-primary" />{value}</p></div>;
}

function Pill({ icon: Icon, label, accessibleLabel }: { icon: typeof Truck; label: string; accessibleLabel?: string | null }) {
  return <span className="inline-flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm font-medium" aria-label={accessibleLabel ?? label}><Icon aria-hidden className="size-4 text-primary" />{label}</span>;
}

function booleanLabel(value: boolean | undefined, copy: ReturnType<typeof marketplaceCopy>) {
  return value === undefined ? null : value ? copy.yes : copy.no;
}

function certificateLabel(attributes: WebMarketplaceListingDetail["attributes"], copy: ReturnType<typeof marketplaceCopy>) {
  const values = [attributes.srcCertificate ? "SRC" : null, attributes.psychotechnicalCertificate ? "Psikoteknik" : null].filter(Boolean);
  return values.length ? values.join(", ") : attributes.srcCertificate === undefined && attributes.psychotechnicalCertificate === undefined ? null : copy.no;
}

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, locale === "uz" ? { day: "2-digit", month: "2-digit", year: "numeric" } : { dateStyle: "long" }).format(date);
}

function formatDateTime(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, locale === "uz" ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false } : { dateStyle: "long", timeStyle: "short" }).format(date);
}

function formatMoney(amount: number | null, currency: string | null, locale: string) {
  if (amount == null || !currency) return null;
  try { return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount); } catch { return `${amount} ${currency}`; }
}
