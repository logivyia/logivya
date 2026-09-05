"use client";

import Link from "next/link";
import { ArrowLeft, BellRing, CalendarDays, CheckCircle2, ChevronRight, LoaderCircle, MapPin, Plus, SearchCheck } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { marketplaceCopy } from "@/components/marketplace/copy";
import type { WebDemandRequest, WebMarketplaceKind, WebMarketplaceNotification } from "@/components/marketplace/types";
import { useI18n } from "@/i18n/provider";

type DemandForm = {
  kind: WebMarketplaceKind;
  title: string;
  origin: string;
  destination: string;
  location: string;
  availableFrom: string;
  availableUntil: string;
  trailerType: string;
  minWeight: string;
  maxWeight: string;
  primarySector: "GENERAL_LOGISTICS" | "HOME_MOVING" | "PARTIAL_LOAD" | "HEAVY_HAUL";
  notificationsEnabled: boolean;
  expiresInDays: string;
};

const initialForm: DemandForm = {
  kind: "LOAD",
  title: "",
  origin: "",
  destination: "",
  location: "",
  availableFrom: "",
  availableUntil: "",
  trailerType: "",
  minWeight: "",
  maxWeight: "",
  primarySector: "GENERAL_LOGISTICS",
  notificationsEnabled: true,
  expiresInDays: "30",
};

const trailerOptions = [
  ["CURTAINSIDER", "Tenteli"],
  ["OPEN_TRAILER", "Açık Kasa"],
  ["CLOSED_TRAILER", "Kapalı Kasa"],
  ["REFRIGERATED", "Frigo"],
  ["CONTAINER", "Konteyner"],
  ["LOWBED", "Lowbed"],
  ["TRUCK", "Kamyon"],
  ["VAN", "Panelvan"],
] as const;

export function SavedDemandsPage() {
  const { locale } = useI18n();
  const copy = marketplaceCopy(locale);
  const [requests, setRequests] = useState<WebDemandRequest[]>([]);
  const [notifications, setNotifications] = useState<WebMarketplaceNotification[]>([]);
  const [form, setForm] = useState<DemandForm>(initialForm);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [requestsResponse, notificationsResponse] = await Promise.all([
        fetch("/api/marketplace/requests?limit=50", { cache: "no-store" }),
        fetch("/api/marketplace/notifications?limit=30", { cache: "no-store" }),
      ]);
      const [requestsBody, notificationsBody] = await Promise.all([
        requestsResponse.json() as Promise<{ requests?: WebDemandRequest[] }>,
        notificationsResponse.json() as Promise<{ notifications?: WebMarketplaceNotification[] }>,
      ]);
      if (!requestsResponse.ok || !notificationsResponse.ok) throw new Error("LOAD_FAILED");
      setRequests(requestsBody.requests ?? []);
      setNotifications(notificationsBody.notifications ?? []);
    } catch {
      setError(copy.loadError);
    } finally {
      setLoading(false);
    }
  }, [copy.loadError]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const body: Record<string, unknown> = {
      kind: form.kind,
      title: form.title,
      primarySector: form.primarySector,
      keywords: [],
      licenseClasses: [],
      notificationsEnabled: form.notificationsEnabled,
      internationalRequired: false,
      adrRequired: false,
      expiresInDays: Number(form.expiresInDays),
      clientRequestId: crypto.randomUUID(),
    };
    if (form.kind === "DRIVER") {
      body.location = form.location;
    } else {
      if (form.origin) body.origin = form.origin;
      if (form.destination) body.destination = form.destination;
      if (form.trailerType) body.trailerType = form.trailerType;
      if (form.minWeight) body.minWeight = Number(form.minWeight);
      if (form.maxWeight) body.maxWeight = Number(form.maxWeight);
    }
    if (form.availableFrom) body.availableFrom = form.availableFrom;
    if (form.availableUntil) body.availableUntil = form.availableUntil;
    try {
      const response = await fetch("/api/marketplace/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("SAVE_FAILED");
      setForm(initialForm);
      setFormOpen(false);
      setMessage(copy.saved);
      await load();
    } catch {
      setError(copy.formError);
    } finally {
      setSaving(false);
    }
  }

  async function markRead(notification: WebMarketplaceNotification) {
    if (!notification.isRead) {
      await fetch(`/api/notifications/${encodeURIComponent(notification.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read" }),
      }).catch(() => undefined);
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, isRead: true } : item));
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border bg-card p-5 shadow-sm md:p-7">
        <Link href="/marketplace" className="inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-semibold text-muted hover:text-foreground"><ArrowLeft aria-hidden className="size-4" />{copy.backToListings}</Link>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{copy.matchingEyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{copy.requestsTitle}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{copy.requestsSubtitle}</p></div>
          <button type="button" onClick={() => setFormOpen((value) => !value)} aria-expanded={formOpen} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"><Plus aria-hidden className="size-4" />{copy.createRequest}</button>
        </div>
      </header>

      {message ? <div className="flex items-center gap-3 rounded-2xl border border-success/25 bg-success-soft p-4 text-sm font-semibold text-success-foreground" role="status"><CheckCircle2 aria-hidden className="size-5" />{message}</div> : null}
      {error ? <div className="rounded-2xl border border-danger/25 bg-danger-soft p-4 text-sm font-semibold text-danger-foreground" role="alert">{error}</div> : null}

      {formOpen ? (
        <form onSubmit={submit} className="rounded-3xl border bg-card p-5 shadow-sm md:p-7">
          <h2 className="text-xl font-semibold">{copy.createRequest}</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label={copy.requestKind}><select required value={form.kind} onChange={(event) => setForm((value) => ({ ...value, kind: event.target.value as WebMarketplaceKind }))} className="min-h-12 w-full rounded-xl border px-3 text-sm"><option value="LOAD">{copy.loadKind}</option><option value="VEHICLE">{copy.vehicleKind}</option><option value="DRIVER">{copy.driverKind}</option></select></Field>
            <Field label={copy.requestTitle} wide><input required minLength={3} maxLength={140} value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm" placeholder={copy.requestTitlePlaceholder} /></Field>
            <Field label={copy.sector}><select value={form.primarySector} onChange={(event) => setForm((value) => ({ ...value, primarySector: event.target.value as DemandForm["primarySector"] }))} className="min-h-12 w-full rounded-xl border px-3 text-sm"><option value="GENERAL_LOGISTICS">{copy.global}</option><option value="HOME_MOVING">{copy.homeMoving}</option><option value="PARTIAL_LOAD">{copy.partialLoad}</option><option value="HEAVY_HAUL">{copy.heavyHaul}</option></select></Field>
            {form.kind === "DRIVER" ? <Field label={copy.location} wide><input required minLength={2} maxLength={160} value={form.location} onChange={(event) => setForm((value) => ({ ...value, location: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm" /></Field> : <><Field label={copy.origin}><input minLength={2} maxLength={160} required={!form.destination} value={form.origin} onChange={(event) => setForm((value) => ({ ...value, origin: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm" /></Field><Field label={copy.destination}><input minLength={2} maxLength={160} required={!form.origin} value={form.destination} onChange={(event) => setForm((value) => ({ ...value, destination: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm" /></Field><Field label={copy.trailer}><select value={form.trailerType} onChange={(event) => setForm((value) => ({ ...value, trailerType: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm"><option value="">{copy.anyTrailer}</option>{trailerOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label={copy.minWeight}><input type="number" inputMode="decimal" min="0.1" max="200" step="0.1" value={form.minWeight} onChange={(event) => setForm((value) => ({ ...value, minWeight: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm" /></Field><Field label={copy.maxWeight}><input type="number" inputMode="decimal" min="0.1" max="200" step="0.1" value={form.maxWeight} onChange={(event) => setForm((value) => ({ ...value, maxWeight: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm" /></Field></>}
            <Field label={copy.availableFrom}><input type="date" value={form.availableFrom} onChange={(event) => setForm((value) => ({ ...value, availableFrom: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm" /></Field>
            <Field label={copy.availableUntilForm}><input type="date" min={form.availableFrom || undefined} value={form.availableUntil} onChange={(event) => setForm((value) => ({ ...value, availableUntil: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm" /></Field>
            <Field label={copy.duration}><select value={form.expiresInDays} onChange={(event) => setForm((value) => ({ ...value, expiresInDays: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm"><option value="30">{copy.days30}</option><option value="60">{copy.days60}</option><option value="90">{copy.days90}</option></select></Field>
          </div>
          <label className="mt-5 flex min-h-12 items-center gap-3 rounded-xl border bg-muted-background/45 px-4 text-sm"><input type="checkbox" checked={form.notificationsEnabled} onChange={(event) => setForm((value) => ({ ...value, notificationsEnabled: event.target.checked }))} className="size-4 accent-primary" />{copy.notifications}</label>
          <div className="mt-5 flex justify-end"><button disabled={saving} type="submit" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <SearchCheck aria-hidden className="size-4" />}{saving ? copy.saving : copy.save}</button></div>
        </form>
      ) : null}

      <section className="rounded-3xl border bg-card p-5 shadow-sm md:p-7" aria-labelledby="match-notifications-title">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"><BellRing aria-hidden className="size-5" /></span><h2 id="match-notifications-title" className="text-xl font-semibold">{copy.notificationsTitle}</h2></div>
        <div className="mt-5 divide-y">
          {!notifications.length && !loading ? <p className="py-8 text-center text-sm text-muted">{copy.noNotifications}</p> : null}
          {notifications.map((notification) => (
            <article key={notification.id} className="flex gap-3 py-4">
              <span className={`mt-2 size-2 shrink-0 rounded-full ${notification.isRead ? "bg-muted/30" : "bg-primary"}`} />
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{notification.title}</h3><time className="text-xs text-muted" dateTime={notification.createdAt}>{formatDateTime(notification.createdAt, locale)}</time></div><p className="mt-1 text-sm leading-6 text-muted">{notification.message}</p>{notification.href ? <Link href={notification.href} onClick={() => void markRead(notification)} className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-lg bg-primary-soft px-3 text-xs font-semibold text-accent-foreground">{copy.openMatch}<ChevronRight aria-hidden className="size-3.5" /></Link> : null}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-5 shadow-sm md:p-7" aria-labelledby="saved-demands-title">
        <h2 id="saved-demands-title" className="text-xl font-semibold">{copy.requestsTitle}</h2>
        {loading ? <div className="grid min-h-40 place-items-center" role="status"><LoaderCircle aria-hidden className="size-6 animate-spin text-primary" /></div> : null}
        {!loading && !requests.length ? <p className="py-10 text-center text-sm text-muted">{copy.noRequests}</p> : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {requests.map((request) => (
            <article key={request.id} className="rounded-2xl border bg-background p-4">
              <div className="flex items-start justify-between gap-3"><span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-accent-foreground">{kindLabel(request.kind, copy)}</span><span className="text-xs font-semibold text-muted">{statusLabel(request.status, copy)}</span></div>
              <h3 className="mt-4 text-lg font-semibold">{request.title}</h3>
              <div className="mt-3 space-y-2 text-sm text-muted">{request.kind === "DRIVER" ? <p className="flex items-center gap-2"><MapPin aria-hidden className="size-4 text-primary" />{request.location ?? "—"}</p> : <p className="flex items-center gap-2"><MapPin aria-hidden className="size-4 text-primary" />{[request.origin, request.destination].filter(Boolean).join(" → ") || "—"}</p>}<p className="flex items-center gap-2"><CalendarDays aria-hidden className="size-4 text-primary" />{copy.expires}: {formatDate(request.expiresAt, locale)}</p></div>
              <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs"><span className="font-semibold text-primary">{request.matchCount} {copy.matches}</span><span className="text-muted">{request.notificationsEnabled ? "🔔" : "—"}</span></div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "block md:col-span-2" : "block"}><span className="mb-2 block text-xs font-semibold text-muted">{label}</span>{children}</label>;
}

function kindLabel(kind: WebMarketplaceKind, copy: ReturnType<typeof marketplaceCopy>) {
  return kind === "LOAD" ? copy.loads : kind === "VEHICLE" ? copy.vehicles : copy.drivers;
}

function statusLabel(status: string, copy: ReturnType<typeof marketplaceCopy>) {
  if (status === "ACTIVE") return copy.active;
  if (status === "PAUSED") return copy.paused;
  if (status === "FULFILLED") return copy.fulfilled;
  return copy.expired;
}

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

function formatDateTime(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
