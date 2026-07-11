"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { LanguageSelector } from "@/components/language-selector";
import { useI18n } from "@/i18n/provider";

type Mode = "login" | "register";
const loginFields = [{ name: "identifier", type: "text", required: true }, { name: "password", type: "password", required: true }] as const;
const registerFields = [
  { name: "name", type: "text", required: true },
  { name: "phone", type: "tel", required: true },
  { name: "email", type: "email", required: true },
  { name: "password", type: "password", required: true },
  { name: "passwordConfirmation", type: "password", required: true },
] as const;

const invitationMessages: Record<string, string> = {
  INVITATION_INVALID: "Davet geçersiz.",
  INVITATION_EXPIRED: "Davetin süresi dolmuş.",
  INVITATION_EMAIL_MISMATCH: "Bu davet farklı bir e-posta adresine ait.",
  INVITATION_ALREADY_USED: "Bu davet daha önce kullanılmış.",
  INVITATION_REVOKED: "Bu davet iptal edilmiş.",
  INVITATION_DECLINED: "Bu davet daha önce reddedilmiş.",
  SEAT_LIMIT_REACHED: "Şirkette kullanılabilir ekip koltuğu kalmamış.",
  RATE_LIMITED: "Çok fazla deneme yaptınız. Lütfen daha sonra tekrar deneyin.",
};

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
  const [invitationCode, setInvitationCode] = useState("");
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (mode === "register" && invitationToken) body.invitationToken = invitationToken;
    if (mode === "register" && !invitationToken && invitationCode.trim()) body.invitationCode = invitationCode.trim();

    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(invitationMessages[result.error] ?? t(result.error || "errors.generic"));
      setLoading(false);
      return;
    }

    if (mode === "login" && (invitationToken || invitationCode.trim())) {
      const invitationResponse = await fetch(invitationToken
        ? `/api/company/invitations/${encodeURIComponent(invitationToken)}/accept`
        : "/api/company/invitations/code/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(invitationToken ? { action: "ACCEPT" } : { code: invitationCode.trim() }),
      });
      const invitationResult = await invitationResponse.json();
      if (!invitationResponse.ok) {
        setError(invitationMessages[invitationResult.error] ?? t(invitationResult.error || "errors.generic"));
        setLoading(false);
        return;
      }
    }

    localStorage.removeItem("logivya.selectedGroupIds");
    router.push("/dashboard");
    router.refresh();
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
          {invitationToken ? <p className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm font-medium text-orange-800">Ekip davetiyle devam ediyorsunuz.</p> : null}
        </div>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          {!invitationToken ? <label className="sm:col-span-2">
            <span className="mb-2 block text-xs font-medium text-slate-700">Davet kodu (isteğe bağlı)</span>
            <input
              value={invitationCode}
              onChange={(event) => setInvitationCode(event.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="ABCD-EFGH-JKLM-NPQR"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 caret-slate-950 placeholder:text-slate-400 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
            />
          </label> : null}
          {fields.map((field) => <label key={field.name} className={mode === "login" ? "sm:col-span-2" : ""}>
            <span className="mb-2 block text-xs font-medium text-slate-700">{t(`auth.${field.name}`)}</span>
            <input
              required={field.required}
              name={field.name}
              type={field.type}
              autoComplete={field.name === "password" && mode === "login" ? "current-password" : field.name.includes("password") ? "new-password" : field.name}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 caret-slate-950 placeholder:text-slate-400 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
            />
          </label>)}
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
        </form>
        <p className="mt-6 text-center text-sm text-slate-600">{t(`auth.${mode}Switch`)} <Link className="font-semibold text-orange-600" href={`${mode === "login" ? "/register" : "/login"}${invitationToken ? `?invitation=${encodeURIComponent(invitationToken)}` : ""}`}>{t(`auth.${mode}SwitchAction`)}</Link></p>
      </div>
    </section>
  </main>;
}
