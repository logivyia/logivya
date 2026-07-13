"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, CreditCard, LoaderCircle, Save, ShieldCheck } from "lucide-react";

import { useI18n } from "@/i18n/provider";
import { formatCurrency, formatDateTime } from "@/i18n/format";
import { statusLabel } from "@/i18n/status";

const panel = "rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)]";
const input = "w-full rounded-xl border bg-input px-3 py-3 text-sm text-input-foreground outline-none focus:border-primary";
const button = "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60";

function Title({ title, description }: { title: string; description: string }) {
  const { t } = useI18n();
  return (
    <header className="mb-7">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{t("settings.managementEyebrow")}</p>
      <h2 className="mt-2 text-3xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </header>
  );
}

function roleLabel(role: string, t: ReturnType<typeof useI18n>["t"]) {
  return t(`users.${role.toLowerCase()}`);
}

function memberStatusLabel(status: string, t: ReturnType<typeof useI18n>["t"]) {
  return t(`users.${status === "INVITED" ? "invitedStatus" : status.toLowerCase()}`);
}

export function CompanySettingsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void fetch("/api/settings/company").then((response) => response.json()).then(setData);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      companyName: form.get("companyName"),
      phone: form.get("phone"),
      email: form.get("email"),
      website: form.get("website"),
      billing: {
        billingType: form.get("billingType"),
        companyName: form.get("companyName"),
        legalName: form.get("legalName"),
        tradeName: form.get("tradeName"),
        fullName: form.get("fullName"),
        taxOffice: form.get("taxOffice"),
        taxNumber: form.get("taxNumber"),
        nationalIdNumber: form.get("nationalIdNumber"),
        country: form.get("country"),
        city: form.get("city"),
        district: form.get("district"),
        addressLine1: form.get("addressLine1"),
        addressLine2: form.get("addressLine2"),
        postalCode: form.get("postalCode"),
        billingEmail: form.get("billingEmail"),
        billingPhone: form.get("billingPhone"),
        invoiceType: form.get("invoiceType"),
        eInvoiceEligible: false,
        eArchiveEligible: false,
      },
    };
    const response = await fetch("/api/settings/company", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setStatus(response.ok ? t("company.billingSaved") : (await response.json()).error || t("company.saveFailed"));
  }

  if (!data) return <LoaderCircle className="size-6 animate-spin text-primary" />;

  const company = data.company as Record<string, string | null>;
  const billing = (data.billing || {}) as Record<string, string | null>;
  const identityFields: Array<[string, string, string]> = [
    ["companyName", t("company.companyName"), company.name ?? ""],
    ["phone", t("company.phone"), company.phone ?? ""],
    ["email", t("company.email"), company.email ?? ""],
    ["website", t("company.website"), ""],
  ];
  const fields = [
    ["legalName", t("billing.legalName")],
    ["tradeName", t("billing.tradeName")],
    ["fullName", t("company.fullName")],
    ["taxOffice", t("billing.taxOffice")],
    ["taxNumber", t("billing.taxNumber")],
    ["nationalIdNumber", t("company.nationalId")],
    ["country", t("billing.country")],
    ["city", t("billing.city")],
    ["district", t("billing.district")],
    ["postalCode", t("billing.postalCode")],
    ["billingEmail", t("billing.billingEmail")],
    ["billingPhone", t("billing.billingPhone")],
    ["addressLine1", t("company.fullBillingAddress")],
  ];

  return (
    <>
      <Title title={t("settings.company")} description={t("company.description")} />
      <form onSubmit={submit} className="space-y-6">
        <section className={panel}>
          <h3 className="font-semibold">{t("company.identity")}</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {identityFields.map(([name, label, value]) => (
              <label key={name}>
                <span className="mb-2 block text-xs font-medium">{label}</span>
                <input required={name === "companyName" || name === "email"} className={input} name={name} defaultValue={value} />
              </label>
            ))}
          </div>
        </section>

        <section className={panel}>
          <h3 className="font-semibold">{t("company.billingInformation")}</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label>
              <span className="mb-2 block text-xs font-medium">{t("company.billingType")}</span>
              <select className={input} name="billingType" defaultValue={billing.billingType || "COMPANY"}>
                <option value="COMPANY">{t("company.companyType")}</option>
                <option value="INDIVIDUAL">{t("company.individualType")}</option>
              </select>
            </label>
            <label>
              <span className="mb-2 block text-xs font-medium">{t("billing.invoiceType")}</span>
              <select className={input} name="invoiceType" defaultValue={billing.invoiceType || "STANDARD_INVOICE"}>
                <option value="STANDARD_INVOICE">{t("company.standardInvoice")}</option>
                <option value="E_INVOICE">{t("company.eInvoice")}</option>
                <option value="E_ARCHIVE">{t("company.eArchive")}</option>
              </select>
            </label>
            {fields.map(([name, label]) => (
              <label key={name} className={name === "addressLine1" ? "md:col-span-2" : ""}>
                <span className="mb-2 block text-xs font-medium">{label}</span>
                <input className={input} name={name} defaultValue={billing[name] || ""} />
              </label>
            ))}
          </div>
        </section>

        <button className={button}>
          <Save className="size-4" />
          {t("company.save")}
        </button>
        {status ? <p className="text-sm text-muted">{status}</p> : null}
      </form>
    </>
  );
}

export function UsersSettingsPage() {
  const { locale, t } = useI18n();
  const [data, setData] = useState<{ users: Array<{ id: string; role: string; status: string; user: { name: string; email: string; sessions: Array<{ lastActiveAt: string }> } }> }>();

  useEffect(() => {
    void fetch("/api/settings/users").then((response) => response.json()).then(setData);
  }, []);

  return (
    <>
      <Title title={t("users.title")} description={t("users.settingsDescription")} />
      <section className={panel}>
        {!data ? (
          <LoaderCircle className="size-6 animate-spin text-primary" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start text-xs text-muted">
                  <th className="py-3">{t("users.user")}</th>
                  <th>{t("users.role")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("users.lastLogin")}</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-4">
                      <b>{item.user.name}</b>
                      <p className="text-xs text-muted">{item.user.email}</p>
                    </td>
                    <td>{roleLabel(item.role, t)}</td>
                    <td>{memberStatusLabel(item.status, t)}</td>
                    <td>{item.user.sessions[0] ? formatDateTime(item.user.sessions[0].lastActiveAt, locale) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function SubscriptionsSettingsPage() {
  const { locale, t } = useI18n();
  const [data, setData] = useState<{
    subscription?: { status: string; cancelAtPeriodEnd: boolean; plan: { name: string } };
    plans: Array<{ id: string; name: string; slug: string; monthlyPrice: string; yearlyPrice: string; trialDays: number }>;
  }>();

  const load = useCallback(() => fetch("/api/settings/subscriptions").then((response) => response.json()).then(setData), []);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(action: string) {
    await fetch(`/api/settings/subscriptions/${action}`, { method: "POST" });
    void load();
  }

  return (
    <>
      <Title title={t("settings.subscriptionTitle")} description={t("settings.subscriptionDescription")} />
      <section className={panel}>
        {!data ? (
          <LoaderCircle className="size-6 animate-spin text-primary" />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-muted">{t("settings.currentPlan")}</p>
              <h3 className="mt-1 text-2xl font-semibold">{data.subscription?.plan.name || "-"}</h3>
              <p className="mt-2 text-sm text-muted">{data.subscription ? statusLabel(t, "subscription", data.subscription.status) : "-"}</p>
            </div>
            <button className={button} onClick={() => void mutate(data.subscription?.cancelAtPeriodEnd ? "reactivate" : "cancel")}>
              {data.subscription?.cancelAtPeriodEnd ? t("settings.reactivateSubscription") : t("settings.cancelAtPeriodEnd")}
            </button>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        {data?.plans.map((plan) => (
          <article key={plan.id} className={panel}>
            <CreditCard className="size-5 text-primary" />
            <h3 className="mt-5 font-semibold">{plan.name}</h3>
            <p className="mt-3 text-2xl font-bold">
              {formatCurrency(Number(plan.monthlyPrice), "TRY", locale)} / {t("settings.month")}
            </p>
            <p className="mt-1 text-xs text-muted">{Number(plan.yearlyPrice) > 0 ? `${formatCurrency(Number(plan.yearlyPrice), "TRY", locale)} / ${t("settings.year")}` : plan.slug === "trial" ? t("settings.trialDays", { days: plan.trialDays }) : t("settings.custom")}</p>
          </article>
        ))}
      </div>
    </>
  );
}

export function DeleteAccountSettingsPage() {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("");

  async function close() {
    const response = await fetch("/api/settings/delete-account", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: value === t("accountDeletion.confirmationPhrase") ? "CLOSE MY LOGIVYA ACCOUNT" : value }),
    });
    if (response.ok) location.href = "/login";
    else setStatus((await response.json()).error);
  }

  return (
    <>
      <Title title={t("accountDeletion.title")} description={t("accountDeletion.description")} />
      <section className={`${panel} border-danger/45 bg-danger-soft text-danger-foreground`}>
        <AlertTriangle className="size-7 text-danger" />
        <h3 className="mt-4 font-semibold text-foreground">{t("accountDeletion.disableCompany")}</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{t("accountDeletion.warning", { phrase: t("accountDeletion.confirmationPhrase") })}</p>
        <input className={`${input} mt-5 max-w-md`} value={value} onChange={(event) => setValue(event.target.value)} />
        <button disabled={value !== t("accountDeletion.confirmationPhrase")} onClick={() => void close()} className="mt-4 flex items-center gap-2 rounded-xl bg-danger px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
          <ShieldCheck className="size-4" />
          {t("accountDeletion.disableAction")}
        </button>
        {status ? <p className="mt-3 text-sm text-danger">{status}</p> : null}
      </section>
    </>
  );
}
