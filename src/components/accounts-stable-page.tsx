"use client";

/* eslint-disable react-hooks/set-state-in-effect,@next/next/no-img-element */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Archive, History, LoaderCircle, MessageCircle, Plus, RefreshCw, Send, Smartphone, Trash2, UsersRound, X } from "lucide-react";

import { useI18n } from "@/i18n/provider";
import { statusLabel } from "@/i18n/status";
import { formatNumber } from "@/i18n/format";
import { countryRegistry, getCountryByLocale } from "@/lib/international/country-registry";
import { inferPhoneCountry, normalizePhonePairingInput } from "@/lib/phone/normalize";

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
const lightButton = `${buttonBase} border bg-card text-card-foreground hover:bg-secondary disabled:bg-secondary disabled:text-muted`;
const orangeButton = `${buttonBase} bg-orange-500 text-white shadow-lg shadow-orange-500/20 hover:bg-orange-600 disabled:bg-orange-200 disabled:text-white`;

function defaultCountryIso(locale: string) {
  return getCountryByLocale(locale)?.countryIso ?? "TR";
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

function userFacingWhatsAppErrorKey(message?: string | null) {
  if (!message) return null;
  const normalized = message.trim().toUpperCase().replace(/\s+/g, "_");
  const mapped: Record<string, string> = {
    WHATSAPP_CREDENTIALS_MISSING: "accounts.reconnectRequired",
    AUTH_REQUIRED: "accounts.reconnectRequired",
    WHATSAPP_LOGGED_OUT: "accounts.loggedOut",
    LOGGED_OUT: "accounts.loggedOut",
    WHATSAPP_TRANSIENT_DISCONNECT: "accounts.reconnectingMessage",
    WHATSAPP_RECONNECT_REQUIRED: "accounts.reconnectingMessage",
    WHATSAPP_CONNECTION_FAILED: "accounts.connectionTemporary",
    WHATSAPP_QR_FAILED: "accounts.connectionTemporary",
    MOBILE_QR_FAILED: "accounts.connectionTemporary",
  };
  if (mapped[normalized]) return mapped[normalized];
  if (/^[a-z0-9_.-]+$/i.test(message) && message.includes(".")) return message;
  return "accounts.connectionTemporary";
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
  const [countryIso, setCountryIso] = useState(() => defaultCountryIso(locale));
  const [modalError, setModalError] = useState("");
  const [error, setError] = useState("");

  const localizeError = useCallback(
    (message: string | undefined, fallbackKey: string) => {
      const key = userFacingWhatsAppErrorKey(message);
      return t(key ?? fallbackKey);
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
        const res = await fetch(`/api/accounts/whatsapp/${modal.accountId}/status`, { cache: "no-store" });
        const value = await res.json().catch(() => ({}));
        if (!res.ok || !value.ok) throw new Error(value.error || "accounts.statusUnavailable");
        setSession({
          id: value.accountId || modal.accountId,
          accountId: value.accountId || modal.accountId,
          status: value.status,
          qrCode: value.qrCode,
          qrExpiresAt: value.qrExpiresAt,
          pairingCode: value.pairingCode,
          pairingCodeExpiresAt: value.pairingCodeExpiresAt,
          lastError: value.lastError,
        });
        if (isConnected(value.status)) {
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
    const init: RequestInit = { method: "POST", headers: { "Content-Type": "application/json" } };
    let url = `/api/accounts/${accountId}/${action}`;
    if (action === "archive" || action === "restore") {
      url = `/api/accounts/${accountId}/action`;
      init.body = JSON.stringify({ action });
    } else if (action === "sync-groups") {
      url = `/api/accounts/${accountId}/sync`;
      init.body = JSON.stringify(body ?? {});
    } else if (action === "delete") {
      url = `/api/accounts/${accountId}`;
      init.method = "DELETE";
      delete (init.headers as Record<string, string>)["Content-Type"];
    } else {
      init.body = JSON.stringify(body ?? {});
    }
    const res = await fetch(url, init);
    const value = await res.json().catch(() => ({}));
    if (!res.ok || !value.ok) throw new Error(value.error || "accounts.actionFailed");
    return value;
  }

  async function open(mode: "qr" | "phone") {
    const name = window.prompt(t("accounts.labelPrompt"), label || t("accounts.defaultLabel"));
    if (name === null) return;
    setLabel(name.trim() || t("accounts.defaultLabel"));
    setCountryIso(defaultCountryIso(locale));
    setPhone("");
    setSession(null);
    setModalError("");
    setModal({ mode });
  }

  async function openExisting(account: Account, mode: "qr" | "phone") {
    setLabel(account.displayName || t("accounts.defaultLabel"));
    const inferredCountry = inferPhoneCountry(account.phoneNumber);
    setPhone("");
    setCountryIso(inferredCountry?.countryIso ?? defaultCountryIso(locale));
    setSession(null);
    setModalError(isConnected(account.status) ? t("accounts.alreadyConnected") : account.lastError || "");
    setModal({ accountId: account.id, mode });
  }

  async function startQr() {
    setModalError("");
    try {
      let accountId = modal?.accountId;
      const res = await fetch(accountId ? `/api/accounts/whatsapp/${accountId}/regenerate-qr` : "/api/accounts/whatsapp/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label || t("accounts.defaultLabel") }),
      });
      const value = await res.json().catch(() => ({}));
      if (!res.ok || !value.ok) throw new Error(value.error || "accounts.actionFailed");
      accountId = value.accountId || accountId;
      if (!accountId) throw new Error("accounts.actionFailed");
      setModal({ accountId, mode: "qr" });
      setSession({
        id: accountId,
        accountId,
        status: value.status,
        qrCode: value.qrCode || value.qr,
        qrExpiresAt: value.qrExpiresAt || value.expiresAt,
        lastError: value.error,
      });
      void load();
    } catch (err) {
      setModalError(localizeError(err instanceof Error ? err.message : undefined, "accounts.qrFailedRetry"));
    }
  }

  async function startPhone() {
    setModalError("");
    let normalized: ReturnType<typeof normalizePhonePairingInput>;
    try {
      normalized = normalizePhonePairingInput({ countryIso, nationalNumber: phone });
    } catch (error) {
      const code = error instanceof Error ? error.message : "INVALID_WHATSAPP_PHONE";
      setModalError(t(code === "DUPLICATE_PHONE_COUNTRY_CODE" ? "accounts.countryCodeDuplicate" : code === "UNSUPPORTED_PHONE_COUNTRY" ? "accounts.countryUnsupported" : "accounts.phoneInvalid"));
      return;
    }
    if (!normalized.e164) {
      setModalError(t("accounts.phoneRequired"));
      return;
    }
    try {
      let accountId = modal?.accountId;
      const res = await fetch(accountId ? `/api/accounts/${accountId}/pairing-code` : "/api/accounts/whatsapp/create-pairing-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label || t("accounts.defaultLabel"), countryIso: normalized.countryIso, nationalNumber: normalized.nationalNumber }),
      });
      const value = await res.json().catch(() => ({}));
      if (!res.ok || !value.ok) throw new Error(value.error || "accounts.actionFailed");
      accountId = value.accountId || accountId;
      if (!accountId) throw new Error("accounts.actionFailed");
      setModal({ accountId, mode: "phone" });
      setSession({
        id: accountId,
        accountId,
        status: value.status,
        pairingCode: value.pairingCode,
        pairingCodeExpiresAt: value.pairingCodeExpiresAt || value.expiresAt,
        lastError: value.error,
      });
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
          <h1 className="mt-4 text-4xl font-black text-foreground">{t("accounts.title")}</h1>
          <p className="mt-3 text-lg text-muted">{t("accounts.description")}</p>
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

      <nav aria-label={t("nav.accounts")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { href: "/accounts", label: t("accounts.workspaceTab"), icon: Smartphone, current: true },
          { href: "/groups?platform=WHATSAPP", label: t("nav.groups"), icon: UsersRound },
          { href: "/send-message?platform=WHATSAPP", label: t("nav.sendMessage"), icon: Send },
          { href: "/message-history?platform=WHATSAPP", label: t("nav.history"), icon: History },
        ].map(({ href, label: actionLabel, icon: Icon, current }) => (
          <Link
            key={href}
            aria-current={current ? "page" : undefined}
            href={href}
            className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold transition ${current ? "border-orange-500 bg-orange-500 text-white" : "bg-card text-card-foreground hover:border-orange-500/50 hover:bg-orange-500/5"}`}
          >
            <Icon aria-hidden className="size-5 shrink-0" />
            <span>{actionLabel}</span>
          </Link>
        ))}
      </nav>

      {error ? <div className="rounded-2xl bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}

      {loading ? (
        <div className="rounded-3xl border bg-card p-8 text-muted">{t("common.loading")}</div>
      ) : accounts.length === 0 ? (
        <div className="rounded-3xl border bg-card p-8 text-muted">{t("accounts.empty")}</div>
      ) : (
        <section className="grid gap-6 xl:grid-cols-3">
          {accounts.map((account) => (
            <article key={account.id} className="rounded-3xl border bg-card p-6 text-card-foreground shadow-[var(--shadow-soft)]">
              <div className="flex items-start justify-between gap-3">
                <MessageCircle className="h-8 w-8 text-orange-500" />
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(account.status)}`}>
                  {statusLabel(t, "whatsapp", account.status)}
                </span>
              </div>
              <h2 className="mt-7 truncate text-xl font-black text-card-foreground">{account.phoneNumber || t("accounts.phoneWaiting")}</h2>
              <dl className="mt-7 border-y py-5 text-center">
                <dt className="text-3xl font-black text-card-foreground">{formatNumber(account.groupCount ?? 0, locale)}</dt>
                <dd className="mt-1 text-sm font-semibold text-muted">{t("accounts.connectedGroups")}</dd>
              </dl>
              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <button className={orangeButton} disabled={workingId === account.id} type="button" onClick={() => void openExisting(account, "qr")}>
                  <RefreshCw className="h-4 w-4" /> {t("accounts.reconnect")}
                </button>
                {!account.archivedAt ? (
                  <button className={lightButton} disabled={workingId === account.id} type="button" onClick={() => void action(account, "archive")}>
                    <Archive className="h-4 w-4" /> {t("accounts.archive")}
                  </button>
                ) : (
                  <button className={lightButton} disabled={workingId === account.id} type="button" onClick={() => void action(account, "restore")}>
                    <Archive className="h-4 w-4" /> {t("accounts.restore")}
                  </button>
                )}
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
          <div className="w-full max-w-2xl rounded-3xl border bg-card p-8 text-card-foreground shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black">{t("accounts.connectTitle")}</h2>
                <p className="mt-2 text-muted">{t("accounts.connectDescription")}</p>
              </div>
              <button aria-label={t("accounts.close")} className="rounded-full p-2 text-foreground hover:bg-muted-background" type="button" onClick={() => setModal(null)}>
                <X />
              </button>
            </div>

            <div className="mt-7 grid grid-cols-2 rounded-2xl bg-muted-background p-1">
              <button className={`rounded-xl px-4 py-3 font-bold ${modal.mode === "qr" ? "bg-orange-500 text-white" : "text-foreground"}`} type="button" onClick={() => setModal({ ...modal, mode: "qr" })}>
                {t("accounts.qrTab")}
              </button>
              <button className={`rounded-xl px-4 py-3 font-bold ${modal.mode === "phone" ? "bg-orange-500 text-white" : "text-foreground"}`} type="button" onClick={() => setModal({ ...modal, mode: "phone" })}>
                {t("accounts.codeTab")}
              </button>
            </div>

            {isConnected(session?.status) ? (
              <div className="mt-7 rounded-2xl bg-emerald-50 p-4 text-emerald-700">{t("accounts.connectedTitle")}</div>
            ) : modal.mode === "phone" ? (
              <div className="mt-7 space-y-5">
                <label className="block text-sm font-bold text-foreground">{t("accounts.phoneLabel")}</label>
                <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                  <select
                    aria-label={t("accounts.countryCode")}
                    className="rounded-2xl border bg-input px-4 py-3 text-input-foreground outline-none focus:border-primary"
                    value={countryIso}
                    onChange={(event) => {
                      setCountryIso(event.target.value);
                      setPhone("");
                      setModalError("");
                    }}
                  >
                    {countryRegistry.map((option) => (
                      <option key={option.countryIso} value={option.countryIso}>
                        {option.nativeCountryName} ({option.countryIso} {option.callingCode})
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={t("accounts.phoneNumber")}
                    className="rounded-2xl border bg-input px-4 py-3 text-input-foreground outline-none placeholder:text-muted focus:border-primary"
                    inputMode="tel"
                    placeholder={countryRegistry.find((option) => option.countryIso === countryIso)?.phonePlaceholder ?? t("accounts.phonePlaceholder")}
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </div>
                <button className={orangeButton + " w-full"} type="button" onClick={() => void startPhone()}>
                  {visiblePairing ? t("accounts.newCode") : t("accounts.createPhoneCode")}
                </button>
                {visiblePairing ? (
                  <div className="rounded-3xl border border-orange-500/30 bg-orange-500/10 p-6 text-center">
                    <p className="text-sm font-semibold text-foreground">{t("accounts.phoneInstructions")}</p>
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
                  <div className="mx-auto flex max-w-md items-center justify-center gap-3 rounded-3xl bg-muted-background p-6 text-muted">
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                    {t("accounts.qrPreparing")}
                  </div>
                ) : null}
                {visibleQr ? (
                  <div className="mx-auto max-w-sm rounded-3xl border border-slate-200 bg-white p-5">
                    <img alt={t("accounts.qrAlt")} className="mx-auto h-72 w-72" src={visibleQr} />
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
