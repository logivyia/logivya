"use client";

import { ArrowLeft, ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { MIN_PASSWORD_LENGTH, validatePasswordPolicy } from "@logivya/validation/password-policy";

import { BrandLogo } from "@/components/brand-logo";
import { LanguageSelector } from "@/components/language-selector";
import { useI18n } from "@/i18n/provider";
import { apiErrorMessage } from "@/i18n/api-error";

type Mode = "login" | "register";
type MfaChallenge = {
  mfaRequired: true;
  mfaSetupRequired: boolean;
  expiresAt: string;
  secret?: string;
  qrCodeDataUrl?: string;
  recoveryCodes?: string[];
};
const loginFields = [{ name: "identifier", type: "text", required: true }, { name: "password", type: "password", required: true }] as const;
const registerFields = [
  { name: "name", type: "text", required: true },
  { name: "phone", type: "tel", required: true },
  { name: "email", type: "email", required: true },
  { name: "password", type: "password", required: true },
  { name: "passwordConfirmation", type: "password", required: true },
] as const;

const invitationMessages: Record<string, string> = {
  INVITATION_INVALID: "auth.invitationInvalid",
  INVITATION_EXPIRED: "auth.invitationExpired",
  INVITATION_EMAIL_MISMATCH: "auth.invitationEmailMismatch",
  INVITATION_ALREADY_USED: "auth.invitationAlreadyUsed",
  INVITATION_REVOKED: "auth.invitationRevoked",
  INVITATION_DECLINED: "auth.invitationDeclined",
  SEAT_LIMIT_REACHED: "auth.seatLimitReached",
  RATE_LIMITED: "auth.rateLimited",
};

const passwordMessageKeys = {
  PASSWORD_REQUIRED: "auth.passwordRequired",
  PASSWORD_TOO_SHORT: "auth.passwordTooShort",
  PASSWORD_INVALID_TYPE: "auth.passwordInvalidType",
} as const;

function AuthBrandPanel({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();

  return <div className={compact
    ? "flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-[#080d18] via-[#111827] to-[#1f2937] px-5 py-7 text-center lg:hidden"
    : "relative hidden min-h-[680px] place-items-center overflow-hidden bg-gradient-to-br from-[#080d18] via-[#111827] to-[#1f2937] p-12 lg:grid"
  }>
    {!compact && <><div className="absolute -start-28 -top-28 size-80 rounded-full bg-orange-500/10 blur-3xl" /><div className="absolute -bottom-36 -end-28 size-96 rounded-full bg-orange-500/10 blur-3xl" /></>}
    <div className="relative flex max-w-[420px] flex-col items-center justify-center text-center">
      <BrandLogo dark className={compact ? "w-[230px] max-w-[80%]" : "w-[340px] max-w-[80%]"} />
      <div className={compact ? "my-5 h-px w-16 bg-orange-400/70" : "my-9 h-px w-20 bg-orange-400/70"} />
      <p className={compact ? "max-w-sm text-base font-medium leading-6 text-white/85" : "max-w-[420px] text-[21px] font-medium leading-[1.5] text-white/85"}>
        {t("home.slogan")}
      </p>
    </div>
  </div>;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { t } = useI18n();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [invitationToken, setInvitationToken] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const fields = mode === "login" ? loginFields : registerFields;

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const invitation = search.get("invitation")?.trim() ?? "";
    if (invitation.length >= 32) queueMicrotask(() => setInvitationToken(invitation));
    if (mode === "login" && search.get("reset") === "success") {
      queueMicrotask(() => setSuccess(t("auth.resetCompleted")));
      window.history.replaceState({}, "", "/login");
    }
  }, [mode, t]);

  function browserFingerprint() {
    const key = "logivya.browserDeviceId";
    const current = localStorage.getItem(key);
    if (current) return current;
    const created = crypto.randomUUID();
    localStorage.setItem(key, created);
    return created;
  }

  async function finishLogin() {
    if (invitationToken) {
      const invitationResponse = await fetch(`/api/company/invitations/${encodeURIComponent(invitationToken)}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "ACCEPT" }),
      });
      const invitationResult = await invitationResponse.json();
      if (!invitationResponse.ok) {
        setError(t(invitationMessages[invitationResult.error] ?? invitationResult.error ?? "errors.generic"));
        return false;
      }
    }
    localStorage.removeItem("logivya.selectedGroupIds");
    router.push("/dashboard");
    router.refresh();
    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (mode === "register") {
      const policy = validatePasswordPolicy(body.password);
      if (!policy.valid) {
        setError(t(passwordMessageKeys[policy.code]));
        setLoading(false);
        return;
      }
      if (body.password !== body.passwordConfirmation) {
        setError(t("auth.passwordConfirmationMismatch"));
        setLoading(false);
        return;
      }
    }
    if (mode === "register" && invitationToken) body.invitationToken = invitationToken;
    if (mode === "login") {
      body.deviceFingerprint = browserFingerprint();
      body.deviceName = navigator.userAgent.includes("Mobile") ? "Mobile Web" : "Web Browser";
    }

    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(invitationMessages[result.error] ? t(invitationMessages[result.error]) : apiErrorMessage(t, result));
      setLoading(false);
      return;
    }

    if (mode === "login" && result.mfaRequired === true) {
      setMfaChallenge(result as MfaChallenge);
      setLoading(false);
      return;
    }

    await finishLogin();
    setLoading(false);
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/mfa/login/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: mfaCode, rememberDevice, deviceFingerprint: browserFingerprint(), deviceName: navigator.userAgent.includes("Mobile") ? "Mobile Web" : "Web Browser" }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(apiErrorMessage(t, result));
      setLoading(false);
      return;
    }
    await finishLogin();
    setLoading(false);
  }

  return <main className="auth-surface relative grid min-h-screen place-items-center p-4 sm:p-5">
    <div className="absolute end-4 top-4 z-10"><LanguageSelector /></div>
    <section className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border bg-white shadow-2xl lg:grid-cols-[.85fr_1.15fr]">
      <AuthBrandPanel />
      <div className="p-7 sm:p-12">
        <div className="mb-8 lg:hidden"><AuthBrandPanel compact /></div>
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-slate-950">{t(`auth.${mode}Title`)}</h1>
          <p className="mt-2 text-sm text-slate-600">{t(`auth.${mode}Description`)}</p>
          {invitationToken ? <p className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm font-medium text-orange-800">{t("auth.continueWithInvitation")}</p> : null}
        </div>
        {mfaChallenge ? <form className="grid gap-4" onSubmit={verifyMfa}>
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-orange-100 text-orange-700"><ShieldCheck className="size-5" /></span>
            <div><h2 className="text-xl font-semibold text-slate-950">{t(mfaChallenge.mfaSetupRequired ? "auth.mfaSetupTitle" : "auth.mfaTitle")}</h2><p className="mt-1 text-sm text-slate-600">{t(mfaChallenge.mfaSetupRequired ? "auth.mfaSetupDescription" : "auth.mfaDescription")}</p></div>
          </div>
          {mfaChallenge.qrCodeDataUrl ? <div className="mx-auto rounded-lg border border-slate-200 bg-white p-2"><Image unoptimized width={224} height={224} src={mfaChallenge.qrCodeDataUrl} alt={t("auth.mfaQrAlt")} className="size-56" /></div> : null}
          {mfaChallenge.secret ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-600">{t("auth.mfaManualKey")}</p><code className="mt-1 block break-all text-sm text-slate-950">{mfaChallenge.secret}</code></div> : null}
          {mfaChallenge.recoveryCodes?.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-900">{t("auth.mfaRecoveryCodes")}</p><p className="mt-1 text-xs text-amber-800">{t("auth.mfaRecoveryWarning")}</p><pre className="mt-3 grid grid-cols-2 gap-1 whitespace-pre-wrap font-mono text-xs text-amber-950">{mfaChallenge.recoveryCodes.join("\n")}</pre></div> : null}
          <label><span className="mb-2 block text-xs font-medium text-slate-700">{t("auth.mfaCode")}</span><input required autoFocus value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} autoComplete="one-time-code" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-center font-mono text-lg tracking-[.2em] text-slate-950 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100" /></label>
          <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} className="size-4 accent-orange-500" />{t("auth.mfaRememberDevice")}</label>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-danger">{error}</p>}
          <button disabled={loading || mfaCode.trim().length < 6} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white disabled:opacity-60">{loading ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}{t("auth.mfaVerify")}</button>
          <button type="button" onClick={() => { setMfaChallenge(null); setMfaCode(""); setError(""); }} className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft className="size-4" />{t("auth.mfaBack")}</button>
        </form> : <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          {fields.map((field) => <label key={field.name} className={mode === "login" ? "sm:col-span-2" : ""}>
            <span className="mb-2 block text-xs font-medium text-slate-700">{t(`auth.${field.name}`)}</span>
            <input
              required={field.required}
              name={field.name}
              type={field.type}
              minLength={mode === "register" && field.name === "password" ? MIN_PASSWORD_LENGTH : undefined}
              autoComplete={field.name === "password" && mode === "login" ? "current-password" : field.name.includes("password") ? "new-password" : field.name}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 caret-slate-950 placeholder:text-slate-400 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
            />
          </label>)}
          {mode === "register" && <p className="text-xs leading-5 text-slate-500 sm:col-span-2">{t("auth.passwordPolicy")}</p>}
          {mode === "login" && <div className="-mt-1 text-end sm:col-span-2"><Link className="text-sm font-semibold text-orange-600 hover:text-orange-700" href="/forgot-password">{t("auth.forgotPassword")}</Link></div>}
          {mode === "register" && <>
            <label><span className="mb-2 block text-xs font-medium text-slate-700">{t("auth.referralCode")}</span><input name="referralCode" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 caret-slate-950 placeholder:text-slate-400 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100" /></label>
            <div className="grid gap-2 text-xs text-slate-600 sm:col-span-2">
              <label><input required name="termsAccepted" type="checkbox" className="me-2" /><Link className="text-orange-600" href="/terms-of-service">{t("auth.terms")}</Link> {t("auth.acceptRequired")}</label>
              <label><input required name="privacyAccepted" type="checkbox" className="me-2" /><Link className="text-orange-600" href="/privacy-policy">{t("auth.privacy")}</Link> {t("auth.acceptRequired")}</label>
              <label><input required name="kvkkAccepted" type="checkbox" className="me-2" /><Link className="text-orange-600" href="/kvkk">{t("auth.dataProcessing")}</Link> {t("auth.acceptRequired")}</label>
            </div>
          </>}
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-danger sm:col-span-2">{error}</p>}
          {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700 sm:col-span-2">{success}</p>}
          <button disabled={loading} className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white disabled:opacity-60 sm:col-span-2">
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{t(`auth.${mode}Action`)}
          </button>
        </form>}
        <p className="mt-6 text-center text-sm text-slate-600">{t(`auth.${mode}Switch`)} <Link className="font-semibold text-orange-600" href={`${mode === "login" ? "/register" : "/login"}${invitationToken ? `?invitation=${encodeURIComponent(invitationToken)}` : ""}`}>{t(`auth.${mode}SwitchAction`)}</Link></p>
      </div>
    </section>
  </main>;
}
