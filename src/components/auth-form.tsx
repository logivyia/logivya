"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole, Truck } from "lucide-react";
import { useI18n } from "@/i18n/provider";

type Mode = "login" | "register";
const loginFields = [{ name: "identifier", type: "text" }, { name: "password", type: "password" }] as const;
const registerFields = [
  { name: "name", type: "text" }, { name: "username", type: "text" }, { name: "phone", type: "tel" },
  { name: "email", type: "email" }, { name: "companyName", type: "text" }, { name: "password", type: "password" },
  { name: "passwordConfirmation", type: "password" },
] as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { t } = useI18n();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fields = mode === "login" ? loginFields : registerFields;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) {
      setError(t(result.error || "errors.generic"));
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }
  return <main className="auth-surface grid min-h-screen place-items-center p-5">
    <section className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border bg-white shadow-2xl lg:grid-cols-[.9fr_1.1fr]">
      <div className="hidden bg-[#111827] p-12 text-white lg:flex lg:flex-col">
        <span className="grid size-12 place-items-center rounded-2xl bg-primary text-white"><Truck /></span>
        <h1 className="mt-12 text-4xl font-semibold leading-tight">{t("auth.hero")}</h1>
        <p className="mt-5 text-sm leading-7 text-white/60">{t("auth.heroDescription")}</p>
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70"><LockKeyhole className="mb-3 size-5 text-primary" />{t("auth.security")}</div>
      </div>
      <div className="p-7 sm:p-12">
        <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[.22em] text-primary">{t("brand.name")}</p><h2 className="mt-3 text-3xl font-semibold">{t(`auth.${mode}Title`)}</h2><p className="mt-2 text-sm text-muted">{t(`auth.${mode}Description`)}</p></div>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          {fields.map((field) => <label key={field.name} className={field.name === "identifier" || field.name === "password" && mode === "login" ? "sm:col-span-2" : ""}>
            <span className="mb-2 block text-xs font-medium">{t(`auth.${field.name}`)}</span>
            <input required name={field.name} type={field.type} autoComplete={field.name.includes("password") ? "new-password" : field.name} className="w-full rounded-xl border bg-white px-3 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary-soft" />
          </label>)}
          {mode==="register"&&<><label className="sm:col-span-2"><span className="mb-2 block text-xs font-medium">Referans kodu (opsiyonel)</span><input name="referralCode" className="w-full rounded-xl border bg-white px-3 py-3 text-sm outline-none"/></label><div className="sm:col-span-2 grid gap-2 text-xs text-muted"><label><input required name="termsAccepted" type="checkbox" className="me-2"/><Link className="text-primary" href="/terms-of-service">Kullanım Koşulları</Link>&apos;nı kabul ediyorum.</label><label><input required name="privacyAccepted" type="checkbox" className="me-2"/><Link className="text-primary" href="/privacy-policy">Gizlilik Politikası</Link>&apos;nı kabul ediyorum.</label><label><input required name="kvkkAccepted" type="checkbox" className="me-2"/><Link className="text-primary" href="/kvkk">KVKK / veri işleme şartları</Link>&apos;nı kabul ediyorum.</label><label><input name="marketingAccepted" type="checkbox" className="me-2"/>Pazarlama iletişimine izin veriyorum (opsiyonel).</label></div></>}
          {error && <p className="sm:col-span-2 rounded-xl bg-red-50 p-3 text-sm text-danger">{error}</p>}
          <button disabled={loading} className="sm:col-span-2 mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-white disabled:opacity-60">{loading ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{t(`auth.${mode}Action`)}</button>
        </form>
        <p className="mt-6 text-center text-sm text-muted">{t(`auth.${mode}Switch`)} <Link className="font-semibold text-primary" href={mode === "login" ? "/register" : "/login"}>{t(`auth.${mode}SwitchAction`)}</Link></p>
      </div>
    </section>
  </main>;
}
