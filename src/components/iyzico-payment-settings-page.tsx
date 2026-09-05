"use client";

import { FormEvent, useEffect, useState } from "react";
import { CreditCard, LoaderCircle, Save, ShieldCheck } from "lucide-react";

import { apiErrorMessage } from "@/i18n/api-error";
import { useI18n } from "@/i18n/provider";

type PaymentProfile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  identityNumber: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  district: string;
  postalCode: string;
  country: string;
};

const fields = [
  ["firstName", "paymentProfile.firstName", true, "text"],
  ["lastName", "paymentProfile.lastName", true, "text"],
  ["email", "paymentProfile.email", true, "email"],
  ["phone", "paymentProfile.phone", true, "tel"],
  ["identityNumber", "paymentProfile.identityNumber", true, "text"],
  ["addressLine1", "paymentProfile.addressLine1", true, "text"],
  ["addressLine2", "paymentProfile.addressLine2", false, "text"],
  ["city", "paymentProfile.city", true, "text"],
  ["district", "paymentProfile.district", false, "text"],
  ["postalCode", "paymentProfile.postalCode", false, "text"],
  ["country", "paymentProfile.country", true, "text"],
] as const;

export function IyzicoPaymentSettingsPage() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<PaymentProfile | null>(null);
  const [status, setStatus] = useState("");
  const [loadingError, setLoadingError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/settings/payment-profile", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(t, payload, "paymentProfile.loadFailed"));
        return payload as { paymentProfile: PaymentProfile };
      })
      .then((payload) => {
        if (!cancelled) setProfile(payload.paymentProfile);
      })
      .catch((error) => {
        if (!cancelled) setLoadingError(error instanceof Error ? error.message : t("paymentProfile.loadFailed"));
      });
    return () => { cancelled = true; };
  }, [t]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(fields.map(([name]) => [name, form.get(name)]));
    const response = await fetch("/api/settings/payment-profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    setStatus(response.ok
      ? t("paymentProfile.saved")
      : apiErrorMessage(t, result, "paymentProfile.saveFailed"));
    setSaving(false);
  }

  if (loadingError) {
    return <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-950">{loadingError}</p>;
  }
  if (!profile) return <LoaderCircle className="size-6 animate-spin text-orange-500" />;

  return (
    <>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{t("settings.eyebrow")}</p>
        <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold">
          <CreditCard className="size-7 text-primary" aria-hidden="true" />
          {t("paymentProfile.title")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{t("paymentProfile.description")}</p>
      </header>

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
        <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p>{t("paymentProfile.providerNotice")}</p>
      </div>

      <form onSubmit={submit} className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
        <div className="grid gap-5 md:grid-cols-2">
          {fields.map(([name, label, required, inputMode]) => (
            <label key={name} className={name === "addressLine1" || name === "addressLine2" ? "md:col-span-2" : undefined}>
              <span className="mb-2 block text-xs font-medium">
                {t(label)}{required ? " *" : ""}
              </span>
              <input
                required={required}
                name={name}
                defaultValue={profile[name]}
                readOnly={name === "email"}
                inputMode={inputMode === "tel" ? "tel" : inputMode === "email" ? "email" : undefined}
                autoComplete={name === "identityNumber" ? "off" : undefined}
                className="min-h-12 w-full rounded-xl border bg-input px-3 py-3 text-sm text-input-foreground outline-none read-only:cursor-not-allowed read-only:opacity-70 focus:border-primary"
              />
            </label>
          ))}
        </div>
        <button disabled={saving} className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t("paymentProfile.save")}
        </button>
        {status ? <p role="status" className="mt-4 text-sm text-muted">{status}</p> : null}
      </form>
    </>
  );
}
