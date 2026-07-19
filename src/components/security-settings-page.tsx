"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, LoaderCircle, LogOut, RefreshCw, ShieldCheck, ShieldOff, Smartphone, Trash2 } from "lucide-react";

import { apiErrorMessage } from "@/i18n/api-error";
import { useI18n } from "@/i18n/provider";

type SecurityStatus = {
  enabled: boolean;
  required: boolean;
  enabledAt?: string | null;
  recoveryCodesRemaining: number;
  setupInProgress: boolean;
  setupExpiresAt?: string | null;
  trustedDevices: Array<{ id: string; deviceName?: string | null; ipAddress: string; trustedAt: string; lastUsedAt?: string | null; expiresAt: string }>;
  recentEvents: Array<{ id: string; type: string; severity: string; message: string; ipAddress?: string | null; createdAt: string }>;
};

type Enrollment = { setupToken: string; expiresAt: string; secret: string; qrCodeDataUrl: string };
type SecuritySession = { id: string; kind: "WEB" | "MOBILE"; deviceName: string; ipAddress?: string | null; lastActiveAt: string; expiresAt: string; current: boolean };

export function SecuritySettingsPage() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<SecurityStatus | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [setupPassword, setSetupPassword] = useState("");
  const [currentCode, setCurrentCode] = useState("");

  const load = useCallback(async () => {
    const [statusResponse, sessionsResponse] = await Promise.all([
      fetch("/api/auth/mfa/status", { cache: "no-store" }),
      fetch("/api/auth/sessions", { cache: "no-store" }),
    ]);
    if (statusResponse.ok) setData(await statusResponse.json());
    if (sessionsResponse.ok) setSessions((await sessionsResponse.json()).sessions || []);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function startEnrollment(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true); setMessage("");
    const response = await fetch("/api/auth/mfa/enroll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: setupPassword, currentCode: data?.enabled ? currentCode : undefined }),
    });
    const result = await response.json();
    if (response.ok) { setEnrollment(result); setRecoveryCodes([]); setCode(""); }
    else setMessage(apiErrorMessage(t, result));
    setBusy(false);
  }

  async function confirmEnrollment(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const response = await fetch("/api/auth/mfa/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ setupToken: enrollment?.setupToken, code }) });
    const result = await response.json();
    if (response.ok) { setRecoveryCodes(result.recoveryCodes || []); setEnrollment(null); setCode(""); setSetupPassword(""); setCurrentCode(""); setMessage(t("security.enabledSuccess")); await load(); }
    else setMessage(apiErrorMessage(t, result));
    setBusy(false);
  }

  async function cancelEnrollment() {
    setBusy(true); setMessage("");
    const response = await fetch("/api/auth/mfa/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setupToken: enrollment?.setupToken }),
    });
    if (response.ok) { setEnrollment(null); setCode(""); await load(); }
    else setMessage(apiErrorMessage(t, await response.json()));
    setBusy(false);
  }

  async function disable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/auth/mfa/disable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) });
    const result = await response.json();
    if (response.ok) { window.location.assign("/login"); return; }
    setMessage(apiErrorMessage(t, result)); setBusy(false);
  }

  async function regenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/auth/mfa/recovery-codes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) });
    const result = await response.json();
    if (response.ok) { setRecoveryCodes(result.recoveryCodes); setMessage(t("security.recoveryRegenerated")); await load(); }
    else setMessage(apiErrorMessage(t, result));
    setBusy(false);
  }

  async function revokeDevice(id: string) {
    setBusy(true);
    const response = await fetch(`/api/auth/mfa/trusted-devices/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) await load();
    else setMessage(apiErrorMessage(t, await response.json()));
    setBusy(false);
  }

  async function revokeSession(session: SecuritySession) {
    setBusy(true); setMessage("");
    const response = await fetch(`/api/auth/sessions/${session.kind}/${encodeURIComponent(session.id)}`, { method: "DELETE" });
    if (response.ok) {
      const result = await response.json();
      if (result.currentRevoked) { window.location.assign("/login"); return; }
      await load();
    } else setMessage(apiErrorMessage(t, await response.json()));
    setBusy(false);
  }

  async function logoutEverywhere() {
    setBusy(true); setMessage("");
    const response = await fetch("/api/auth/sessions", { method: "DELETE" });
    if (response.ok) { window.location.assign("/login"); return; }
    setMessage(apiErrorMessage(t, await response.json())); setBusy(false);
  }

  if (!data) return <LoaderCircle className="size-6 animate-spin text-primary" />;
  return <>
    <header className="mb-7"><p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{t("security.eyebrow")}</p><h1 className="mt-2 text-3xl font-semibold">{t("security.title")}</h1><p className="mt-2 text-sm text-muted">{t("security.description")}</p></header>
    <div className="grid gap-6">
      <section className="rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">{data.enabled ? <ShieldCheck className="size-5" /> : <ShieldOff className="size-5" />}</span><div><h2 className="text-lg font-semibold">{t("security.authenticator")}</h2><p className="mt-1 text-sm text-muted">{t(data.enabled ? "security.enabled" : "security.disabled")}</p></div></div></div>
        {!data.enabled && !enrollment && !data.setupInProgress ? <form onSubmit={startEnrollment} className="mt-6 grid gap-4 border-t pt-6 md:grid-cols-[1fr_auto] md:items-end"><label><span className="mb-2 block text-xs font-medium">{t("auth.password")}</span><input required type="password" autoComplete="current-password" value={setupPassword} onChange={(event) => setSetupPassword(event.target.value)} className="w-full rounded-xl border bg-input px-3 py-3 outline-none focus:border-primary" /></label><button disabled={busy || !setupPassword} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"><KeyRound className="size-4" />{t("security.enable")}</button></form> : null}
        {data.setupInProgress && !enrollment ? <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-6"><p className="text-sm text-muted">{t("auth.mfaSetupDescription")}</p><button type="button" disabled={busy} onClick={() => void cancelEnrollment()} className="rounded-xl border px-4 py-3 text-sm font-semibold">{t("common.cancel")}</button></div> : null}
        {data.enabled && !enrollment ? <form onSubmit={startEnrollment} className="mt-6 grid gap-4 border-t pt-6 md:grid-cols-2"><label><span className="mb-2 block text-xs font-medium">{t("auth.password")}</span><input required type="password" autoComplete="current-password" value={setupPassword} onChange={(event) => setSetupPassword(event.target.value)} className="w-full rounded-xl border bg-input px-3 py-3 outline-none focus:border-primary" /></label><label><span className="mb-2 block text-xs font-medium">{t("auth.mfaCode")}</span><input required inputMode="numeric" maxLength={6} value={currentCode} onChange={(event) => setCurrentCode(event.target.value.replace(/\D/gu, "").slice(0, 6))} className="w-full rounded-xl border bg-input px-3 py-3 font-mono outline-none focus:border-primary" /></label><button disabled={busy || !setupPassword || currentCode.length !== 6} className="inline-flex w-fit items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-60 md:col-span-2"><RefreshCw className="size-4" />{t("security.confirmEnable")}</button></form> : null}
        {enrollment ? <form onSubmit={confirmEnrollment} className="mt-6 grid gap-5 border-t pt-6 md:grid-cols-[240px_1fr]">
          <div className="rounded-lg bg-white p-2"><Image unoptimized src={enrollment.qrCodeDataUrl} alt={t("auth.mfaQrAlt")} width={224} height={224} className="size-56" /></div>
          <div className="grid content-start gap-4"><div><p className="text-xs font-semibold text-muted">{t("auth.mfaManualKey")}</p><code className="mt-1 block break-all rounded-lg bg-input p-3 text-sm">{enrollment.secret}</code><button type="button" onClick={() => void navigator.clipboard.writeText(enrollment.secret)} className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-primary"><Copy className="size-4" />{t("security.copyCodes")}</button></div><label><span className="mb-2 block text-xs font-medium">{t("auth.mfaCode")}</span><input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/gu, "").slice(0, 6))} autoComplete="one-time-code" className="w-full rounded-xl border bg-input px-3 py-3 font-mono text-lg outline-none focus:border-primary" /></label><div className="flex flex-wrap gap-3"><button disabled={busy || code.length !== 6} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"><ShieldCheck className="size-4" />{t("security.confirmEnable")}</button><button type="button" disabled={busy} onClick={() => void cancelEnrollment()} className="rounded-xl border px-4 py-3 text-sm font-semibold">{t("common.cancel")}</button></div></div>
        </form> : null}
        {data.enabled ? <form onSubmit={disable} className="mt-6 grid gap-4 border-t pt-6 md:grid-cols-2"><label><span className="mb-2 block text-xs font-medium">{t("auth.password")}</span><input required name="password" type="password" autoComplete="current-password" className="w-full rounded-xl border bg-input px-3 py-3 outline-none focus:border-primary" /></label><label><span className="mb-2 block text-xs font-medium">{t("auth.mfaCode")}</span><input required name="code" className="w-full rounded-xl border bg-input px-3 py-3 font-mono outline-none focus:border-primary" /></label><button disabled={busy} className="inline-flex w-fit items-center gap-2 rounded-xl border border-red-300 px-4 py-3 text-sm font-semibold text-danger disabled:opacity-60 md:col-span-2"><ShieldOff className="size-4" />{t("security.disable")}</button></form> : null}
      </section>

      {(recoveryCodes.length > 0 || data.enabled) ? <section className="rounded-2xl border bg-card p-6"><div className="flex items-center gap-3"><KeyRound className="size-5 text-primary" /><div><h2 className="font-semibold">{t("security.recoveryTitle")}</h2><p className="text-sm text-muted">{t("security.recoveryRemaining", { count: data.recoveryCodesRemaining })}</p></div></div>{recoveryCodes.length ? <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"><pre className="grid grid-cols-1 gap-1 whitespace-pre-wrap font-mono text-sm sm:grid-cols-2">{recoveryCodes.join("\n")}</pre><button type="button" onClick={() => void navigator.clipboard.writeText(recoveryCodes.join("\n"))} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold"><Copy className="size-4" />{t("security.copyCodes")}</button></div> : null}{data.enabled ? <form onSubmit={regenerate} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"><label><span className="mb-2 block text-xs font-medium">{t("auth.password")}</span><input required name="password" type="password" autoComplete="current-password" className="w-full rounded-xl border bg-input px-3 py-3 outline-none focus:border-primary" /></label><label><span className="mb-2 block text-xs font-medium">{t("auth.mfaCode")}</span><input required name="code" inputMode="numeric" maxLength={6} className="w-full rounded-xl border bg-input px-3 py-3 font-mono outline-none focus:border-primary" /></label><button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold"><RefreshCw className="size-4" />{t("security.regenerate")}</button></form> : null}</section> : null}

      <section><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Smartphone className="size-5 text-primary" /><h2 className="text-lg font-semibold">{t("security.activeSessions")}</h2></div><button disabled={busy || !sessions.length} onClick={() => void logoutEverywhere()} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-danger disabled:opacity-50"><LogOut className="size-4" />{t("security.logoutEverywhere")}</button></div><div className="grid gap-3">{sessions.length ? sessions.map((session) => <article key={`${session.kind}:${session.id}`} className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4"><div><p className="font-semibold">{session.deviceName}{session.current ? <span className="ml-2 text-xs text-primary">{t("security.currentSession")}</span> : null}</p><p className="mt-1 text-xs text-muted">{session.kind}{session.ipAddress ? ` · ${session.ipAddress}` : ""} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.lastActiveAt))}</p></div><button disabled={busy} onClick={() => void revokeSession(session)} title={t("security.revokeSession")} className="grid size-10 place-items-center rounded-lg border text-danger"><LogOut className="size-4" /></button></article>) : <p className="rounded-xl border border-dashed p-4 text-sm text-muted">{t("security.noActiveSessions")}</p>}</div></section>

      <section><div className="mb-3 flex items-center gap-2"><Smartphone className="size-5 text-primary" /><h2 className="text-lg font-semibold">{t("security.trustedDevices")}</h2></div><div className="grid gap-3">{data.trustedDevices.length ? data.trustedDevices.map((device) => <article key={device.id} className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4"><div><p className="font-semibold">{device.deviceName || t("security.unknownDevice")}</p><p className="mt-1 text-xs text-muted">{device.ipAddress} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(device.lastUsedAt || device.trustedAt))}</p></div><button disabled={busy} onClick={() => void revokeDevice(device.id)} title={t("security.revokeDevice")} className="grid size-10 place-items-center rounded-lg border text-danger"><Trash2 className="size-4" /></button></article>) : <p className="rounded-xl border border-dashed p-4 text-sm text-muted">{t("security.noTrustedDevices")}</p>}</div></section>

      <section><h2 className="mb-3 text-lg font-semibold">{t("security.activity")}</h2><div className="overflow-hidden rounded-xl border bg-card">{data.recentEvents.length ? data.recentEvents.map((event) => <div key={event.id} className="flex flex-wrap justify-between gap-3 border-b p-4 last:border-b-0"><div><p className="text-sm font-semibold">{event.message}</p><p className="mt-1 text-xs text-muted">{event.type}{event.ipAddress ? ` · ${event.ipAddress}` : ""}</p></div><time className="text-xs text-muted">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt))}</time></div>) : <p className="p-4 text-sm text-muted">{t("security.noActivity")}</p>}</div></section>
      {message ? <p role="status" className="rounded-xl border bg-card p-4 text-sm">{message}</p> : null}
    </div>
  </>;
}
