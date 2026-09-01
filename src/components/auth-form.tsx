"use client";

import { ArrowLeft, ArrowRight, Copy, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { MIN_PASSWORD_LENGTH, validatePasswordPolicy } from "@logivya/validation/password-policy";

import { BrandLogo } from "@/components/brand-logo";
import { LanguageSelector } from "@/components/language-selector";
import { PasswordInput } from "@/components/password-input";
import { SocialLoginButtons, type WebSocialProvider } from "@/components/social-login-buttons";
import { useI18n } from "@/i18n/provider";
import { apiErrorMessage } from "@/i18n/api-error";

type Mode = "login" | "register";
type MfaChallenge = {
  mfaRequired: true;
  mfaSetupRequired: boolean;
  expiresAt: string;
  setupToken?: string;
  secret?: string;
  qrCodeDataUrl?: string;
  availableMethods: Array<"TOTP" | "EMAIL_OTP">;
  selectedMethod?: "TOTP" | "EMAIL_OTP" | null;
  preferredMethod?: "TOTP" | "EMAIL_OTP" | null;
  emailMasked?: string;
  recoveryAvailable?: boolean;
};
type PasswordChangeChallenge = {
  passwordChangeRequired: true;
  challengeToken: string;
  expiresAt: string;
};

type AuthApiResult = Record<string, unknown> & {
  error?: unknown;
  code?: unknown;
  message?: unknown;
};

async function fetchAuthJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const result = await response.json().catch(() => ({ error: "AUTH_INTERNAL_ERROR" })) as AuthApiResult;
  return { response, result };
}

function authResultCode(result: AuthApiResult) {
  if (typeof result.code === "string") return result.code;
  if (typeof result.error === "string") return result.error;
  if (result.error && typeof result.error === "object" && "code" in result.error) {
    const code = (result.error as { code?: unknown }).code;
    return typeof code === "string" ? code : "";
  }
  return "";
}

export function normalizeMfaLoginCode(value: string, setupRequired: boolean) {
  if (setupRequired) return value.replace(/\D/gu, "").slice(0, 6);
  return value.toUpperCase().replace(/[^A-Z0-9-]/gu, "").slice(0, 64);
}

export function isMfaLoginCodeReady(value: string, setupRequired: boolean) {
  const normalized = value.trim();
  if (setupRequired) return /^\d{6}$/u.test(normalized);
  return /^\d{6}$/u.test(normalized) || normalized.replace(/-/gu, "").length >= 16;
}

async function copySensitiveText(value: string) {
  await navigator.clipboard.writeText(value);
  window.setTimeout(() => {
    void navigator.clipboard.readText().then((current) => current === value ? navigator.clipboard.writeText("") : undefined).catch(() => undefined);
  }, 60_000);
}
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
  const [socialLoading, setSocialLoading] = useState(false);
  const [invitationToken, setInvitationToken] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState<string[]>([]);
  const [passwordChangeChallenge, setPasswordChangeChallenge] = useState<PasswordChangeChallenge | null>(null);
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
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

  useEffect(() => {
    if (mode !== "login" || mfaChallenge) return;
    const controller = new AbortController();
    void fetchAuthJson("/api/auth/mfa/login/status", { signal: controller.signal })
      .then(({ response, result }) => {
        if (response.ok && result.mfaRequired === true) setMfaChallenge(result as MfaChallenge);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [mfaChallenge, mode]);

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
      const { response: invitationResponse, result: invitationResult } = await fetchAuthJson(`/api/company/invitations/${encodeURIComponent(invitationToken)}/accept`, {
        method: "POST",
        body: JSON.stringify({ action: "ACCEPT" }),
      });
      if (!invitationResponse.ok) {
        const code = authResultCode(invitationResult);
        setError(t(invitationMessages[code] ?? "errors.generic"));
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
      setLoginIdentifier(String(body.identifier ?? ""));
      setTemporaryPassword(String(body.password ?? ""));
    }

    try {
      const { response, result } = await fetchAuthJson(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const code = authResultCode(result);
        setError(invitationMessages[code] ? t(invitationMessages[code]) : apiErrorMessage(t, result));
        return;
      }

      if (mode === "login" && result.mfaRequired === true) {
        setMfaChallenge(result as MfaChallenge);
        return;
      }
      if (mode === "login" && result.passwordChangeRequired === true) {
        setPasswordChangeChallenge(result as PasswordChangeChallenge);
        return;
      }

      await finishLogin();
    } catch {
      setError(t("api.error.authInternal"));
    } finally {
      setLoading(false);
    }
  }

  async function submitSocialCredential(provider: WebSocialProvider, identityToken: string, nonce?: string) {
    setSocialLoading(true);
    setError("");
    try {
      const { response, result } = await fetchAuthJson("/api/auth/social", {
        method: "POST",
        body: JSON.stringify({
          provider,
          identityToken,
          nonce,
          deviceFingerprint: browserFingerprint(),
          deviceName: navigator.userAgent.includes("Mobile") ? "Mobile Web" : "Web Browser",
        }),
      });
      if (!response.ok) {
        setError(apiErrorMessage(t, result));
        return;
      }
      if (result.mfaRequired === true) {
        setMfaChallenge(result as MfaChallenge);
        return;
      }
      await finishLogin();
    } finally {
      setSocialLoading(false);
    }
  }

  async function changeTemporaryPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordChangeChallenge) return;
    setLoading(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const newPassword = String(body.newPassword ?? "");
    const newPasswordConfirmation = String(body.newPasswordConfirmation ?? "");
    const policy = validatePasswordPolicy(newPassword);
    if (!policy.valid) {
      setError(t(passwordMessageKeys[policy.code]));
      setLoading(false);
      return;
    }
    if (newPassword !== newPasswordConfirmation) {
      setError(t("auth.passwordConfirmationMismatch"));
      setLoading(false);
      return;
    }
    try {
      const changed = await fetchAuthJson("/api/auth/temporary-password", {
        method: "POST",
        body: JSON.stringify({
          challengeToken: passwordChangeChallenge.challengeToken,
          temporaryPassword,
          newPassword,
          newPasswordConfirmation,
        }),
      });
      if (!changed.response.ok) {
        setError(apiErrorMessage(t, changed.result));
        return;
      }

      const relogin = await fetchAuthJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          identifier: loginIdentifier,
          password: newPassword,
          deviceFingerprint: browserFingerprint(),
          deviceName: navigator.userAgent.includes("Mobile") ? "Mobile Web" : "Web Browser",
        }),
      });
      setTemporaryPassword("");
      setPasswordChangeChallenge(null);
      if (!relogin.response.ok) {
        setError(apiErrorMessage(t, relogin.result));
        return;
      }
      if (relogin.result.mfaRequired === true) {
        setMfaChallenge(relogin.result as MfaChallenge);
        return;
      }
      await finishLogin();
    } catch {
      setError(t("api.error.authInternal"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { response, result } = await fetchAuthJson("/api/auth/mfa/login/verify", {
        method: "POST",
        body: JSON.stringify({ code: mfaCode, rememberDevice, setupToken: mfaChallenge?.setupToken, deviceFingerprint: browserFingerprint(), deviceName: navigator.userAgent.includes("Mobile") ? "Mobile Web" : "Web Browser" }),
      });
      if (!response.ok) {
        const code = authResultCode(result);
        setError(apiErrorMessage(t, result));
        if (code === "AUTH_MFA_CHALLENGE_EXPIRED") {
          setMfaChallenge(null);
          setMfaCode("");
        }
        return;
      }
      if (Array.isArray(result.recoveryCodes) && result.recoveryCodes.length) {
        setMfaRecoveryCodes(result.recoveryCodes as string[]);
        return;
      }
      await finishLogin();
    } catch {
      setError(t("api.error.authInternal"));
    } finally {
      setLoading(false);
    }
  }

  async function selectMfaMethod(method: "TOTP" | "EMAIL_OTP") {
    setLoading(true); setError(""); setMfaCode("");
    try {
      const { response, result } = await fetchAuthJson("/api/auth/mfa/login/select", { method: "POST", body: JSON.stringify({ method }) });
      if (response.ok) setMfaChallenge((current) => current ? { ...current, ...result, selectedMethod: method } : current);
      else setError(apiErrorMessage(t, result));
    } catch {
      setError(t("api.error.authInternal"));
    } finally {
      setLoading(false);
    }
  }

  async function resendEmailCode() {
    setLoading(true); setError("");
    try {
      const { response, result } = await fetchAuthJson("/api/auth/mfa/login/email/send", { method: "POST" });
      if (response.ok && typeof result.emailMasked === "string") {
        setMfaChallenge((current) => current ? { ...current, emailMasked: result.emailMasked as string } : current);
      } else {
        setError(apiErrorMessage(t, result));
      }
    } catch {
      setError(t("api.error.authInternal"));
    } finally {
      setLoading(false);
    }
  }

  return <main className="auth-surface relative grid min-h-screen place-items-center p-4 sm:p-5">
    <div className="absolute end-4 top-4 z-10"><LanguageSelector /></div>
    <section className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border bg-white shadow-2xl lg:grid-cols-[.85fr_1.15fr]">
      <AuthBrandPanel />
      <div className="p-7 sm:p-12">
        <div className="mb-8 lg:hidden"><AuthBrandPanel compact /></div>
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-slate-950">{t(passwordChangeChallenge ? "auth.passwordChangeTitle" : `auth.${mode}Title`)}</h1>
          <p className="mt-2 text-sm text-slate-600">{t(passwordChangeChallenge ? "auth.passwordChangeDescription" : `auth.${mode}Description`)}</p>
          {invitationToken ? <p className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm font-medium text-orange-800">{t("auth.continueWithInvitation")}</p> : null}
        </div>
        {passwordChangeChallenge ? <form className="grid gap-4" onSubmit={changeTemporaryPassword}>
          <label><span className="mb-2 block text-xs font-medium text-slate-700">{t("auth.temporaryPassword")}</span><PasswordInput required readOnly value={temporaryPassword} autoComplete="current-password" className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-950" /></label>
          <label><span className="mb-2 block text-xs font-medium text-slate-700">{t("auth.newPassword")}</span><PasswordInput required name="newPassword" minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100" /></label>
          <label><span className="mb-2 block text-xs font-medium text-slate-700">{t("auth.newPasswordConfirmation")}</span><PasswordInput required name="newPasswordConfirmation" minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100" /></label>
          <p className="text-xs leading-5 text-slate-500">{t("auth.passwordPolicy")}</p>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-danger">{error}</p>}
          <button disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white disabled:opacity-60">{loading ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}{t("auth.changePasswordAndContinue")}</button>
        </form> : mfaChallenge ? <form className="grid gap-4" onSubmit={verifyMfa}>
          {mfaRecoveryCodes.length ? <>
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-emerald-100 text-emerald-700"><ShieldCheck className="size-5" /></span>
              <div><h2 className="text-xl font-semibold text-slate-950">{t("auth.mfaRecoveryCodes")}</h2><p className="mt-1 text-sm text-slate-600">{t("auth.mfaRecoveryWarning")}</p></div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><pre className="grid grid-cols-1 gap-1 whitespace-pre-wrap font-mono text-xs text-amber-950 sm:grid-cols-2">{mfaRecoveryCodes.join("\n")}</pre></div>
            <button type="button" onClick={() => void copySensitiveText(mfaRecoveryCodes.join("\n"))} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700"><Copy className="size-4" />{t("security.copyCodes")}</button>
            <button type="button" onClick={() => void finishLogin()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white"><ArrowRight className="size-4" />{t("common.continue")}</button>
          </> : <>
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-orange-100 text-orange-700"><ShieldCheck className="size-5" /></span>
            <div><h2 className="text-xl font-semibold text-slate-950">{t(mfaChallenge.mfaSetupRequired ? "auth.mfaSetupTitle" : "auth.mfaTitle")}</h2><p className="mt-1 text-sm text-slate-600">{t(mfaChallenge.mfaSetupRequired ? "auth.mfaSetupDescription" : "auth.mfaDescription")}</p></div>
          </div>
          {!mfaChallenge.selectedMethod ? <div className="grid gap-2">
            <p className="text-sm font-semibold text-slate-700">{t("auth.mfaChooseMethod")}</p>
            {mfaChallenge.availableMethods.map((method) => <button key={method} type="button" disabled={loading} onClick={() => void selectMfaMethod(method)} className="rounded-xl border border-slate-300 px-4 py-3 text-start font-semibold text-slate-800 hover:border-orange-400">{t(method === "TOTP" ? "auth.mfaAuthenticatorMethod" : "auth.mfaEmailMethod")}</button>)}
          </div> : null}
          {mfaChallenge.qrCodeDataUrl ? <div className="mx-auto rounded-lg border border-slate-200 bg-white p-2"><Image unoptimized width={224} height={224} src={mfaChallenge.qrCodeDataUrl} alt={t("auth.mfaQrAlt")} className="size-56" /></div> : null}
          {mfaChallenge.secret ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-600">{t("auth.mfaManualKey")}</p><code className="mt-1 block break-all text-sm text-slate-950">{mfaChallenge.secret}</code></div> : null}
          {mfaChallenge.selectedMethod ? <>
          {mfaChallenge.selectedMethod === "EMAIL_OTP" && mfaChallenge.emailMasked ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{t("auth.mfaEmailSent", { email: mfaChallenge.emailMasked })}</p> : null}
          <label><span className="mb-2 block text-xs font-medium text-slate-700">{t("auth.mfaCode")}</span><input required autoFocus inputMode={mfaChallenge.selectedMethod === "EMAIL_OTP" || mfaChallenge.mfaSetupRequired ? "numeric" : "text"} pattern={mfaChallenge.selectedMethod === "EMAIL_OTP" || mfaChallenge.mfaSetupRequired ? "[0-9]{6}" : undefined} maxLength={mfaChallenge.selectedMethod === "EMAIL_OTP" || mfaChallenge.mfaSetupRequired ? 6 : 64} value={mfaCode} onChange={(event) => setMfaCode(normalizeMfaLoginCode(event.target.value, mfaChallenge.selectedMethod === "EMAIL_OTP" || mfaChallenge.mfaSetupRequired))} autoComplete="one-time-code" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-center font-mono text-lg text-slate-950 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100" /></label>
          {mfaChallenge.availableMethods.length > 1 ? <div className="flex flex-wrap gap-2">{mfaChallenge.availableMethods.filter((method) => method !== mfaChallenge.selectedMethod).map((method) => <button key={method} type="button" disabled={loading} onClick={() => void selectMfaMethod(method)} className="text-sm font-semibold text-orange-700">{t("auth.mfaUseAnotherMethod")}: {t(method === "TOTP" ? "auth.mfaAuthenticatorMethod" : "auth.mfaEmailMethod")}</button>)}</div> : null}
          {mfaChallenge.selectedMethod === "EMAIL_OTP" ? <button type="button" disabled={loading} onClick={() => void resendEmailCode()} className="text-sm font-semibold text-orange-700">{t("auth.mfaResendEmail")}</button> : null}
          <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} className="size-4 accent-orange-500" />{t("auth.mfaRememberDevice")}</label>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-danger">{error}</p>}
          <button disabled={loading || !isMfaLoginCodeReady(mfaCode, mfaChallenge.selectedMethod === "EMAIL_OTP" || mfaChallenge.mfaSetupRequired)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white disabled:opacity-60">{loading ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}{t("auth.mfaVerify")}</button>
          </> : null}
          <button type="button" onClick={() => { setMfaChallenge(null); setMfaCode(""); setError(""); setMfaRecoveryCodes([]); }} className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft className="size-4" />{t("auth.mfaBack")}</button>
          </>}
        </form> : <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          {fields.map((field) => <label key={field.name} className={mode === "login" ? "sm:col-span-2" : ""}>
            <span className="mb-2 block text-xs font-medium text-slate-700">{t(`auth.${field.name}`)}</span>
            {field.type === "password" ? <PasswordInput
              required={field.required}
              name={field.name}
              minLength={mode === "register" && field.name === "password" ? MIN_PASSWORD_LENGTH : undefined}
              autoComplete={field.name === "password" && mode === "login" ? "current-password" : "new-password"}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 caret-slate-950 placeholder:text-slate-400 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
            /> : <input
              required={field.required}
              name={field.name}
              type={field.type}
              autoComplete={field.name}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 caret-slate-950 placeholder:text-slate-400 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
            />}
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
        {mode === "login" && !mfaChallenge && !passwordChangeChallenge ? <SocialLoginButtons
          disabled={loading || socialLoading}
          onCredential={submitSocialCredential}
          onError={() => setError(t("auth.socialProviderUnavailable"))}
        /> : null}
        <p className="mt-6 text-center text-sm text-slate-600">{t(`auth.${mode}Switch`)} <Link className="font-semibold text-orange-600" href={`${mode === "login" ? "/register" : "/login"}${invitationToken ? `?invitation=${encodeURIComponent(invitationToken)}` : ""}`}>{t(`auth.${mode}SwitchAction`)}</Link></p>
      </div>
    </section>
  </main>;
}
