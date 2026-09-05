import { localizeListingSummary } from "../../../shared/localize-listing-summary";
import Link from "next/link";
import { ArrowRight, Building2, CalendarClock, ChevronRight, MapPin, Scale, Truck } from "lucide-react";

import type { MarketplaceCopy } from "@/components/marketplace/copy";
import type { WebMarketplaceListing } from "@/components/marketplace/types";

export function LiveListingCard({
  listing,
  copy,
  locale,
}: {
  listing: WebMarketplaceListing;
  copy: MarketplaceCopy;
  locale: string;
}) {
  listing = localizeListingSummary(listing, locale);
  const isDriver = listing.kind === "DRIVER";
  const published = formatRelativeTime(listing.publishedAt, locale);
  return (
    <article className="group relative flex min-h-[310px] flex-col rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg motion-reduce:transform-none">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-semibold text-accent-foreground">
          <Building2 aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{listing.publicAdvertiserName}</span>
        </span>
        <time className="shrink-0 text-xs text-muted" dateTime={listing.publishedAt}>{published}</time>
      </div>

      {listing.match ? (
        <p className="mt-4 rounded-xl bg-success-soft px-3 py-2 text-xs font-semibold text-success-foreground">
          {copy.matched}
        </p>
      ) : null}

      <div className="mt-4">
        <h2 className="text-xl font-semibold leading-snug tracking-tight">
          <Link href={listing.href} className="rounded-sm outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-primary">
            {listing.publicTitle}
          </Link>
        </h2>
        {listing.publicDescription ? (
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">{listing.publicDescription}</p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2" aria-label={copy.listingFeaturesAria}>
        {listing.vehicleDisplayName ? <Metadata icon={Truck} value={listing.vehicleDisplayName} /> : null}
        {listing.tonnageDisplay ? <Metadata icon={Scale} value={listing.tonnageDisplay} accessibleValue={listing.tonnageAccessibilityLabel} /> : null}
        {listing.vehicleCountDisplay ? <Metadata icon={Truck} value={listing.vehicleCountDisplay} /> : null}
        {listing.relevantDate ? <Metadata icon={CalendarClock} value={formatDate(listing.relevantDate, locale)} /> : null}
      </div>

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border bg-muted-background/65 p-3">
        <Location label={isDriver ? copy.locationLabel : copy.loadingLabel} value={listing.loadingDisplayName} />
        {!isDriver ? <ArrowRight aria-hidden className="size-4 text-primary" /> : <span aria-hidden />}
        {!isDriver ? <Location label={copy.deliveryLabel} value={listing.deliveryDisplayName} align="end" /> : <span />}
      </div>

      <div className="mt-auto flex justify-end pt-5">
        <Link href={listing.href} className="relative z-10 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-95">
          {copy.detail}<ChevronRight aria-hidden className="size-4" />
        </Link>
      </div>
    </article>
  );
}

function Metadata({ icon: Icon, value, accessibleValue }: { icon: typeof Truck; value: string; accessibleValue?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium" aria-label={accessibleValue ?? value}>
      <Icon aria-hidden className="size-3.5 text-primary" />{value}
    </span>
  );
}

function Location({ label, value, align = "start" }: { label: string; value: string | null; align?: "start" | "end" }) {
  return (
    <div className={align === "end" ? "min-w-0 text-end" : "min-w-0"}>
      <p className="text-[10px] font-semibold tracking-[.16em] text-muted">{label}</p>
      <p className={`mt-1 flex items-center gap-1.5 text-sm font-semibold ${align === "end" ? "justify-end" : ""}`}>
        <MapPin aria-hidden className="size-3.5 shrink-0 text-primary" />
        <span className="truncate">{value ?? "—"}</span>
      </p>
    </div>
  );
}

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, locale === "uz" ? { day: "2-digit", month: "2-digit", year: "numeric" } : { dateStyle: "medium" }).format(date);
}

function formatRelativeTime(value: string, locale: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const seconds = Math.round((timestamp - Date.now()) / 1_000);
  const absolute = Math.abs(seconds);
  const [amount, unit] = absolute < 60
    ? [seconds, "second" as const]
    : absolute < 3_600
      ? [Math.round(seconds / 60), "minute" as const]
      : absolute < 86_400
        ? [Math.round(seconds / 3_600), "hour" as const]
        : [Math.round(seconds / 86_400), "day" as const];
  if (locale === "uz") {
    if (absolute < 10) return "hozir";
    const units = { second: "soniya", minute: "daqiqa", hour: "soat", day: "kun" };
    return `${Math.abs(amount)} ${units[unit]} ${amount > 0 ? "keyin" : "oldin"}`;
  }
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(amount, unit);
}
