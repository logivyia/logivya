"use client";

import Link from "next/link";
import { marketplaceOptionLabel } from "../../../shared/product-status-copy";
import { productJourneyCopy } from "../../../shared/product-journey-copy";
import { ArrowLeft, BellRing, CalendarDays, CheckCircle2, ChevronRight, LoaderCircle, MapPin, Plus, SearchCheck } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { marketplaceCopy } from "@/components/marketplace/copy";
import type { WebDemandRequest, WebMarketplaceKind, WebMarketplaceNotification } from "@/components/marketplace/types";
import { useI18n } from "@/i18n/provider";

type DemandForm = {
  kind: WebMarketplaceKind;
  driverListingType: string;
  licenseClasses: string[];
  employmentType: string;
  adrRequired: boolean;
  internationalRequired: boolean;
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
  driverListingType: "", licenseClasses: [], employmentType: "", adrRequired: false, internationalRequired: false,
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
  const text = productJourneyCopy(locale);
  const [originalRoute, setOriginalRoute] = useState({ origin: "", destination: "" });
  const [retainedCriteria, setRetainedCriteria] = useState<Record<string, unknown>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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
      ...(editingId ? retainedCriteria : {}),
      kind: form.kind,
      title: form.title,
      primarySector: form.primarySector,
      keywords: editingId ? retainedCriteria.keywords ?? [] : [],
      licenseClasses: form.kind === "DRIVER" ? form.licenseClasses : [],
      notificationsEnabled: form.notificationsEnabled,
      internationalRequired: form.kind !== "LOAD" && form.internationalRequired,
      adrRequired: form.kind !== "LOAD" && form.adrRequired,
      expiresInDays: Number(form.expiresInDays),
      ...(!editingId ? { clientRequestId: crypto.randomUUID() } : {}),
    };
    if (form.kind === "DRIVER") {
      body.location = form.location;
      body.driverListingType = form.driverListingType || null;
      body.employmentType = form.employmentType || null;
    } else {
      body.origin = form.origin || null;
      body.destination = form.destination || null;
      body.trailerType = form.trailerType || null;
      body.minWeight = form.minWeight ? Number(form.minWeight) : null;
      body.maxWeight = form.maxWeight ? Number(form.maxWeight) : null;
    }
    if (editingId && form.kind !== "DRIVER") for (const side of ["origin", "destination"] as const) {
      if (form[side] !== originalRoute[side]) for (const suffix of ["Country", "City", "District"]) body[`${side}${suffix}`] = null;
    }
    body.availableFrom = form.availableFrom || null;
    body.availableUntil = form.availableUntil || null;
    try {
      const response = await fetch(editingId ? `/api/marketplace/requests/${encodeURIComponent(editingId)}` : "/api/marketplace/requests", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error("SAVE_FAILED");
      setForm(initialForm);
      setEditingId(null);
      setFormOpen(false);
      setMessage(copy.saved);
      await load();
    } catch {
      setError(copy.formError);
    } finally {
      setSaving(false);
    }
  }

  async function manage(request: WebDemandRequest, change: Record<string, unknown>) {
    setBusy(request.id); setError("");
    try {
      const response = await fetch(`/api/marketplace/requests/${encodeURIComponent(request.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change), signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error();
      await load();
    } catch { setError(copy.formError); }
    finally { setBusy(null); }
  }

  async function edit(request: WebDemandRequest) {
    setBusy(request.id); setError("");
    try {
      const response = await fetch(`/api/marketplace/requests/${encodeURIComponent(request.id)}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error();
      const { request: item } = await response.json();
      const retained = ["keywords", "sectorCriteria", "originCountry", "originCity", "originDistrict", "destinationCountry", "destinationCity", "destinationDistrict", "vehicleCategory", "vehicleBodyLength", "requiredPlateCountry", "transitRoute", "cargoType"];
      setOriginalRoute({ origin: item.origin || "", destination: item.destination || "" });
      setRetainedCriteria(Object.fromEntries(retained.map(key => [key, item[key] ?? null])));
      setForm({ ...initialForm, ...Object.fromEntries(Object.keys(initialForm).map(key => [key, item[key] ?? initialForm[key as keyof DemandForm]])), minWeight: item.minWeight == null ? "" : String(item.minWeight), maxWeight: item.maxWeight == null ? "" : String(item.maxWeight), availableFrom: item.availableFrom?.slice(0, 10) || "", availableUntil: item.availableUntil?.slice(0, 10) || "", expiresInDays: String(Math.min(180, Math.max(1, Math.ceil((Date.parse(item.expiresAt) - Date.now()) / 86400000)))) });
      setEditingId(request.id); setFormOpen(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch { setError(copy.loadError); }
    finally { setBusy(null); }
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
          <button type="button" onClick={() => { setEditingId(null); setForm(initialForm); setFormOpen(value => !value); }} aria-expanded={formOpen} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"><Plus aria-hidden className="size-4" />{copy.createRequest}</button>
        </div>
      </header>

      {message ? <div className="flex items-center gap-3 rounded-2xl border border-success/25 bg-success-soft p-4 text-sm font-semibold text-success-foreground" role="status"><CheckCircle2 aria-hidden className="size-5" />{message}</div> : null}
      {error ? <div className="rounded-2xl border border-danger/25 bg-danger-soft p-4 text-sm font-semibold text-danger-foreground" role="alert">{error}</div> : null}

      {formOpen ? (
        <form onSubmit={submit} className="rounded-3xl border bg-card p-5 shadow-sm md:p-7">
          <h2 className="text-xl font-semibold">{editingId ? text.edit : copy.createRequest}</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label={copy.requestKind}><select required value={form.kind} disabled={Boolean(editingId)} onChange={(event) => setForm((value) => ({ ...value, kind: event.target.value as WebMarketplaceKind }))} className="min-h-12 w-full rounded-xl border px-3 text-sm"><option value="LOAD">{copy.loadKind}</option><option value="VEHICLE">{copy.vehicleKind}</option><option value="DRIVER">{copy.driverKind}</option></select></Field>
            <Field label={copy.requestTitle} wide><input required minLength={3} maxLength={140} value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm" placeholder={copy.requestTitlePlaceholder} /></Field>
            <Field label={copy.sector}><select value={form.primarySector} onChange={(event) => setForm((value) => ({ ...value, primarySector: event.target.value as DemandForm["primarySector"] }))} className="min-h-12 w-full rounded-xl border px-3 text-sm"><option value="GENERAL_LOGISTICS">{copy.global}</option><option value="HOME_MOVING">{copy.homeMoving}</option><option value="PARTIAL_LOAD">{copy.partialLoad}</option><option value="HEAVY_HAUL">{copy.heavyHaul}</option></select></Field>
            {form.kind === "DRIVER" ? <Field label={copy.location} wide><input required minLength={2} maxLength={160} value={form.location} onChange={(event) => setForm((value) => ({ ...value, location: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm" /></Field> : <><Field label={copy.origin}><input minLength={2} maxLength={160} required={!form.destination} value={form.origin} onChange={(event) => setForm((value) => ({ ...value, origin: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm" /></Field><Field label={copy.destination}><input minLength={2} maxLength={160} required={!form.origin} value={form.destination} onChange={(event) => setForm((value) => ({ ...value, destination: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm" /></Field><Field label={copy.trailer}><select value={form.trailerType} onChange={(event) => setForm((value) => ({ ...value, trailerType: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm"><option value="">{copy.anyTrailer}</option>{trailerOptions.map(([value]) => <option key={value} value={value}>{marketplaceOptionLabel(value, locale)}</option>)}</select></Field><Field label={copy.minWeight}><input type="number" inputMode="decimal" min="0.1" max="200" step="0.1" value={form.minWeight} onChange={(event) => setForm((value) => ({ ...value, minWeight: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm" /></Field><Field label={copy.maxWeight}><input type="number" inputMode="decimal" min="0.1" max="200" step="0.1" value={form.maxWeight} onChange={(event) => setForm((value) => ({ ...value, maxWeight: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm" /></Field></>}
            {form.kind === "DRIVER" && <>
              <Field label={copy.listingType}><select value={form.driverListingType} onChange={e => setForm(v => ({ ...v, driverListingType: e.target.value }))} className="min-h-12 w-full rounded-xl border px-3"><option value="">{text.all}</option><option value="DRIVER_AVAILABLE">{text.driverAvailable}</option><option value="DRIVER_WANTED">{text.driverWanted}</option></select></Field>
              <Field label={text.licenses}><div className="flex min-h-12 flex-wrap items-center gap-3">{["B", "C", "CE", "D", "DE"].map(code => <label key={code} className="flex items-center gap-2"><input type="checkbox" checked={form.licenseClasses.includes(code)} onChange={e => setForm(v => ({ ...v, licenseClasses: e.target.checked ? [...v.licenseClasses, code] : v.licenseClasses.filter(c => c !== code) }))} />{code}</label>)}</div></Field>
              <Field label={text.employment}><select value={form.employmentType} onChange={e => setForm(v => ({ ...v, employmentType: e.target.value }))} className="min-h-12 w-full rounded-xl border px-3"><option value="">{text.all}</option>{["FULL_TIME", "PART_TIME", "CONTRACT", "DAILY"].map(value => <option key={value} value={value}>{marketplaceOptionLabel(value, locale)}</option>)}</select></Field>
              <label className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={form.adrRequired} onChange={e => setForm(v => ({ ...v, adrRequired: e.target.checked }))} />{text.adr}</label>
              <label className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={form.internationalRequired} onChange={e => setForm(v => ({ ...v, internationalRequired: e.target.checked }))} />{text.international}</label>
            </>}
            <Field label={copy.availableFrom}><input type="date" value={form.availableFrom} onChange={(event) => setForm((value) => ({ ...value, availableFrom: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm" /></Field>
            <Field label={copy.availableUntilForm}><input type="date" min={form.availableFrom || undefined} value={form.availableUntil} onChange={(event) => setForm((value) => ({ ...value, availableUntil: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm" /></Field>
            <Field label={copy.duration}><select value={form.expiresInDays} onChange={(event) => setForm((value) => ({ ...value, expiresInDays: event.target.value }))} className="min-h-12 w-full rounded-xl border px-3 text-sm">{!["30", "60", "90"].includes(form.expiresInDays) && <option value={form.expiresInDays}>{form.expiresInDays}</option>}<option value="30">{copy.days30}</option><option value="60">{copy.days60}</option><option value="90">{copy.days90}</option></select></Field>
          </div>
          <label className="mt-5 flex min-h-12 items-center gap-3 rounded-xl border bg-muted-background/45 px-4 text-sm"><input type="checkbox" checked={form.notificationsEnabled} onChange={(event) => setForm((value) => ({ ...value, notificationsEnabled: event.target.checked }))} className="size-4 accent-primary" />{copy.notifications}</label>
          <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => { setFormOpen(false); setEditingId(null); }} className="min-h-12 rounded-xl border px-5">{text.cancel}</button><button disabled={saving} type="submit" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <SearchCheck aria-hidden className="size-4" />}{saving ? copy.saving : copy.save}</button></div>
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
              <Link href={`/marketplace/requests/${encodeURIComponent(request.id)}/matches`} className="mt-4 flex min-h-12 items-center justify-between rounded-xl bg-primary-soft px-3 font-semibold text-primary">{request.matchCount} {copy.matches}<span>{text.viewMatches} →</span></Link>
              <div className="mt-3 flex flex-wrap gap-2">
                {["ACTIVE", "PAUSED"].includes(request.status) && <><button disabled={busy === request.id} onClick={() => void edit(request)} className="min-h-11 rounded-lg border px-3">{text.edit}</button><button disabled={busy === request.id} onClick={() => void manage(request, { status: request.status === "ACTIVE" ? "PAUSED" : "ACTIVE" })} className="min-h-11 rounded-lg border px-3">{request.status === "ACTIVE" ? text.pause : text.resume}</button><button disabled={busy === request.id} onClick={() => void manage(request, { status: "FULFILLED" })} className="min-h-11 rounded-lg border px-3">{text.complete}</button></>}
              </div>
              <label className="mt-3 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={busy === request.id} checked={request.notificationsEnabled} onChange={e => void manage(request, { notificationsEnabled: e.target.checked })} />{copy.notifications}</label>
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
