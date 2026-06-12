"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageSelector } from "@/components/language-selector";
import { useI18n } from "@/i18n/provider";

type Mode = "login" | "register";
const loginFields = [{ name: "identifier", type: "text", required: true }, { name: "password", type: "password", required: true }] as const;
const registerFields = [
  { name: "name", type: "text", required: true }, { name: "phone", type: "tel", required: true },
  { name: "email", type: "email", required: true }, { name: "companyName", type: "text", required: false },
  { name: "password", type: "password", required: true }, { name: "passwordConfirmation", type: "password", required: true },
] as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { t } = useI18n();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fields = mode === "login" ? loginFields : registerFields;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) { setError(t(result.error || "errors.generic")); setLoading(false); return; }
    router.push("/dashboard"); router.refresh();
  }
  return <main className="auth-surface relative grid min-h-screen place-items-center p-4 sm:p-5">
    <div className="absolute end-4 top-4 z-10"><LanguageSelector /></div>
    <section className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border bg-white shadow-2xl lg:grid-cols-[.85fr_1.15fr]">
      <div className="hidden min-h-[680px] place-items-center bg-gradient-to-br from-[#080d18] via-[#111827] to-[#1f2937] p-12 lg:grid"><BrandLogo dark className="w-64 shadow-2xl" /></div>
      <div className="p-7 sm:p-12">
        <div className="mb-8 lg:hidden"><BrandLogo className="w-44" /></div>
        <div className="mb-8"><h1 className="text-3xl font-semibold text-slate-950">{t(`auth.${mode}Title`)}</h1><p className="mt-2 text-sm text-muted">{t(`auth.${mode}Description`)}</p></div>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          {fields.map((field) => <label key={field.name} className={mode === "login" ? "sm:col-span-2" : ""}><span className="mb-2 block text-xs font-medium">{t(`auth.${field.name}`)}</span><input required={field.required} name={field.name} type={field.type} autoComplete={field.name === "password" && mode === "login" ? "current-password" : field.name.includes("password") ? "new-password" : field.name} className="w-full rounded-xl border bg-white px-3 py-3 text-sm outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100" /></label>)}
          {mode === "register" && <><label className="sm:col-span-2"><span className="mb-2 block text-xs font-medium">{t("auth.referralCode")}</span><input name="referralCode" className="w-full rounded-xl border bg-white px-3 py-3 text-sm outline-none" /></label><div className="sm:col-span-2 grid gap-2 text-xs text-muted"><label><input required name="termsAccepted" type="checkbox" className="me-2" /><Link className="text-orange-600" href="/terms-of-service">{t("auth.terms")}</Link> {t("auth.acceptRequired")}</label><label><input required name="privacyAccepted" type="checkbox" className="me-2" /><Link className="text-orange-600" href="/privacy-policy">{t("auth.privacy")}</Link> {t("auth.acceptRequired")}</label><label><input required name="kvkkAccepted" type="checkbox" className="me-2" /><Link className="text-orange-600" href="/kvkk">{t("auth.dataProcessing")}</Link> {t("auth.acceptRequired")}</label><label><input name="marketingAccepted" type="checkbox" className="me-2" />{t("auth.marketingConsent")}</label></div></>}
          {error && <p className="sm:col-span-2 rounded-xl bg-red-50 p-3 text-sm text-danger">{error}</p>}
          <button disabled={loading} className="sm:col-span-2 mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white disabled:opacity-60">{loading ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{t(`auth.${mode}Action`)}</button>
        </form>
        <p className="mt-6 text-center text-sm text-muted">{t(`auth.${mode}Switch`)} <Link className="font-semibold text-orange-600" href={mode === "login" ? "/register" : "/login"}>{t(`auth.${mode}SwitchAction`)}</Link></p>
      </div>
    </section>
  </main>;
}
