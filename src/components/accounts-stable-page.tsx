"use client";

/* eslint-disable react-hooks/set-state-in-effect,@next/next/no-img-element */
import { useCallback, useEffect, useState } from "react";
import { Archive, CheckCircle2, LoaderCircle, Plus, RefreshCw, Smartphone, Trash2, X } from "lucide-react";

import { useI18n } from "@/i18n/provider";
import { getWhatsAppStatusLabel } from "@/lib/i18n/status-labels";

type Account = {
  id: string;
  displayName?: string | null;
  phoneNumber?: string | null;
  status: string;
  lastError?: string | null;
  archivedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  groupCount?: number;
  contactCount?: number;
  lastSyncAt?: string | null;
  qrCode?: string | null;
  pairingCode?: string | null;
  pairingCodeExpiresAt?: string | null;
};

type Session = {
  id: string;
  accountId: string;
  status: string;
  qrCode?: string | null;
  qrExpiresAt?: string | null;
  pairingCode?: string | null;
  pairingCodeExpiresAt?: string | null;
  lastError?: string | null;
};

const buttonBase = "inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed";
const lightButton = `${buttonBase} border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500`;
const orangeButton = `${buttonBase} bg-orange-500 text-white shadow-lg shadow-orange-500/20 hover:bg-orange-600 disabled:bg-orange-200 disabled:text-white`;

const countryOptions = [
  { value: "90", label: "TR +90" },
  { value: "40", label: "RO +40" },
  { value: "49", label: "DE +49" },
  { value: "994", label: "AZ +994" },
  { value: "44", label: "UK +44" },
] as const;

function defaultCountryCode(locale: string) {
  if (locale === "ro") return "40";
  if (locale === "de") return "49";
  if (locale === "az") return "994";
  return "90";
}

function dateLocale(locale: string) {
  if (locale === "ro") return "ro-RO";
  if (locale === "de") return "de-DE";
  if (locale === "en") return "en-US";
  return "tr-TR";
}

function isConnected(status?: string | null) {
  return ["CONNECTED", "ACTIVE"].includes(String(status ?? "").toUpperCase());
}

function statusTone(status: string) {
  const value = status.toUpperCase();
  if (isConnected(value)) return "bg-emerald-50 text-emerald-700";
  if (["FAILED", "ERROR", "RECONNECT_REQUIRED", "DISCONNECTED"].includes(value)) return "bg-rose-50 text-rose-700";
  if (value === "ARCHIVED") return "bg-slate-100 text-slate-700";
  return "bg-orange-50 text-orange-700";
}

function normalizePhone(countryCode: string, phone: string) {
  const cc = countryCode.replace(/\D/g, "");
  let digits = phone.replace(/\D/g, "");
  while (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith(cc)) return digits;
  return `${cc}${digits}`;
}

export function AccountsStablePage() {
  const { locale, t } = useI18n();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ accountId?: string; mode: "qr" | "phone" } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(() => defaultCountryCode(locale));
  const [modalError, setModalError] = useState("");
  const [error, setError] = useState("");

  const localizeError = useCallback(
    (message: string | undefined, fallbackKey: string) => {
      if (!message) return t(fallbackKey);
      return /^[a-z0-9_.-]+$/i.test(message) ? t(message) : message;
    },
    [t],
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/accounts?archived=${archived ? "1" : "0"}`, { cache: "no-store" });
      const value = await res.json().catch(() => ({}));
      if (!res.ok || !value.ok) throw new Error(value.error || "accounts.loadFailed");
      setAccounts(Array.isArray(value.accounts) ? value.accounts : []);
      setError("");
    } catch (err) {
      setError(localizeError(err instanceof Error ? err.message : undefined, "accounts.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [archived, localizeError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!modal?.accountId || isConnected(session?.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/accounts/${modal.accountId}/connection-status`, { cache: "no-store" });
        const value = await res.json().catch(() => ({}));
        if (!res.ok || !value.ok) throw new Error(value.error || "accounts.statusUnavailable");
        if (value.session) setSession(value.session);
        if (isConnected(value.account?.status) || isConnected(value.session?.status)) {
          setModalError("");
          void load();
        }
      } catch (err) {
        setModalError(localizeError(err instanceof Error ? err.message : undefined, "accounts.statusUnavailable"));
      }
    }, 3500);
    return () => window.clearInterval(timer);
  }, [load, localizeError, modal?.accountId, session?.status]);

  async function request(accountId: string, action: string, body?: unknown) {
    const res = await fetch(`/api/accounts/${accountId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const value = await res.json().catch(() => ({}));
    if (!res.ok || !value.ok) throw new Error(value.error || "accounts.actionFailed");
    return value;
  }

  async function open(mode: "qr" | "phone") {
    const name = window.prompt(t("accounts.labelPrompt"), label || t("accounts.defaultLabel"));
    if (name === null) return;
    setLabel(name.trim() || t("accounts.defaultLabel"));
    setCountryCode(defaultCountryCode(locale));
    setPhone("");
    setSession(null);
    setModalError("");
    setModal({ mode });
  }

  async function openExisting(account: Account, mode: "qr" | "phone") {
    setLabel(account.displayName || t("accounts.defaultLabel"));
    setPhone(account.phoneNumber || "");
    setCountryCode(defaultCountryCode(locale));
    setSession(null);
    setModalError(isConnected(account.status) ? t("accounts.alreadyConnected") : account.lastError || "");
    setModal({ accountId: account.id, mode });
  }

  async function startQr() {
    setModalError("");
    try {
      let accountId = modal?.accountId;
      if (!accountId) {
        const res = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: label || t("accounts.defaultLabel") }),
        });
        const value = await res.json().catch(() => ({}));
        if (!res.ok || !value.ok) throw new Error(value.error || "accounts.actionFailed");
        accountId = value.account?.id;
        setModal({ accountId, mode: "qr" });
      }
      if (!accountId) throw new Error("accounts.actionFailed");
      const value = await request(accountId, "connect", { method: "qr" });
      setSession(value.session);
      void load();
    } catch (err) {
      setModalError(localizeError(err instanceof Error ? err.message : undefined, "accounts.qrFailedRetry"));
    }
  }

  async function startPhone() {
    setModalError("");
    const normalized = normalizePhone(countryCode, phone);
    if (!normalized) {
      setModalError(t("accounts.phoneRequired"));
      return;
    }
    try {
      let accountId = modal?.accountId;
      if (!accountId) {
        const res = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: label || t("accounts.defaultLabel"), phoneNumber: normalized }),
        });
        const value = await res.json().catch(() => ({}));
        if (!res.ok || !value.ok) throw new Error(value.error || "accounts.actionFailed");
        accountId = value.account?.id;
        setModal({ accountId, mode: "phone" });
      }
      if (!accountId) throw new Error("accounts.actionFailed");
      const value = await request(accountId, "pairing-code", { phoneNumber: normalized });
      setSession(value.session);
      void load();
    } catch (err) {
      setModalError(localizeError(err instanceof Error ? err.message : undefined, "accounts.connectionFailedRetry"));
    }
  }

  async function action(account: Account, actionName: "connect" | "sync" | "archive" | "restore" | "delete") {
    if (actionName === "delete" && !window.confirm(t("accounts.deleteConfirm"))) return;
    try {
      setWorkingId(account.id);
      if (actionName === "connect") {
        await openExisting(account, "qr");
        return;
      }
      if (actionName === "sync") await request(account.id, "sync-groups");
      if (actionName === "archive") await request(account.id, "archive");
      if (actionName === "restore") await request(account.id, "restore");
      if (actionName === "delete") await request(account.id, "delete");
      await load();
    } catch (err) {
      setError(localizeError(err instanceof Error ? err.message : undefined, "accounts.actionFailed"));
    } finally {
      setWorkingId(null);
    }
  }

  const visibleQr = session?.qrCode;
  const visiblePairing = session?.pairingCode;

  return (
    <main className="space-y-8">
      <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.45em] text-orange-500">{t("accounts.eyebrow")}</p>
          <h1 className="mt-4 text-4xl font-black text-slate-950">{t("accounts.title")}</h1>
          <p className="mt-3 text-lg text-slate-600">{t("accounts.description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className={lightButton} type="button" onClick={() => setArchived((value) => !value)}>
            {t("accounts.showArchived")}
          </button>
          <button className={orangeButton} type="button" onClick={() => void open("qr")}>
            <Plus className="h-5 w-5" /> {t("accounts.add")}
          </button>
        </div>
      </section>

      {error ? <div className="rounded-2xl bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-600">{t("common.loading")}</div>
      ) : accounts.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-600">{t("accounts.empty")}</div>
      ) : (
        <section className="grid gap-6 xl:grid-cols-3">
          {accounts.map((account) => (
            <article key={account.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60">
              <div className="flex items-start justify-between gap-3">
                <Smartphone className="h-8 w-8 text-orange-500" />
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(account.status)}`}>
                  {getWhatsAppStatusLabel(account.status, locale)}
                </span>
              </div>
              <h2 className="mt-7 text-xl font-black text-slate-950">{account.displayName || t("accounts.defaultLabel")}</h2>
              <p className="mt-1 text-sm text-slate-500">{account.phoneNumber || t("accounts.phoneWaiting")}</p>
              {account.lastError ? <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">{localizeError(account.lastError, "accounts.connectionFailedRetry")}</p> : null}
              <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
                <div>
                  <dt className="text-2xl font-black text-slate-950">{account.groupCount ?? 0}</dt>
                  <dd className="text-xs text-slate-500">{t("common.group")}</dd>
                </div>
                <div>
                  <dt className="text-2xl font-black text-slate-950">{account.contactCount ?? 0}</dt>
                  <dd className="text-xs text-slate-500">{t("accounts.people")}</dd>
                </div>
                <div>
                  <dt className="text-sm font-black text-slate-950">
                    {account.lastSyncAt ? new Date(account.lastSyncAt).toLocaleDateString(dateLocale(locale)) : "-"}
                  </dt>
                  <dd className="text-xs text-slate-500">{t("accounts.sync")}</dd>
                </div>
              </dl>
              <div className="mt-7 grid grid-cols-2 gap-3">
                {!isConnected(account.status) ? (
                  <button className={orangeButton} disabled={workingId === account.id} type="button" onClick={() => void openExisting(account, "qr")}>
                    <RefreshCw className="h-4 w-4" /> {t("accounts.reconnect")}
                  </button>
                ) : (
                  <button className={lightButton} disabled={workingId === account.id} type="button" onClick={() => void openExisting(account, "qr")}>
                    <CheckCircle2 className="h-4 w-4" /> {t("accounts.checkConnection")}
                  </button>
                )}
                {account.archivedAt ? (
                  <button className={lightButton} disabled={workingId === account.id} type="button" onClick={() => void action(account, "restore")}>
                    {t("accounts.restore")}
                  </button>
                ) : (
                  <button className={lightButton} disabled={workingId === account.id} type="button" onClick={() => void action(account, "sync")}>
                    {t("accounts.syncGroups")}
                  </button>
                )}
                {!account.archivedAt ? (
                  <button className={lightButton} disabled={workingId === account.id} type="button" onClick={() => void action(account, "archive")}>
                    <Archive className="h-4 w-4" /> {t("accounts.archive")}
                  </button>
                ) : null}
                <button className={lightButton} disabled={workingId === account.id} type="button" onClick={() => void action(account, "delete")}>
                  <Trash2 className="h-4 w-4" /> {t("accounts.delete")}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-8 text-slate-950 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black">{t("accounts.connectTitle")}</h2>
                <p className="mt-2 text-slate-600">{t("accounts.connectDescription")}</p>
              </div>
              <button aria-label={t("accounts.close")} className="rounded-full p-2 text-slate-900 hover:bg-slate-100" type="button" onClick={() => setModal(null)}>
                <X />
              </button>
            </div>

            <div className="mt-7 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
              <button className={`rounded-xl px-4 py-3 font-bold ${modal.mode === "qr" ? "bg-orange-500 text-white" : "text-slate-900"}`} type="button" onClick={() => setModal({ ...modal, mode: "qr" })}>
                {t("accounts.qrTab")}
              </button>
              <button className={`rounded-xl px-4 py-3 font-bold ${modal.mode === "phone" ? "bg-orange-500 text-white" : "text-slate-900"}`} type="button" onClick={() => setModal({ ...modal, mode: "phone" })}>
                {t("accounts.codeTab")}
              </button>
            </div>

            {isConnected(session?.status) ? (
              <div className="mt-7 rounded-2xl bg-emerald-50 p-4 text-emerald-700">{t("accounts.connectedTitle")}</div>
            ) : modal.mode === "phone" ? (
              <div className="mt-7 space-y-5">
                <label className="block text-sm font-bold text-slate-900">{t("accounts.phoneLabel")}</label>
                <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                  <select
                    aria-label={t("accounts.countryCode")}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950"
                    value={countryCode}
                    onChange={(event) => setCountryCode(event.target.value)}
                  >
                    {countryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={t("accounts.phoneNumber")}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 placeholder:text-slate-400"
                    inputMode="tel"
                    placeholder={t("accounts.phonePlaceholder")}
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </div>
                <button className={orangeButton + " w-full"} type="button" onClick={() => void startPhone()}>
                  {visiblePairing ? t("accounts.newCode") : t("accounts.createPhoneCode")}
                </button>
                {visiblePairing ? (
                  <div className="rounded-3xl border border-orange-200 bg-orange-50 p-6 text-center">
                    <p className="text-sm font-semibold text-slate-700">{t("accounts.phoneInstructions")}</p>
                    <p className="mt-4 text-4xl font-black tracking-[0.35em] text-orange-600">{visiblePairing}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-7 space-y-5 text-center">
                <button className={orangeButton} type="button" onClick={() => void startQr()}>
                  {t("accounts.qrGenerate")}
                </button>
                {session && !visibleQr ? (
                  <div className="mx-auto flex max-w-md items-center justify-center gap-3 rounded-3xl bg-slate-50 p-6 text-slate-700">
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                    {t("accounts.qrPreparing")}
                  </div>
                ) : null}
                {visibleQr ? (
                  <div className="mx-auto max-w-sm rounded-3xl border border-slate-200 bg-white p-5">
                    <img alt={t("accounts.qrAlt")} className="mx-auto h-72 w-72" src={`https://api.qrserver.com/v1/create-qr-code/?size=288x288&data=${encodeURIComponent(visibleQr)}`} />
                    <p className="mt-4 text-sm text-slate-600">{t("accounts.qrInstructions")}</p>
                  </div>
                ) : null}
              </div>
            )}

            {modalError || session?.lastError ? (
              <div className="mt-6 rounded-2xl bg-rose-50 px-5 py-4 text-sm text-rose-700">
                {localizeError(modalError || session?.lastError || undefined, "accounts.connectionFailedRetry")}
              </div>
            ) : null}
            <button className={lightButton + " mt-5 w-full"} type="button" onClick={() => setModal(null)}>
              {t("accounts.cancelConnection")}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
