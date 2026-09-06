"use client";
import { productJourneyCopy } from "../../../shared/product-journey-copy";
import { marketplaceOptionLabel } from "../../../shared/product-status-copy";
import { driverLicenseOptions, driverEmploymentOptions } from "../../../shared/marketplace-filters";
import { uzbekCountryLabels } from "../../../shared/uzbek-marketplace-ui";
import { guestMarketplaceCopy } from "../../../shared/guest-marketplace-copy";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { emptyMarketplaceFilters, marketplaceCountries, marketplaceVehicles, type MarketplaceFilters } from "../../../shared/marketplace-filters";
import { useI18n } from "@/i18n/provider";

export function CatalogFilters({ value, onApply }: { value: MarketplaceFilters; onApply: (value: MarketplaceFilters) => void }) {
  const { locale } = useI18n();
  const copy = productJourneyCopy(locale);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const active = Object.entries(value).filter(([key, item]) => key !== "kind" && item).length;
  const labels = [copy.originCountry, copy.destinationCountry, copy.originCity, copy.destinationCity, copy.vehicle];
  const fieldClass = "mt-2 min-h-12 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary";
  return <div className="mt-4">
    <button type="button" onClick={() => { setDraft(value); setOpen(!open); }} aria-expanded={open} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"><SlidersHorizontal size={17} />{guestMarketplaceCopy(locale).filterListings}{active ? ` (${active})` : ""}</button>
    {active ? <span className="ms-3 text-sm text-muted">{[value.originCity || value.originCountry, value.destinationCity || value.destinationCountry].filter(Boolean).join(" → ")}{value.vehicle ? ` · ${marketplaceOptionLabel(value.vehicle, locale)}` : ""}</span> : null}
    {open ? <form className="mt-4 grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => { event.preventDefault(); onApply(draft); setOpen(false); }}>
      {draft.kind !== "DRIVER" ? <>{(["originCountry", "destinationCountry"] as const).map((key, index) => <label key={key} className="text-sm font-semibold">{labels[index]}<select className={fieldClass} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}><option value="">{copy.all}</option>{marketplaceCountries.map(([code, title]) => <option key={code} value={code}>{locale === "uz" ? uzbekCountryLabels[code] ?? title : new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? title}</option>)}</select></label>)}
      {(["originCity", "destinationCity"] as const).map((key, index) => <label key={key} className="text-sm font-semibold">{labels[index + 2]}<input maxLength={80} className={fieldClass} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} placeholder={labels[index + 2]} /></label>)}
      <label className="text-sm font-semibold">{labels[4]}<select className={fieldClass} value={draft.vehicle} onChange={(event) => setDraft({ ...draft, vehicle: event.target.value })}><option value="">{copy.all}</option>{marketplaceVehicles.map(([code, title]) => <option key={code} value={code}>{marketplaceOptionLabel(code, locale)}</option>)}</select></label>
      </> : <>
        <label className="text-sm font-semibold">{copy.location}<input maxLength={80} className={fieldClass} value={draft.location || ""} onChange={e => setDraft({ ...draft, location: e.target.value })} /></label>
        <label className="text-sm font-semibold">{copy.filters}<select className={fieldClass} value={draft.driverListingType || ""} onChange={e => setDraft({ ...draft, driverListingType: e.target.value })}><option value="">{copy.all}</option><option value="DRIVER_AVAILABLE">{copy.driverAvailable}</option><option value="DRIVER_WANTED">{copy.driverWanted}</option></select></label>
        <label className="text-sm font-semibold">{copy.licenses}<select className={fieldClass} value={draft.licenseClass || ""} onChange={e => setDraft({ ...draft, licenseClass: e.target.value })}><option value="">{copy.all}</option>{driverLicenseOptions.map(code => <option key={code}>{code}</option>)}</select></label>
        <label className="text-sm font-semibold">{copy.employment}<select className={fieldClass} value={draft.employmentType || ""} onChange={e => setDraft({ ...draft, employmentType: e.target.value })}><option value="">{copy.all}</option>{driverEmploymentOptions.map(code => <option key={code} value={code}>{marketplaceOptionLabel(code, locale)}</option>)}</select></label>
        {(["adrRequired", "internationalRequired"] as const).map(key => <label key={key} className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={draft[key] === "true"} onChange={e => setDraft({ ...draft, [key]: e.target.checked ? "true" : "" })} />{key === "adrRequired" ? copy.adr : copy.international}</label>)}
      </>}
      <div className="flex items-end gap-2"><button type="submit" className="min-h-12 rounded-xl bg-primary px-5 font-semibold text-primary-foreground">{copy.apply}</button><button type="button" className="min-h-12 rounded-xl border px-4" onClick={() => { const cleared = { ...emptyMarketplaceFilters, kind: value.kind }; setDraft(cleared); onApply(cleared); }}>{copy.clear}</button></div>
    </form> : null}
  </div>;
}
