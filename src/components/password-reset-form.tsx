"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageSelector } from "@/components/language-selector";
import { useI18n } from "@/i18n/provider";

type Mode = "forgot" | "reset";
const inputClass = "w-full rounded-xl border bg-white px-3 py-3 text-sm text-slate-950 placeholder:text-slate-400 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100";

export function PasswordResetForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { t } = useI18n();
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (mode === "reset") queueMicrotask(() => setIdentifier(sessionStorage.getItem("logivya.reset.identifier") || ""));
  }, [mode]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  async function submitForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier }) });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.message || t(result.error || "validation.invalid"));
    sessionStorage.setItem("logivya.reset.identifier", identifier);
    setMessage(result.message);
    setTimeout(() => router.push("/reset-password"), 900);
  }

  async function resendCode() {
    if (!identifier || resendCooldown > 0) return;
    setLoading(true); setError(""); setMessage("");
    const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier }) });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.message || t(result.error || "auth.resetEmailFailed"));
    setMessage(result.message);
    setResendCooldown(60);
  }

  async function verifyCode() {
    setLoading(true); setError("");
    const response = await fetch("/api/auth/verify-reset-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier, code }) });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.message || t(result.error || "auth.resetInvalidCode"));
    setVerified(true);
    setMessage(t("auth.resetVerified"));
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verified) return void verifyCode();
    setLoading(true); setError("");
    const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier, code, password, passwordConfirmation }) });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.message || t(result.error || "errors.generic"));
    sessionStorage.removeItem("logivya.reset.identifier");
    router.push("/login?reset=success");
  }

  return <main className="auth-surface relative grid min-h-screen place-items-center p-4 sm:p-5">
    <div className="absolute end-4 top-4"><LanguageSelector /></div>
    <section className="w-full max-w-lg rounded-[2rem] border bg-white p-7 shadow-2xl sm:p-10">
      <div className="flex justify-center"><BrandLogo className="text-2xl tracking-[.2em]" /></div>
      <div className="mt-8 flex justify-center"><span className="grid size-14 place-items-center rounded-2xl bg-orange-50 text-orange-600"><ShieldCheck className="size-7" /></span></div>
      <h1 className="mt-5 text-center text-3xl font-semibold text-slate-950">{t(mode === "forgot" ? "auth.forgotTitle" : "auth.resetTitle")}</h1>
      <p className="mt-2 text-center text-sm leading-6 text-slate-500">{t(mode === "forgot" ? "auth.forgotDescription" : "auth.resetDescription")}</p>

      <form className="mt-8 grid gap-4" onSubmit={mode === "forgot" ? submitForgot : submitReset}>
        <label><span className="mb-2 block text-xs font-medium text-slate-700">{t("auth.identifier")}</span><input required value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" className={inputClass} /></label>
        {mode === "reset" && <>
          <label><span className="mb-2 block text-xs font-medium text-slate-700">{t("auth.verificationCode")}</span><input required inputMode="numeric" pattern="\d{6}" maxLength={6} value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, "")); setVerified(false); }} className={inputClass} /></label>
          {!verified && <button type="button" disabled={loading || code.length !== 6} onClick={() => void verifyCode()} className="rounded-xl border bg-white px-4 py-3 text-sm font-semibold text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"><CheckCircle2 className="me-2 inline size-4" />{t("auth.verifyCode")}</button>}
          {!verified && <button type="button" disabled={loading || resendCooldown > 0 || !identifier} onClick={() => void resendCode()} className="rounded-xl border bg-white px-4 py-3 text-sm font-semibold text-slate-900 disabled:bg-slate-100 disabled:text-slate-500">
            {resendCooldown > 0 ? `Kodu tekrar gönder (${resendCooldown})` : "Kodu tekrar gönder"}
          </button>}
          {verified && <>
            <label><span className="mb-2 block text-xs font-medium text-slate-700">{t("auth.newPassword")}</span><input required type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className={inputClass} /></label>
            <label><span className="mb-2 block text-xs font-medium text-slate-700">{t("auth.passwordConfirmation")}</span><input required type="password" minLength={12} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" className={inputClass} /></label>
            <p className="text-xs leading-5 text-slate-500">{t("auth.passwordPolicy")}</p>
          </>}
        </>}
        {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">{message}</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {(mode === "forgot" || verified) && <button disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white disabled:bg-orange-300 disabled:text-white">{loading ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{t(mode === "forgot" ? "auth.sendResetCode" : "auth.resetAction")}</button>}
      </form>
      <Link href="/login" className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-orange-600"><ArrowLeft className="size-4" />{t("auth.backToLogin")}</Link>
    </section>
  </main>;
}
