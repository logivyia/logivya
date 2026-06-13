"use client";
/* eslint-disable react-hooks/set-state-in-effect,@next/next/no-img-element */
import { useCallback, useEffect, useState } from "react";
import { Archive, CheckCircle2, LoaderCircle, Plus, RefreshCw, Smartphone, Trash2, X } from "lucide-react";

type Account = {
  id: string;
  label?: string;
  displayName?: string;
  phoneNumber?: string;
  status: string;
  lastError?: string;
  lastSyncedAt?: string;
  qrExpiresAt?: string;
  archivedAt?: string;
  _count: { groups: number; contacts: number; recipients: number };
};
type Session = {
  accountId: string;
  status: string;
  qrCode?: string;
  qrExpiresAt?: string;
  pairingCode?: string;
  pairingCodeExpiresAt?: string;
  lastError?: string;
};

const buttonBase = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70";
const btn = `${buttonBase} !border-slate-300 !bg-white !text-slate-900 hover:!bg-slate-100 active:!bg-slate-200 disabled:!bg-slate-100 disabled:!text-slate-600`;
const primary = `${buttonBase} !border-orange-600 !bg-orange-500 font-semibold !text-white hover:!bg-orange-600 active:!bg-orange-700 disabled:!bg-orange-300 disabled:!text-white`;
const tabButton = "min-h-11 rounded-xl px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-70";
const inactiveTab = "!bg-transparent !text-slate-900 hover:!bg-white active:!bg-slate-200";
const activeTab = "!bg-orange-500 !text-white hover:!bg-orange-600 active:!bg-orange-700";
const modalInput = "w-full rounded-xl border !border-slate-300 !bg-white p-3 text-base !text-slate-900 caret-orange-500 placeholder:!text-slate-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:!bg-slate-100 disabled:!text-slate-600";
const reconnectable = ["NEW", "ERROR", "FAILED", "CONNECTING", "QR_READY", "PENDING_QR", "PENDING_PAIRING", "PAIRING_CODE_READY", "RECONNECT_REQUIRED", "DISCONNECTED"];

export function AccountsStablePage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [modal, setModal] = useState(false);
  const [session, setSession] = useState<Session>();
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"QR" | "CODE">("QR");
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState("+90");
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const response = await fetch("/api/accounts", { cache: "no-store" });
    const value = await response.json();
    if (response.ok) setAccounts(value.accounts);
    else setError(value.error);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!modal) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [modal]);
  useEffect(() => {
    if (!session?.accountId || ["CONNECTED", "FAILED"].includes(session.status)) return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/accounts/whatsapp/${session.accountId}/status`, { cache: "no-store" });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        setSession(value);
        setError(value.lastError || "");
        if (value.status === "CONNECTED") {
          clearInterval(timer);
          void load();
        }
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : "Bağlantı durumu alınamadı.");
      }
    }, 2_000);
    return () => clearInterval(timer);
  }, [session?.accountId, session?.status, load]);

  async function request(url: string, body?: unknown) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const value = await response.json();
      if (value.accountId) setSession(value);
      if (!response.ok) throw new Error(value.error);
      if (!value.accountId) {
        setModal(false);
        setSession(undefined);
      }
      void load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "İşlem başarısız.");
    } finally {
      setLoading(false);
    }
  }

  function open() {
    setModal(true);
    setSession(undefined);
    setError("");
    setTab("QR");
  }
  function openExisting(account: Account) {
    setModal(true);
    setSession({ accountId: account.id, status: account.status, qrExpiresAt: account.qrExpiresAt, lastError: account.lastError });
    setError("");
    setTab("QR");
  }
  function pairing() {
    const url = session?.accountId ? `/api/accounts/${session.accountId}/pairing-code` : "/api/accounts/whatsapp/create-pairing-session";
    void request(url, { phoneNumber: phone });
  }

  const visible = accounts?.filter((account) => archived || !account.archivedAt) || [];
  const qrSeconds = session?.qrExpiresAt ? Math.max(0, Math.ceil((new Date(session.qrExpiresAt).getTime() - now) / 1_000)) : 0;
  const codeSeconds = session?.pairingCodeExpiresAt ? Math.max(0, Math.ceil((new Date(session.pairingCodeExpiresAt).getTime() - now) / 1_000)) : 0;
  const expired = Boolean(session?.qrExpiresAt && qrSeconds === 0);
  const pairingExpired = Boolean(session?.pairingCodeExpiresAt && codeSeconds === 0);

  return <>
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-orange-500">WhatsApp Katmanı</p>
        <h1 className="mt-2 text-3xl font-semibold">Bağlı hesaplar</h1>
        <p className="mt-2 text-sm text-muted">WhatsApp hesabınızı QR kod veya telefon koduyla güvenli biçimde bağlayın.</p>
      </div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        <button className={btn} onClick={() => setArchived((value) => !value)}>Arşivlenenleri göster</button>
        <button className={primary} onClick={open}><Plus className="size-4" />WhatsApp hesabı ekle</button>
      </div>
    </header>
    {error && !modal && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!accounts ? <LoaderCircle className="animate-spin" /> : <div className="grid gap-5 xl:grid-cols-3">
      {visible.map((account) => <article className="panel rounded-2xl p-5" key={account.id}>
        <div className="flex justify-between"><Smartphone className="text-orange-500" /><span className="rounded-full bg-orange-50 px-2 py-1 text-xs text-orange-700">{account.status}</span></div>
        <h2 className="mt-5 font-semibold">{account.displayName || account.label || "WhatsApp Hesabı"}</h2>
        <p className="text-xs text-muted">{account.phoneNumber || "Telefon bekleniyor"}</p>
        {account.lastError && <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">Bağlantı başarısız oldu. Yeni kod veya QR ile tekrar deneyin.</p>}
        <div className="my-5 grid grid-cols-3 text-center text-xs">
          <span>{account._count.groups}<small className="block text-muted">Grup</small></span>
          <span>{account._count.contacts}<small className="block text-muted">Kişi</small></span>
          <span>{account.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleDateString() : "-"}<small className="block text-muted">Eşitleme</small></span>
        </div>
        <div className="flex flex-wrap gap-2">
          {reconnectable.includes(account.status) && <button className={primary} onClick={() => openExisting(account)}>Yeniden bağla</button>}
          {account.archivedAt ? <button className={btn} onClick={() => void request(`/api/accounts/${account.id}/action`, { action: "restore" })}>Geri yükle</button> : account.status === "CONNECTED" && <button className={btn} onClick={() => void request(`/api/accounts/whatsapp/${account.id}/sync-groups`)}><RefreshCw className="size-4" />Grupları eşitle</button>}
          <button className={btn} onClick={() => void request(`/api/accounts/whatsapp/${account.id}/cancel`)}>{account._count.recipients ? <><Archive className="size-4" />Arşivle</> : <><Trash2 className="size-4" />Sil</>}</button>
        </div>
      </article>)}
    </div>}
    {modal && <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/60 p-3 sm:p-6">
      <section className="my-auto w-full max-w-xl rounded-3xl !bg-white p-4 !text-slate-900 shadow-2xl sm:p-6">
        <button aria-label="Kapat" className="float-end rounded-lg p-2 !text-slate-900 hover:!bg-slate-100 active:!bg-slate-200" onClick={() => setModal(false)}><X /></button>
        <h2 className="pr-10 text-xl font-semibold !text-slate-900 sm:text-2xl">WhatsApp hesabı bağla</h2>
        <p className="mt-1 text-sm !text-slate-600">Bilgisayarda QR okutun veya telefonda bağlantı kodunu kullanın.</p>
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
          <button className={`${tabButton} ${tab === "QR" ? activeTab : inactiveTab}`} onClick={() => { setTab("QR"); setError(""); }}>QR Kod</button>
          <button className={`${tabButton} ${tab === "CODE" ? activeTab : inactiveTab}`} onClick={() => { setTab("CODE"); setError(""); }}>Telefon Kodu</button>
        </div>
        {session?.status === "CONNECTED" ? <div className="mt-6 rounded-2xl bg-emerald-50 p-6 text-center text-emerald-800">
          <CheckCircle2 className="mx-auto mb-3 size-10" /><p className="font-semibold">WhatsApp hesabı başarıyla bağlandı.</p>
          <button className={`${primary} mt-4`} onClick={() => setModal(false)}>Tamam</button>
        </div> : tab === "CODE" ? <div className="mt-6 text-center">
          {!session?.pairingCode || pairingExpired ? <>
            <label className="mb-2 block text-left text-sm font-medium !text-slate-900">Ülke koduyla telefon numarası</label>
            <input className={modalInput} inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+905321234567" />
            <button disabled={loading} className={`${primary} mt-4 w-full`} onClick={pairing}>{loading && <LoaderCircle className="size-4 animate-spin" />}{session ? "Yeni kod al" : "Telefon kodu oluştur"}</button>
          </> : <>
            <p className="text-sm text-slate-600">WhatsApp → Bağlı cihazlar → Telefon numarasıyla bağla</p>
            <p className="mx-auto my-5 rounded-2xl bg-orange-50 p-5 font-mono text-2xl font-bold tracking-[.18em] text-orange-700 sm:text-3xl">{session.pairingCode}</p>
            <p className="text-sm font-medium text-orange-700">Kodun kalan süresi: {codeSeconds} saniye</p>
          </>}
        </div> : <div className="mt-6 text-center">
          {!session && <button disabled={loading} className={`${primary} w-full sm:w-auto sm:min-w-48`} onClick={() => void request("/api/accounts/whatsapp/create-session")}>{loading && <LoaderCircle className="size-4 animate-spin" />}QR kodu oluştur</button>}
          {session && !session.qrCode && !error && !expired && <><LoaderCircle className="mx-auto my-8 size-10 animate-spin text-orange-500" /><p className="text-sm text-slate-500">Gerçek QR kod hazırlanıyor, en fazla 15 saniye...</p></>}
          {session?.qrCode && !expired && <><div className="mx-auto my-5 w-fit rounded-2xl border-4 border-orange-500 bg-white p-3 shadow-lg"><img src={session.qrCode} alt="WhatsApp bağlantı QR kodu" className="size-[min(70vw,300px)] min-h-60 min-w-60" /></div><p className="text-sm text-slate-600">WhatsApp → Bağlı cihazlar → Cihaz bağla</p><p className="mt-2 text-sm font-medium text-orange-700">QR kalan süresi: {qrSeconds} saniye</p></>}
          {session && (expired || error) && <button disabled={loading} className={`${primary} w-full sm:w-auto`} onClick={() => void request(`/api/accounts/whatsapp/${session.accountId}/regenerate-qr`)}>{loading && <LoaderCircle className="size-4 animate-spin" />}Yeni QR kodu oluştur</button>}
        </div>}
        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {session && session.status !== "CONNECTED" && <button disabled={loading} className={`${btn} mt-4 w-full`} onClick={() => void request(`/api/accounts/whatsapp/${session.accountId}/cancel`)}>Bağlantıyı iptal et</button>}
      </section>
    </div>}
  </>;
}
