"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Copy,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";

import { apiErrorMessage } from "@/i18n/api-error";
import { useI18n } from "@/i18n/provider";
import { PasswordInput } from "@/components/password-input";

type SecurityStatus = {
  enabled: boolean;
  enabledAt?: string | null;
  setupInProgress: boolean;
  setupExpiresAt?: string | null;
  verifiedEmail: string;
  preferredMethod?: "TOTP" | "EMAIL_OTP" | null;
  methods: Array<{
    type: "TOTP" | "EMAIL_OTP";
    status:
      "PENDING" | "ENABLED" | "DISABLED" | "LOCKED" | "REQUIRES_REVERIFICATION";
    enabled: boolean;
    preferred: boolean;
  }>;
};

type Enrollment = {
  setupToken: string;
  expiresAt: string;
  secret: string;
  qrCodeDataUrl: string;
};

export function SecuritySettingsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<SecurityStatus | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [emailEnrollment, setEmailEnrollment] = useState<{
    setupToken: string;
    emailMasked: string;
  } | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [emailStepUpToken, setEmailStepUpToken] = useState("");
  const [totpEmailStepUpToken, setTotpEmailStepUpToken] = useState("");

  const load = useCallback(async () => {
    const statusResponse = await fetch("/api/auth/mfa/status", {
      cache: "no-store",
    });
    if (statusResponse.ok) setData(await statusResponse.json());
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function startEnrollment(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/auth/mfa/enroll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password: setupPassword,
        currentCode: data?.enabled ? currentCode : undefined,
      }),
    });
    const result = await response.json();
    if (response.ok) {
      setEnrollment(result);
      setRecoveryCodes([]);
      setCode("");
    } else setMessage(apiErrorMessage(t, result));
    setBusy(false);
  }

  async function confirmEnrollment(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/auth/mfa/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setupToken: enrollment?.setupToken, code }),
    });
    const result = await response.json();
    if (response.ok) {
      setRecoveryCodes(result.recoveryCodes || []);
      setEnrollment(null);
      setCode("");
      setSetupPassword("");
      setCurrentCode("");
      setMessage(t("security.enabledSuccess"));
      await load();
    } else setMessage(apiErrorMessage(t, result));
    setBusy(false);
  }

  async function cancelEnrollment() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/auth/mfa/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setupToken: enrollment?.setupToken }),
    });
    if (response.ok) {
      setEnrollment(null);
      setCode("");
      await load();
    } else setMessage(apiErrorMessage(t, await response.json()));
    setBusy(false);
  }

  async function disable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const values = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const response = await fetch("/api/auth/mfa/disable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = await response.json();
    if (response.ok) {
      setSetupPassword("");
      setCurrentCode("");
      setEmailCode("");
      setEmailStepUpToken("");
      setTotpEmailStepUpToken("");
      await load();
      setBusy(false);
      return;
    }
    setMessage(apiErrorMessage(t, result));
    setBusy(false);
  }

  async function startEmailEnrollment(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/auth/mfa/email/enroll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password: setupPassword,
        currentCode: currentCode || undefined,
      }),
    });
    const result = await response.json();
    if (response.ok) {
      setEmailEnrollment(result);
      setEmailCode("");
    } else setMessage(apiErrorMessage(t, result));
    setBusy(false);
  }

  async function confirmEmailEnrollment(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/auth/mfa/email/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setupToken: emailEnrollment?.setupToken,
        code: emailCode,
      }),
    });
    const result = await response.json();
    if (response.ok) {
      setEmailEnrollment(null);
      setEmailCode("");
      setSetupPassword("");
      setCurrentCode("");
      await load();
      setMessage(t("security.emailEnabledSuccess"));
    } else setMessage(apiErrorMessage(t, result));
    setBusy(false);
  }

  async function sendEmailStepUp(method: "TOTP" | "EMAIL_OTP") {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/auth/mfa/step-up/email/send", {
      method: "POST",
    });
    const result = await response.json();
    if (response.ok) {
      if (method === "TOTP") {
        setTotpEmailStepUpToken(result.challengeToken);
      } else {
        setEmailStepUpToken(result.challengeToken);
      }
      setMessage(t("security.emailCodeSent"));
    } else setMessage(apiErrorMessage(t, result));
    setBusy(false);
  }

  async function setPreferred(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const values = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const response = await fetch("/api/auth/mfa/preferred", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = await response.json();
    if (response.ok) {
      await load();
      setMessage(t("security.preferredUpdated"));
    } else setMessage(apiErrorMessage(t, result));
    setBusy(false);
  }

  if (!data)
    return <LoaderCircle className="size-6 animate-spin text-primary" />;
  const totpMethod = data.methods.find((method) => method.type === "TOTP");
  const emailMethod = data.methods.find(
    (method) => method.type === "EMAIL_OTP",
  );
  const totpEnabled = Boolean(totpMethod?.enabled);
  const emailEnabled = Boolean(emailMethod?.enabled);
  const methodStatus = (
    method: SecurityStatus["methods"][number] | undefined,
  ) => {
    if (method?.enabled) return t("security.enabled");
    if (method?.status === "PENDING") return t("security.pendingVerification");
    if (method?.status === "LOCKED") return t("security.locked");
    if (method?.status === "REQUIRES_REVERIFICATION")
      return t("security.requiresReverification");
    return t("security.disabled");
  };
  const securitySummary =
    totpEnabled && emailEnabled
      ? t("security.summaryBoth")
      : totpEnabled
        ? t("security.summaryTotp")
        : emailEnabled
          ? t("security.summaryEmail")
          : t("security.summaryPasswordOnly");
  return (
    <>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">
          {t("security.eyebrow")}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{t("security.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("security.description")}</p>
      </header>
      <div className="grid gap-6">
        <section className="rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">
                {t("security.loginSecurity")}
              </h2>
              <p className="mt-1 text-sm text-muted">{securitySummary}</p>
            </div>
          </div>
        </section>
        <section className="rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
                {totpEnabled ? (
                  <ShieldCheck className="size-5" />
                ) : (
                  <ShieldOff className="size-5" />
                )}
              </span>
              <div>
                <h2 className="text-lg font-semibold">
                  {t("security.authenticator")}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {methodStatus(totpMethod)}
                  {totpMethod?.preferred
                    ? ` · ${t("security.preferredMethod")}`
                    : ""}
                </p>
              </div>
            </div>
          </div>
          {!totpEnabled && !enrollment && !data.setupInProgress ? (
            <form
              onSubmit={startEnrollment}
              className="mt-6 grid gap-4 border-t pt-6 md:grid-cols-[1fr_auto] md:items-end"
            >
              <label>
                <span className="mb-2 block text-xs font-medium">
                  {t("auth.password")}
                </span>
                <PasswordInput
                  required
                  autoComplete="current-password"
                  value={setupPassword}
                  onChange={(event) => setSetupPassword(event.target.value)}
                  className="w-full rounded-xl border bg-input px-3 py-3 outline-none focus:border-primary"
                />
              </label>
              <button
                disabled={busy || !setupPassword}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                <KeyRound className="size-4" />
                {t("security.enable")}
              </button>
            </form>
          ) : null}
          {data.setupInProgress && !enrollment ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-6">
              <p className="text-sm text-muted">
                {t("auth.mfaSetupDescription")}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void cancelEnrollment()}
                className="rounded-xl border px-4 py-3 text-sm font-semibold"
              >
                {t("common.cancel")}
              </button>
            </div>
          ) : null}
          {enrollment ? (
            <form
              onSubmit={confirmEnrollment}
              className="mt-6 grid gap-5 border-t pt-6 md:grid-cols-[240px_1fr]"
            >
              <div className="rounded-lg bg-white p-2">
                <Image
                  unoptimized
                  src={enrollment.qrCodeDataUrl}
                  alt={t("auth.mfaQrAlt")}
                  width={224}
                  height={224}
                  className="size-56"
                />
              </div>
              <div className="grid content-start gap-4">
                <div>
                  <p className="text-xs font-semibold text-muted">
                    {t("auth.mfaManualKey")}
                  </p>
                  <code className="mt-1 block break-all rounded-lg bg-input p-3 text-sm">
                    {enrollment.secret}
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      void navigator.clipboard.writeText(enrollment.secret)
                    }
                    className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-primary"
                  >
                    <Copy className="size-4" />
                    {t("security.copyCodes")}
                  </button>
                </div>
                <label>
                  <span className="mb-2 block text-xs font-medium">
                    {t("auth.mfaCode")}
                  </span>
                  <input
                    required
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(event) =>
                      setCode(
                        event.target.value.replace(/\D/gu, "").slice(0, 6),
                      )
                    }
                    autoComplete="one-time-code"
                    className="w-full rounded-xl border bg-input px-3 py-3 font-mono text-lg outline-none focus:border-primary"
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button
                    disabled={busy || code.length !== 6}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    <ShieldCheck className="size-4" />
                    {t("security.confirmEnable")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancelEnrollment()}
                    className="rounded-xl border px-4 py-3 text-sm font-semibold"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            </form>
          ) : null}
          {recoveryCodes.length > 0 ? (
            <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <div className="flex items-center gap-2">
                <KeyRound className="size-5" />
                <h3 className="font-semibold">{t("auth.mfaRecoveryCodes")}</h3>
              </div>
              <p className="mt-2 text-sm">{t("auth.mfaRecoveryWarning")}</p>
              <pre className="mt-4 grid grid-cols-1 gap-1 whitespace-pre-wrap font-mono text-sm sm:grid-cols-2">
                {recoveryCodes.join("\n")}
              </pre>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard.writeText(recoveryCodes.join("\n"))
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-400 px-4 py-2 text-sm font-semibold"
                >
                  <Copy className="size-4" />
                  {t("security.copyCodes")}
                </button>
                <button
                  type="button"
                  onClick={() => setRecoveryCodes([])}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                >
                  {t("common.continue")}
                </button>
              </div>
            </div>
          ) : null}
          {totpEnabled ? (
            <form
              onSubmit={disable}
              className="mt-6 grid gap-4 border-t pt-6 md:grid-cols-2"
            >
              <input type="hidden" name="method" value="TOTP" />
              <input
                type="hidden"
                name="verificationMethod"
                value={emailEnabled ? "EMAIL_OTP" : "TOTP"}
              />
              <input
                type="hidden"
                name="stepUpToken"
                value={totpEmailStepUpToken}
              />
              <label>
                <span className="mb-2 block text-xs font-medium">
                  {t("auth.password")}
                </span>
                <PasswordInput
                  required
                  name="password"
                  autoComplete="current-password"
                  className="w-full rounded-xl border bg-input px-3 py-3 outline-none focus:border-primary"
                />
              </label>
              {!emailEnabled || totpEmailStepUpToken ? (
                <label>
                  <span className="mb-2 block text-xs font-medium">
                    {t("auth.mfaCode")}
                  </span>
                  <input
                    required
                    name="code"
                    inputMode={totpEmailStepUpToken ? "numeric" : undefined}
                    maxLength={totpEmailStepUpToken ? 6 : 64}
                    className="w-full rounded-xl border bg-input px-3 py-3 font-mono outline-none focus:border-primary"
                  />
                </label>
              ) : null}
              {emailEnabled && !totpEmailStepUpToken ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void sendEmailStepUp("TOTP")}
                  className="w-fit rounded-xl border px-4 py-3 font-semibold md:col-span-2"
                >
                  {t("security.sendEmailCode")}
                </button>
              ) : (
                <button
                  disabled={busy}
                  className="inline-flex w-fit items-center gap-2 rounded-xl border border-red-300 px-4 py-3 text-sm font-semibold text-danger disabled:opacity-60 md:col-span-2"
                >
                  <ShieldOff className="size-4" />
                  {t("security.disable")}
                </button>
              )}
            </form>
          ) : null}
          {totpEnabled && emailEnabled && data.preferredMethod !== "TOTP" ? (
            <form
              onSubmit={setPreferred}
              className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-3"
            >
              <input type="hidden" name="method" value="TOTP" />
              <PasswordInput
                required
                name="password"
                autoComplete="current-password"
                placeholder={t("auth.password")}
                className="rounded-xl border bg-input px-3 py-3"
              />
              <input
                required
                name="currentCode"
                placeholder={t("auth.mfaCode")}
                className="rounded-xl border bg-input px-3 py-3"
              />
              <button className="rounded-xl border px-4 py-3 font-semibold">
                {t("security.makePreferred")}
              </button>
            </form>
          ) : null}
        </section>

        <section className="rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)]">
          <div className="flex gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
              {emailEnabled ? (
                <ShieldCheck className="size-5" />
              ) : (
                <ShieldOff className="size-5" />
              )}
            </span>
            <div>
              <h2 className="text-lg font-semibold">
                {t("security.emailVerification")}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {methodStatus(emailMethod)}
                {emailMethod?.preferred
                  ? ` · ${t("security.preferredMethod")}`
                  : ""}{" "}
                · {data.verifiedEmail}
              </p>
            </div>
          </div>
          {!emailEnabled && !emailEnrollment ? (
            <form
              onSubmit={startEmailEnrollment}
              className="mt-6 grid gap-4 border-t pt-6 md:grid-cols-2"
            >
              <label>
                <span className="mb-2 block text-xs font-medium">
                  {t("auth.password")}
                </span>
                <PasswordInput
                  required
                  autoComplete="current-password"
                  value={setupPassword}
                  onChange={(event) => setSetupPassword(event.target.value)}
                  className="w-full rounded-xl border bg-input px-3 py-3"
                />
              </label>
              {totpEnabled ? (
                <label>
                  <span className="mb-2 block text-xs font-medium">
                    {t("auth.mfaCode")}
                  </span>
                  <input
                    required
                    value={currentCode}
                    onChange={(event) =>
                      setCurrentCode(
                        event.target.value.replace(/\D/gu, "").slice(0, 6),
                      )
                    }
                    className="w-full rounded-xl border bg-input px-3 py-3"
                  />
                </label>
              ) : null}
              <button
                disabled={
                  busy ||
                  !setupPassword ||
                  (totpEnabled && currentCode.length !== 6)
                }
                className="w-fit rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground"
              >
                {t("security.enable")}
              </button>
            </form>
          ) : null}
          {emailEnrollment ? (
            <form
              onSubmit={confirmEmailEnrollment}
              className="mt-6 grid gap-4 border-t pt-6"
            >
              <p className="text-sm text-muted">
                {t("security.emailCodeSent")} {emailEnrollment.emailMasked}
              </p>
              <input
                required
                inputMode="numeric"
                maxLength={6}
                value={emailCode}
                onChange={(event) =>
                  setEmailCode(
                    event.target.value.replace(/\D/gu, "").slice(0, 6),
                  )
                }
                className="w-full rounded-xl border bg-input px-3 py-3 font-mono md:max-w-sm"
              />
              <button
                disabled={busy || emailCode.length !== 6}
                className="w-fit rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground"
              >
                {t("security.confirmEnable")}
              </button>
            </form>
          ) : null}
          {emailEnabled ? (
            <form
              onSubmit={disable}
              className="mt-6 grid gap-4 border-t pt-6 md:grid-cols-2"
            >
              <input type="hidden" name="method" value="EMAIL_OTP" />
              <input
                type="hidden"
                name="verificationMethod"
                value="EMAIL_OTP"
              />
              <input
                type="hidden"
                name="stepUpToken"
                value={emailStepUpToken}
              />
              <label>
                <span className="mb-2 block text-xs font-medium">
                  {t("auth.password")}
                </span>
                <PasswordInput
                  required
                  name="password"
                  autoComplete="current-password"
                  className="w-full rounded-xl border bg-input px-3 py-3"
                />
              </label>
              {emailStepUpToken ? (
                <label>
                  <span className="mb-2 block text-xs font-medium">
                    {t("auth.mfaCode")}
                  </span>
                  <input
                    required
                    name="code"
                    inputMode="numeric"
                    maxLength={6}
                    className="w-full rounded-xl border bg-input px-3 py-3 font-mono"
                  />
                </label>
              ) : null}
              {!emailStepUpToken ? (
                <button
                  type="button"
                  onClick={() => void sendEmailStepUp("EMAIL_OTP")}
                  className="w-fit rounded-xl border px-4 py-3 font-semibold"
                >
                  {t("security.sendEmailCode")}
                </button>
              ) : (
                <button
                  disabled={busy}
                  className="w-fit rounded-xl border border-red-300 px-4 py-3 font-semibold text-danger"
                >
                  {t("security.disable")}
                </button>
              )}
            </form>
          ) : null}
          {emailEnabled &&
          totpEnabled &&
          data.preferredMethod !== "EMAIL_OTP" ? (
            <form
              onSubmit={setPreferred}
              className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-3"
            >
              <input type="hidden" name="method" value="EMAIL_OTP" />
              <PasswordInput
                required
                name="password"
                autoComplete="current-password"
                placeholder={t("auth.password")}
                className="rounded-xl border bg-input px-3 py-3"
              />
              <input
                required
                name="currentCode"
                placeholder={t("auth.mfaCode")}
                className="rounded-xl border bg-input px-3 py-3"
              />
              <button className="rounded-xl border px-4 py-3 font-semibold">
                {t("security.makePreferred")}
              </button>
            </form>
          ) : null}
        </section>

        {message ? (
          <p role="status" className="rounded-xl border bg-card p-4 text-sm">
            {message}
          </p>
        ) : null}
      </div>
    </>
  );
}
