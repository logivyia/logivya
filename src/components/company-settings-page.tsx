"use client";

import { FormEvent, useEffect, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { apiErrorMessage } from "@/i18n/api-error";

type Data = {
  company: { name: string; email: string; phone?: string };
};

const fields = [
  ["companyName", "company.companyName", true],
  ["email", "company.email", false],
  ["phone", "company.phone", false],
] as const;

export function CompanySettingsPage({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n();
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void fetch("/api/settings/company")
      .then((response) => response.json())
      .then(setData);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/settings/company", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyName: form.get("companyName"), phone: form.get("phone") }),
    });
    const result = await response.json();
    setStatus(response.ok ? t("company.saved") : apiErrorMessage(t, result, "company.saveFailed"));
    setSaving(false);
  }

  if (!data) return <LoaderCircle className="size-6 animate-spin text-orange-500" />;

  const values: Record<string, string> = {
    companyName: data.company.name,
    email: data.company.email,
    phone: data.company.phone || "",
  };

  return (
    <>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{t("settings.eyebrow")}</p>
        <h1 className="mt-2 text-3xl font-semibold">{t("settings.company")}</h1>
        <p className="mt-2 text-sm text-muted">{t("company.description")}</p>
      </header>
      <form onSubmit={submit} className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
        <div className="grid gap-5 md:grid-cols-2">
          {fields.map(([name, label, required]) => (
            <label key={name}>
              <span className="mb-2 block text-xs font-medium">
                {t(label)}{required ? " *" : ""}
              </span>
              <input
                required={required}
                name={name}
                defaultValue={values[name]}
                disabled={!canEdit || name === "email"}
                inputMode={name === "phone" ? "tel" : name === "email" ? "email" : undefined}
                className="min-h-12 w-full rounded-xl border bg-input px-3 py-3 text-sm text-input-foreground outline-none focus:border-primary"
              />
            </label>
          ))}
        </div>
        {canEdit ? (
          <button disabled={saving} className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            {t("company.save")}
          </button>
        ) : null}
        {status && <p className="mt-4 text-sm text-muted">{status}</p>}
      </form>
    </>
  );
}
