"use client";
import { uzbekMarketplaceUi as uz, uzbekVehicleLabels } from "../../../shared/uzbek-marketplace-ui";
import { guestMarketplaceCopy } from "../../../shared/guest-marketplace-copy";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { emptyMarketplaceFilters, marketplaceCountries, marketplaceVehicles, type MarketplaceFilters } from "../../../shared/marketplace-filters";
import { useI18n } from "@/i18n/provider";

export function CatalogFilters({ value, onApply }: { value: MarketplaceFilters; onApply: (value: MarketplaceFilters) => void }) {
  const { locale } = useI18n();
  const tr = locale === "tr";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const active = Object.entries(value).filter(([key, item]) => key !== "kind" && item).length;
  const labels = locale === "uz" ? [uz.originCountry, uz.destinationCountry, uz.originCity, uz.destinationCity, uz.vehicle] : tr ? ["Kalkış ülkesi", "Varış ülkesi", "Kalkış şehri / ilçesi", "Varış şehri / ilçesi", "Araç tipi"] : ["Origin country", "Destination country", "Origin city / district", "Destination city / district", "Vehicle type"];
  const fieldClass = "mt-2 min-h-12 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary";
  return <div className="mt-4">
    <button type="button" onClick={() => { setDraft(value); setOpen(!open); }} aria-expanded={open} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"><SlidersHorizontal size={17} />{guestMarketplaceCopy(locale).filterListings}{active ? ` (${active})` : ""}</button>
    {active ? <span className="ms-3 text-sm text-muted">{[value.originCity || value.originCountry, value.destinationCity || value.destinationCountry].filter(Boolean).join(" → ")}{value.vehicle ? ` · ${(locale === "uz" ? uzbekVehicleLabels[value.vehicle] : marketplaceVehicles.find(([code]) => code === value.vehicle)?.[1])}` : ""}</span> : null}
    {open ? <form className="mt-4 grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => { event.preventDefault(); onApply(draft); setOpen(false); }}>
      {(["originCountry", "destinationCountry"] as const).map((key, index) => <label key={key} className="text-sm font-semibold">{labels[index]}<select className={fieldClass} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}><option value="">{locale === "uz" ? uz.allCountries : tr ? "Tüm ülkeler" : "All countries"}</option>{marketplaceCountries.map(([code, title]) => <option key={code} value={code}>{new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? title}</option>)}</select></label>)}
      {(["originCity", "destinationCity"] as const).map((key, index) => <label key={key} className="text-sm font-semibold">{labels[index + 2]}<input maxLength={80} className={fieldClass} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} placeholder={locale === "uz" ? uz.cityPlaceholder : tr ? "Şehir veya ilçe" : "City or district"} /></label>)}
      <label className="text-sm font-semibold">{labels[4]}<select className={fieldClass} value={draft.vehicle} onChange={(event) => setDraft({ ...draft, vehicle: event.target.value })}><option value="">{locale === "uz" ? uz.allVehicles : tr ? "Tüm araçlar" : "All vehicles"}</option>{marketplaceVehicles.map(([code, title]) => <option key={code} value={code}>{locale === "uz" ? uzbekVehicleLabels[code] ?? title : title}</option>)}</select></label>
      <div className="flex items-end gap-2"><button type="submit" className="min-h-12 rounded-xl bg-primary px-5 font-semibold text-primary-foreground">{locale === "uz" ? uz.apply : tr ? "Uygula" : "Apply"}</button><button type="button" className="min-h-12 rounded-xl border px-4" onClick={() => { const cleared = { ...emptyMarketplaceFilters, kind: value.kind }; setDraft(cleared); onApply(cleared); }}>{locale === "uz" ? uz.clear : tr ? "Temizle" : "Clear"}</button></div>
    </form> : null}
  </div>;
}
