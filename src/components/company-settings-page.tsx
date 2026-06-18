"use client";

import { FormEvent, useEffect, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { useI18n } from "@/i18n/provider";

type Data = {
  company: { name: string; phone?: string; address?: string; taxOffice?: string; taxNumber?: string };
  billing?: { country?: string; city?: string; district?: string; postalCode?: string };
};
const fields = [
  ["companyName", "company.companyName", true], ["phone", "company.phone", true], ["address", "company.address", true],
  ["taxOffice", "company.taxOffice", true], ["taxNumber", "company.taxNumber", true], ["city", "company.city", true],
  ["district", "company.district", false], ["country", "company.country", true], ["postalCode", "company.postalCode", false],
] as const;

export function CompanySettingsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { void fetch("/api/settings/company").then((response) => response.json()).then(setData); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setStatus("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/settings/company", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) });
    const result = await response.json();
    setStatus(response.ok ? t("company.saved") : result.error || t("company.saveFailed"));
    setSaving(false);
  }
  if (!data) return <LoaderCircle className="size-6 animate-spin text-orange-500" />;
  const values: Record<string, string> = { companyName: data.company.name, phone: data.company.phone || "", address: data.company.address || "", taxOffice: data.company.taxOffice || "", taxNumber: data.company.taxNumber || "", city: data.billing?.city || "", district: data.billing?.district || "", country: data.billing?.country || "TR", postalCode: data.billing?.postalCode || "" };
  return <><header className="mb-7"><p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{t("settings.eyebrow")}</p><h1 className="mt-2 text-3xl font-semibold">{t("settings.company")}</h1><p className="mt-2 text-sm text-muted">{t("company.description")}</p></header><form onSubmit={submit} className="rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)]"><div className="grid gap-5 md:grid-cols-2">{fields.map(([name, label, required]) => <label key={name} className={name === "address" ? "md:col-span-2" : ""}><span className="mb-2 block text-xs font-medium">{t(label)}</span><input required={required} name={name} defaultValue={values[name]} inputMode={name === "phone" || name === "taxNumber" ? "numeric" : undefined} className="w-full rounded-xl border bg-input px-3 py-3 text-sm text-input-foreground outline-none focus:border-primary" /></label>)}</div><button disabled={saving} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{t("company.save")}</button>{status && <p className="mt-4 text-sm text-muted">{status}</p>}</form></>;
}
