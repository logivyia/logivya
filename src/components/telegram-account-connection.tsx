"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, Plus, RefreshCw, Smartphone } from "lucide-react";
import { countryRegistry, getCountryByLocale } from "@/lib/international/country-registry";
import { normalizePhonePairingInput } from "@/lib/phone/normalize";
import { normalizeCountrySearch } from "../../shared/international-phone-input";
import { telegramConnectionCopy } from "@/components/telegram-connection-copy";

export type TelegramConnectionAccount = {
  id: string; label: string; username?: string | null; phoneNumberMasked?: string | null;
  status: string; authState: string; lastErrorCode?: string | null;
  authStateDetail?: { passwordHint?: string } | null;
};
type Step = "phone" | "code" | "password" | "email" | "email_code";
type Action = { action: "create" } | { action: "start" | "sync"; accountId: string } | { action: "auth"; accountId: string; auth: { step: Step; value: string } };
const steps: Record<string, Step> = { WAIT_PHONE_NUMBER: "phone", WAIT_CODE: "code", WAIT_PASSWORD: "password", WAIT_EMAIL_ADDRESS: "email", WAIT_EMAIL_CODE: "email_code" };
const field = "w-full min-w-0 rounded-xl border bg-background px-3 py-3 text-sm text-foreground outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:opacity-60";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} bg-orange-500 text-white hover:bg-orange-600`;
const secondary = `${button} border bg-card text-foreground hover:bg-secondary`;
const ready = (account: TelegramConnectionAccount) => account.status === "CONNECTED" && account.authState === "READY";

function AuthForm({ account, locale, disabled, submit }: { account: TelegramConnectionAccount; locale: string; disabled: boolean; submit: (action: Action) => Promise<void> }) {
  const copy = telegramConnectionCopy(locale);
  const step = steps[account.authState];
  const [value, setValue] = useState("");
  const [countryIso, setCountryIso] = useState(() => getCountryByLocale(locale)?.countryIso ?? "TR");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  if (!step) return null;
  const country = countryRegistry.find((item) => item.countryIso === countryIso)!;
  const query = normalizeCountrySearch(search);
  const countries = countryRegistry.filter((item) => normalizeCountrySearch([item.countryName, item.nativeCountryName, item.countryIso, item.callingCode, ...(item.aliases ?? [])].join(" ")).includes(query));
  const label = { phone: copy.phone, code: copy.code, password: copy.password, email: copy.email, email_code: copy.emailCode }[step];
  const help = { phone: copy.phoneHelp, code: copy.codeHelp, password: copy.passwordHelp, email: copy.emailHelp, email_code: copy.emailCodeHelp }[step];
  const inputId = `telegram-${account.id}-${step}`;
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (disabled || !value.length) return;
    setError("");
    let submitted = step === "password" ? value : value.trim();
    if (step === "phone") {
      try { submitted = normalizePhonePairingInput({ countryIso, nationalNumber: value }).e164; }
      catch { setError(copy.invalidPhone); return; }
    }
    // Submitted credentials are kept only for this form and never persisted.
    setValue("");
    await submit({ action: "auth", accountId: account.id, auth: { step, value: submitted } });
  }
  return <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
    {step === "phone" && <fieldset disabled={disabled} className="space-y-2">
      <legend className="mb-2 text-sm font-semibold">{copy.country}</legend>
      <input aria-label={copy.search} className={field} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} type="search" />
      <select aria-label={copy.country} className={field} value={countryIso} onChange={(event) => { setCountryIso(event.target.value); setError(""); }}>
        {!countries.some((item) => item.countryIso === countryIso) && <option value={countryIso}>{country.nativeCountryName} · {country.callingCode}</option>}
        {countries.map((item) => <option key={item.countryIso} value={item.countryIso}>{item.nativeCountryName} · {item.countryName} ({item.countryIso}) {item.callingCode}</option>)}
      </select>
      {countries.length === 0 && <p className="text-sm text-muted">{copy.noCountries}</p>}
    </fieldset>}
    <label htmlFor={inputId} className="block text-sm font-semibold">{label}</label>
    <input id={inputId} className={field} value={value} onChange={(event) => setValue(event.target.value)} disabled={disabled} required
      type={step === "password" ? "password" : step === "email" ? "email" : step === "phone" ? "tel" : "text"}
      inputMode={step === "phone" ? "tel" : step === "code" || step === "email_code" ? "numeric" : undefined}
      autoComplete={step === "phone" ? "tel-national" : step === "code" || step === "email_code" ? "one-time-code" : step === "email" ? "email" : "off"}
      maxLength={step === "password" ? 256 : step === "email" ? 254 : step === "phone" ? 32 : 16}
      placeholder={step === "phone" ? country.phonePlaceholder : undefined} dir={step === "password" ? undefined : "ltr"} aria-describedby={`${inputId}-help`} autoFocus={step !== "phone"} />
    <p id={`${inputId}-help`} className="text-sm leading-6 text-muted">{help}</p>
    {step === "password" && account.authStateDetail?.passwordHint && <p className="text-sm text-muted">{copy.hint}: {account.authStateDetail.passwordHint}</p>}
    {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}
    <button className={`${primary} w-full`} disabled={disabled || !value.length} type="submit">{disabled ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}{step === "phone" ? copy.connect : copy.next}</button>
  </form>;
}

export function TelegramAccountConnection({ accounts, locale, onAccountsChange, onRefresh }: {
  accounts: TelegramConnectionAccount[]; locale: string;
  onAccountsChange: (accounts: TelegramConnectionAccount[]) => void; onRefresh: () => Promise<void>;
}) {
  const copy = telegramConnectionCopy(locale);
  const [working, setWorking] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const currentAccounts = useRef(accounts);
  useEffect(() => { currentAccounts.current = accounts; }, [accounts]);

  const refreshAccounts = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/web/telegram/accounts", { cache: "no-store", signal });
    const result = await response.json();
    if (!response.ok || !result.ok || !Array.isArray(result.accounts)) throw new Error("REFRESH_FAILED");
    if (signal?.aborted) return;
    const next = result.accounts as TelegramConnectionAccount[];
    const newlyConnected = next.some((item) => ready(item) && !currentAccounts.current.some((old) => old.id === item.id && ready(old)));
    onAccountsChange(next);
    if (newlyConnected) { setNotice(copy.done); await onRefresh(); }
  }, [onAccountsChange, onRefresh, copy.done]);

  const pending = accounts.some((account) => ["STARTING", "WAIT_PHONE_NUMBER", "WAIT_CODE", "WAIT_PASSWORD", "WAIT_EMAIL_ADDRESS", "WAIT_EMAIL_CODE", "WAIT_OTHER_DEVICE", "LOGGING_OUT"].includes(account.authState));
  useEffect(() => {
    if (!pending || working) return;
    const controller = new AbortController();
    let polling = false;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible" || polling || inFlight.current) return;
      polling = true;
      try { await refreshAccounts(controller.signal); }
      catch { /* Keep the current step available; manual refresh can report failures. */ }
      finally { polling = false; }
    }, 3000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [pending, working, refreshAccounts]);
  useEffect(() => {
    if (!retryAt) return;
    const update = () => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  async function act(action: Action) {
    if (inFlight.current || Date.now() < retryAt) return;
    inFlight.current = true;
    setWorking(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/web/telegram/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action) });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        if (result.retryAfterSeconds) setRetryAt(Date.now() + Number(result.retryAfterSeconds) * 1000);
        const messages: Record<string, string> = {
          TELEGRAM_AUTH_INVALID: copy.invalidAuth, TELEGRAM_CODE_EXPIRED: copy.expired, TELEGRAM_FLOOD_WAIT: copy.limited,
          RATE_LIMITED: copy.limited, TELEGRAM_PHONE_RESTRICTED: copy.restricted, VALIDATION_ERROR: copy.invalidPhone,
          TELEGRAM_AUTH_STATE_CHANGED: copy.changed, SERVICE_UNAVAILABLE: copy.unavailable, UNAUTHORIZED: copy.signedOut,
        };
        setError(messages[result.error] ?? copy.failure);
        await refreshAccounts().catch(() => undefined);
        return;
      }
      if (Array.isArray(result.accounts)) onAccountsChange(result.accounts);
      const connected = result.accounts?.some((item: TelegramConnectionAccount) => item.id === result.accountId && ready(item));
      setNotice(action.action === "sync" ? copy.syncDone : connected ? copy.done : action.action === "auth" ? copy.accepted : "");
      if (connected || action.action === "sync") await onRefresh();
    } catch { setError(copy.unavailable); await refreshAccounts().catch(() => undefined); }
    finally { inFlight.current = false; setWorking(false); }
  }
  const disabled = working || remaining > 0;
  return <div className="space-y-4 md:col-span-2 xl:col-span-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" className={primary} onClick={() => void act({ action: "create" })} disabled={disabled}><Plus className="h-4 w-4" />{copy.add}</button>
      <button type="button" className={secondary} disabled={working} onClick={() => { setError(""); void refreshAccounts().catch(() => setError(copy.unavailable)); }}><RefreshCw className="h-4 w-4" />{copy.refresh}</button>
    </div>
    <p className="max-w-3xl text-sm leading-6 text-muted">{accounts.length ? copy.help : copy.empty}</p>
    {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p>}
    {remaining > 0 && <p className="text-sm text-muted">{copy.limited} {remaining} {copy.seconds}</p>}
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {accounts.map((account) => <article key={account.id} className="min-w-0 rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="break-words font-semibold">{account.label}</h2><p className="mt-1 text-sm text-muted" dir="ltr">{account.username ? `@${account.username}` : account.phoneNumberMasked || "Telegram"}</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ready(account) ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "bg-orange-500/10 text-orange-700 dark:text-orange-300"}`}>{ready(account) ? copy.connected : copy.closed}</span>
        </div>
        {ready(account) ? <button type="button" className={`${secondary} mt-5 w-full`} disabled={disabled} onClick={() => void act({ action: "sync", accountId: account.id })}><CheckCircle2 className="h-4 w-4" />{copy.sync}</button> : <>
          {account.lastErrorCode && <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{copy.hiddenError}</p>}
          <AuthForm key={`${account.id}:${account.authState}`} account={account} locale={locale} disabled={disabled} submit={act} />
          {account.authState === "WAIT_OTHER_DEVICE" && <p role="status" className="mt-4 text-sm leading-6 text-muted">{copy.otherDevice}</p>}
          {["STARTING", "LOGGING_OUT"].includes(account.authState) && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted"><LoaderCircle className="h-4 w-4 animate-spin" />{copy.starting}</p>}
          {!steps[account.authState] && account.authState !== "WAIT_OTHER_DEVICE" && account.authState !== "LOGGING_OUT" && <button type="button" className={`${primary} mt-5 w-full`} disabled={disabled} onClick={() => void act({ action: "start", accountId: account.id })}><Smartphone className="h-4 w-4" />{copy.restart}</button>}
        </>}
      </article>)}
    </div>
  </div>;
}
