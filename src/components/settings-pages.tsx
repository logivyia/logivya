"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, CreditCard, LoaderCircle, ShieldCheck } from "lucide-react";

import { useI18n } from "@/i18n/provider";
import { formatCurrency, formatDateTime } from "@/i18n/format";
import { statusLabel } from "@/i18n/status";
import { PasswordInput } from "@/components/password-input";

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
  const [billingInterval, setBillingInterval] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [data, setData] = useState<{
    subscription?: { status: string; cancelAtPeriodEnd: boolean; plan: { name: string; slug: "trial" | "starter" | "professional" } };
    plans: Array<{ id: string; slug: "trial" | "starter" | "professional"; currency: string; monthlyPrice: number; yearlyPrice: number; yearlyMonthlyEquivalent: number; trialDays: number; limits: { accounts: number; whatsappConnections: number }; featureCodes: string[]; marketingFeatures: { tr: string[]; en: string[] } }>;
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
              <h3 className="mt-1 text-2xl font-semibold">
                {data.subscription?.plan.slug ? t(`home.plan.${data.subscription.plan.slug}.name`) : "-"}
              </h3>
              <p className="mt-2 text-sm text-muted">{data.subscription ? statusLabel(t, "subscription", data.subscription.status) : "-"}</p>
            </div>
            <button className={button} onClick={() => void mutate(data.subscription?.cancelAtPeriodEnd ? "reactivate" : "cancel")}>
              {data.subscription?.cancelAtPeriodEnd ? t("settings.reactivateSubscription") : t("settings.cancelAtPeriodEnd")}
            </button>
          </div>
        )}
      </section>

      <div className="mx-auto mt-6 grid w-full max-w-xs grid-cols-2 rounded-lg border bg-card p-1" role="group" aria-label={t("home.billing.interval")}>
        {(["MONTHLY", "YEARLY"] as const).map((interval) => (
          <button key={interval} type="button" aria-pressed={billingInterval === interval} onClick={() => setBillingInterval(interval)} className={`min-h-11 rounded-md px-4 text-sm font-semibold ${billingInterval === interval ? "bg-primary text-white" : "text-muted"}`}>
            {t(`billing.period.${interval.toLowerCase()}`)}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {data?.plans.map((plan) => {
          const priceMinor = plan.slug === "trial" ? 0 : billingInterval === "YEARLY" ? plan.yearlyPrice : plan.monthlyPrice;
          return (
          <article key={plan.id} className={panel}>
            <CreditCard className="size-5 text-primary" />
            <h3 className="mt-5 font-semibold">{t(`home.plan.${plan.slug}.name`)}</h3>
            {plan.slug !== "trial" ? <p className="mt-2 text-sm font-semibold text-primary">{plan.limits.accounts} {locale === "tr" ? "kullanıcı" : "users"}</p> : null}
            <p className="mt-3 text-2xl font-bold">
              {formatCurrency(priceMinor / 100, plan.currency, locale)}
            </p>
            <p className="mt-1 text-xs text-muted">{plan.slug === "trial" ? t("home.plan.trial.period") : t(billingInterval === "YEARLY" ? "home.price.perYear" : "home.price.perMonth")}</p>
            {plan.slug !== "trial" && billingInterval === "YEARLY" ? <p className="mt-2 text-xs font-semibold text-primary">{t("home.price.monthlyEquivalent", { price: formatCurrency(plan.yearlyMonthlyEquivalent / 100, plan.currency, locale) })}</p> : null}
            <ul className="mt-5 space-y-3 text-sm text-muted">
              {(locale === "tr" ? plan.marketingFeatures.tr : plan.marketingFeatures.en).map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" /><span>{feature}</span></li>)}
            </ul>
          </article>
          );
        })}
      </div>
    </>
  );
}

export function DeleteAccountSettingsPage() {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [password, setPassword] = useState("");
  const [scope, setScope] = useState<"USER" | "COMPANY">("USER");
  const [isTenantOwner, setIsTenantOwner] = useState(true);
  const [status, setStatus] = useState("");
  const [jobs, setJobs] = useState<Array<{ publicId: string; scope: string; status: string; cancelUntil: string }>>([]);

  const phrase = scope === "COMPANY" ? t("accountDeletion.companyPhrase") : t("accountDeletion.userPhrase");

  const loadJobs = useCallback(async () => {
    const response = await fetch("/api/privacy/account-deletion", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    setJobs(payload.jobs ?? []);
    setIsTenantOwner(Boolean(payload.isTenantOwner));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadJobs(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadJobs]);

  async function close() {
    const response = await fetch("/api/privacy/account-deletion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope, confirmation: scope === "COMPANY" ? "DELETE MY LOGIVYA WORKSPACE" : "DELETE MY LOGIVYA ACCOUNT", password }),
    });
    if (response.ok) {
      setStatus(t("accountDeletion.queued"));
      setValue("");
      setPassword("");
      await loadJobs();
    } else setStatus((await response.json()).error);
  }

  async function cancel(publicId: string) {
    const response = await fetch("/api/privacy/account-deletion", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ publicId, password }) });
    setStatus(response.ok ? t("accountDeletion.canceled") : (await response.json()).error);
    if (response.ok) await loadJobs();
  }

  return (
    <>
      <Title title={t("accountDeletion.title")} description={t("accountDeletion.description")} />
      <section className={`${panel} border-danger/45 bg-danger-soft text-danger-foreground`}>
        <AlertTriangle className="size-7 text-danger" />
        <h3 className="mt-4 font-semibold text-foreground">{t("accountDeletion.disableCompany")}</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          {isTenantOwner
            ? t("accountDeletion.warning", { phrase })
            : t("membership.sharedDeleteScope")}
        </p>
        {isTenantOwner ? (
          <select className={`${input} mt-5 max-w-md`} value={scope} onChange={(event) => { setScope(event.target.value as "USER" | "COMPANY"); setValue(""); }}><option value="USER">{t("accountDeletion.userScope")}</option><option value="COMPANY">{t("accountDeletion.companyScope")}</option></select>
        ) : null}
        <input className={`${input} mt-5 max-w-md`} value={value} onChange={(event) => setValue(event.target.value)} />
        <PasswordInput wrapperClassName="mt-3 max-w-md" className={input} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("privacy.passwordPlaceholder")} />
        <button disabled={value !== phrase || !password} onClick={() => void close()} className="mt-4 flex items-center gap-2 rounded-xl bg-danger px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
          <ShieldCheck className="size-4" />
          {t("accountDeletion.disableAction")}
        </button>
        {status ? <p className="mt-3 text-sm text-danger">{status}</p> : null}
        {jobs.map((job) => <div key={job.publicId} className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 text-sm text-foreground"><span><b>{job.publicId}</b><span className="ms-2 text-muted">{job.scope} / {job.status}</span></span>{job.status === "QUEUED" ? <button className="text-danger" disabled={!password} onClick={() => void cancel(job.publicId)}>{t("accountDeletion.cancelRequest")}</button> : null}</div>)}
      </section>
    </>
  );
}
