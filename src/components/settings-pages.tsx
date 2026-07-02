"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, CreditCard, LoaderCircle, Save, ShieldCheck } from "lucide-react";

import { useI18n } from "@/i18n/provider";
import { getSubscriptionStatusLabel } from "@/lib/i18n/status-labels";

const panel = "rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)]";
const input = "w-full rounded-xl border bg-input px-3 py-3 text-sm text-input-foreground outline-none focus:border-primary";
const button = "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60";

function Title({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-7">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">Logivya Yönetim</p>
      <h2 className="mt-2 text-3xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </header>
  );
}

function roleLabel(role: string, isTr: boolean) {
  const labels: Record<string, string> = isTr
    ? { OWNER: "Sahip", ADMIN: "Yetkili", OPERATOR: "Operatör", VIEWER: "Görüntüleyici" }
    : { OWNER: "Owner", ADMIN: "Admin", OPERATOR: "Operator", VIEWER: "Viewer" };
  return labels[role] ?? (isTr ? "Rol" : "Role");
}

function memberStatusLabel(status: string, isTr: boolean) {
  const labels: Record<string, string> = isTr
    ? { ACTIVE: "Aktif", INVITED: "Davet Edildi", SUSPENDED: "Askıya Alındı" }
    : { ACTIVE: "Active", INVITED: "Invited", SUSPENDED: "Suspended" };
  return labels[status] ?? (isTr ? "Bilinmiyor" : "Unknown");
}

export function CompanySettingsPage() {
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
    setStatus(response.ok ? "Şirket ve fatura bilgileri kaydedildi." : (await response.json()).error || "Kaydedilemedi");
  }

  if (!data) return <LoaderCircle className="size-6 animate-spin text-primary" />;

  const company = data.company as Record<string, string | null>;
  const billing = (data.billing || {}) as Record<string, string | null>;
  const identityFields: Array<[string, string, string]> = [
    ["companyName", "Şirket adı", company.name ?? ""],
    ["phone", "Telefon", company.phone ?? ""],
    ["email", "E-posta", company.email ?? ""],
    ["website", "Web sitesi", ""],
  ];
  const fields = [
    ["legalName", "Yasal şirket unvanı"],
    ["tradeName", "Ticari unvan"],
    ["fullName", "Ad soyad"],
    ["taxOffice", "Vergi dairesi"],
    ["taxNumber", "Vergi numarası"],
    ["nationalIdNumber", "T.C. kimlik numarası"],
    ["country", "Ülke"],
    ["city", "Şehir"],
    ["district", "İlçe"],
    ["postalCode", "Posta kodu"],
    ["billingEmail", "Fatura e-postası"],
    ["billingPhone", "Fatura telefonu"],
    ["addressLine1", "Tam fatura adresi"],
  ];

  return (
    <>
      <Title title="Şirket Bilgileri" description="Şirket kimliğinizi ve fatura kesimine hazır bilgilerinizi yönetin." />
      <form onSubmit={submit} className="space-y-6">
        <section className={panel}>
          <h3 className="font-semibold">Şirket kimliği</h3>
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
          <h3 className="font-semibold">Fatura bilgileri</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label>
              <span className="mb-2 block text-xs font-medium">Faturalama türü</span>
              <select className={input} name="billingType" defaultValue={billing.billingType || "COMPANY"}>
                <option value="COMPANY">Şirket</option>
                <option value="INDIVIDUAL">Bireysel</option>
              </select>
            </label>
            <label>
              <span className="mb-2 block text-xs font-medium">Fatura türü</span>
              <select className={input} name="invoiceType" defaultValue={billing.invoiceType || "STANDARD_INVOICE"}>
                <option value="STANDARD_INVOICE">Standart Fatura</option>
                <option value="E_INVOICE">E-Fatura</option>
                <option value="E_ARCHIVE">E-Arşiv</option>
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
          Bilgileri kaydet
        </button>
        {status ? <p className="text-sm text-muted">{status}</p> : null}
      </form>
    </>
  );
}

export function UsersSettingsPage() {
  const { locale } = useI18n();
  const isTr = locale === "tr";
  const [data, setData] = useState<{ users: Array<{ id: string; role: string; status: string; user: { name: string; email: string; sessions: Array<{ lastActiveAt: string }> } }> }>();

  useEffect(() => {
    void fetch("/api/settings/users").then((response) => response.json()).then(setData);
  }, []);

  return (
    <>
      <Title title={isTr ? "Kullanıcılar" : "Users"} description={isTr ? "Şirketinizdeki kullanıcıları, rollerini ve erişim durumlarını görüntüleyin." : "View users, roles, and access status in your company."} />
      <section className={panel}>
        {!data ? (
          <LoaderCircle className="size-6 animate-spin text-primary" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start text-xs text-muted">
                  <th className="py-3">{isTr ? "Kullanıcı" : "User"}</th>
                  <th>{isTr ? "Rol" : "Role"}</th>
                  <th>{isTr ? "Durum" : "Status"}</th>
                  <th>{isTr ? "Son giriş" : "Last login"}</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-4">
                      <b>{item.user.name}</b>
                      <p className="text-xs text-muted">{item.user.email}</p>
                    </td>
                    <td>{roleLabel(item.role, isTr)}</td>
                    <td>{memberStatusLabel(item.status, isTr)}</td>
                    <td>{item.user.sessions[0] ? new Date(item.user.sessions[0].lastActiveAt).toLocaleString(isTr ? "tr-TR" : "en-US") : "-"}</td>
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
  const { locale } = useI18n();
  const isTr = locale === "tr";
  const [data, setData] = useState<{
    subscription?: { status: string; cancelAtPeriodEnd: boolean; plan: { name: string } };
    plans: Array<{ id: string; name: string; slug: string; monthlyPrice: string; yearlyPrice: string }>;
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
      <Title title={isTr ? "Abonelikler" : "Subscriptions"} description={isTr ? "Planınızı, deneme sürenizi ve abonelik durumunuzu yönetin." : "Manage your plan, trial period, and subscription status."} />
      <section className={panel}>
        {!data ? (
          <LoaderCircle className="size-6 animate-spin text-primary" />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-muted">{isTr ? "Mevcut plan" : "Current plan"}</p>
              <h3 className="mt-1 text-2xl font-semibold">{data.subscription?.plan.name || "-"}</h3>
              <p className="mt-2 text-sm text-muted">{data.subscription ? getSubscriptionStatusLabel(data.subscription.status, locale) : "-"}</p>
            </div>
            <button className={button} onClick={() => void mutate(data.subscription?.cancelAtPeriodEnd ? "reactivate" : "cancel")}>
              {data.subscription?.cancelAtPeriodEnd ? (isTr ? "Aboneliği yeniden etkinleştir" : "Reactivate subscription") : isTr ? "Dönem sonunda iptal et" : "Cancel at period end"}
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
              {Number(plan.monthlyPrice) === 0 ? (plan.slug === "enterprise" ? (isTr ? "Teklif Alınız" : "Contact sales") : "0 TL") : `${Number(plan.monthlyPrice)} TL / ${isTr ? "Ay" : "Month"}`}
            </p>
            <p className="mt-1 text-xs text-muted">{Number(plan.yearlyPrice) > 0 ? `${Number(plan.yearlyPrice)} TL / ${isTr ? "Yıl" : "Year"}` : isTr ? "3 Gün" : "3 Days"}</p>
          </article>
        ))}
      </div>
    </>
  );
}

export function DeleteAccountSettingsPage() {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("");

  async function close() {
    const response = await fetch("/api/settings/delete-account", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: value }),
    });
    if (response.ok) location.href = "/login";
    else setStatus((await response.json()).error);
  }

  return (
    <>
      <Title title="Hesabı Sil" description="Şirket erişimini kapatın. Mesaj, fatura ve denetim geçmişi yasal gereklilikler için korunur." />
      <section className={`${panel} border-danger/45 bg-danger-soft text-danger-foreground`}>
        <AlertTriangle className="size-7 text-danger" />
        <h3 className="mt-4 font-semibold text-foreground">Şirket hesabını devre dışı bırak</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Bu işlem tüm aktif oturumları kapatır ve kampanyaları durdurur. Devam etmek için aşağıya LOGIVYA HESABIMI KAPAT yazın.</p>
        <input className={`${input} mt-5 max-w-md`} value={value} onChange={(event) => setValue(event.target.value)} />
        <button disabled={value !== "LOGIVYA HESABIMI KAPAT"} onClick={() => void close()} className="mt-4 flex items-center gap-2 rounded-xl bg-danger px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
          <ShieldCheck className="size-4" />
          Hesabı devre dışı bırak
        </button>
        {status ? <p className="mt-3 text-sm text-danger">{status}</p> : null}
      </section>
    </>
  );
}
