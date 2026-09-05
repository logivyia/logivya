"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, History, LoaderCircle, MessageCircle, Send, Smartphone, UsersRound } from "lucide-react";

import { useI18n } from "@/i18n/provider";

type TelegramAccount = {
  id: string;
  label: string;
  username?: string | null;
  phoneNumberMasked?: string | null;
  status: string;
  authState: string;
  lastSyncedAt?: string | null;
};

type TelegramChat = {
  id: string;
  accountId: string;
  title: string;
  username?: string | null;
  type: string;
  participantCount?: number | null;
  canSend: boolean;
  isArchived: boolean;
  lastSyncedAt?: string | null;
  categoryAssignments: Array<{ category: { id: string; name: string; color?: string | null } }>;
};

type TelegramHistoryItem = {
  id: string;
  title?: string | null;
  content: string;
  status: string;
  scheduleType: string;
  createdAt: string;
  scheduledAt?: string | null;
  account: { id: string; label: string; username?: string | null };
  targets: Array<{ chat: { id: string; title: string; type: string } }>;
};

type WorkspaceResponse = {
  ok?: boolean;
  message?: string;
  accounts?: TelegramAccount[];
  selectedAccountId?: string | null;
  chats?: TelegramChat[];
  history?: { items?: TelegramHistoryItem[] };
};

type Tab = "accounts" | "chats" | "compose" | "history";
type ScheduleType = "SEND_NOW" | "SCHEDULED" | "RECURRING";

const card = "rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]";
const field = "w-full rounded-xl border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-300";

function textFor(locale: string) {
  const tr = locale.toLowerCase().startsWith("tr");
  return tr
    ? {
        eyebrow: "TELEGRAM",
        title: "Telegram Yönetimi",
        description: "Telegram hesabınızı bağlayın, sohbetlerinizi yönetin, mesaj gönderin ve geçmişi tek ekrandan takip edin.",
        accounts: "Hesaplar",
        chats: "Sohbetler",
        compose: "Mesaj Gönder",
        history: "Geçmiş",
        account: "Telegram hesabı",
        connected: "Bağlı",
        notConnected: "Bağlantı gerekli",
        noAccounts: "Henüz bir Telegram hesabı yok.",
        connectionHelp: "Hesap bağlantısını LOGIVYA mobil uygulamasındaki güvenli Telegram doğrulama akışıyla tamamlayın.",
        noChats: "Bu hesaba ait etkin sohbet bulunamadı. Mobil uygulamadan sohbetleri eşitleyin.",
        selectChats: "Mesaj göndermek istediğiniz sohbetleri seçin.",
        selected: "seçildi",
        content: "Mesaj",
        contentPlaceholder: "Mesajınızı yazın",
        titleLabel: "Kampanya başlığı (isteğe bağlı)",
        sendMode: "Gönderim türü",
        now: "Şimdi gönder",
        scheduled: "Zamanla",
        recurring: "Tekrarlı",
        date: "Başlangıç tarihi",
        frequency: "Sıklık",
        daily: "Günlük",
        weekly: "Haftalık",
        monthly: "Aylık",
        send: "Gönderimi oluştur",
        sending: "Oluşturuluyor",
        sent: "Gönderim kuyruğa alındı.",
        reload: "Yenile",
        emptyHistory: "Henüz Telegram gönderimi yok.",
        target: "hedef",
        loading: "Telegram çalışma alanı yükleniyor…",
        chooseTarget: "En az bir sohbet seçin.",
        enterContent: "Bir mesaj yazın.",
        chooseDate: "Geçerli bir başlangıç tarihi seçin.",
      }
    : {
        eyebrow: "TELEGRAM",
        title: "Telegram Management",
        description: "Connect your Telegram account, manage chats, send messages, and review history in one workspace.",
        accounts: "Accounts",
        chats: "Chats",
        compose: "Send Message",
        history: "History",
        account: "Telegram account",
        connected: "Connected",
        notConnected: "Connection required",
        noAccounts: "No Telegram account is available yet.",
        connectionHelp: "Complete account connection through the secure Telegram verification flow in the LOGIVYA mobile app.",
        noChats: "No active chats were found for this account. Sync chats from the mobile app.",
        selectChats: "Select the chats that should receive this message.",
        selected: "selected",
        content: "Message",
        contentPlaceholder: "Write your message",
        titleLabel: "Campaign title (optional)",
        sendMode: "Delivery type",
        now: "Send now",
        scheduled: "Schedule",
        recurring: "Recurring",
        date: "Start date",
        frequency: "Frequency",
        daily: "Daily",
        weekly: "Weekly",
        monthly: "Monthly",
        send: "Create delivery",
        sending: "Creating",
        sent: "Delivery was queued.",
        reload: "Refresh",
        emptyHistory: "No Telegram deliveries yet.",
        target: "target",
        loading: "Loading Telegram workspace…",
        chooseTarget: "Select at least one chat.",
        enterContent: "Enter a message.",
        chooseDate: "Choose a valid start date.",
      };
}

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusTone(status: string) {
  const normalized = status.toUpperCase();
  if (["CONNECTED", "READY", "SENT", "COMPLETED", "ACTIVE"].includes(normalized)) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (["FAILED", "ERROR", "CANCELED", "ARCHIVED"].includes(normalized)) return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
  return "bg-orange-500/10 text-orange-700 dark:text-orange-300";
}

export function TelegramManagementPage() {
  const { locale } = useI18n();
  const copy = useMemo(() => textFor(locale), [locale]);
  const [tab, setTab] = useState<Tab>("accounts");
  const [accounts, setAccounts] = useState<TelegramAccount[]>([]);
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [historyItems, setHistoryItems] = useState<TelegramHistoryItem[]>([]);
  const [accountId, setAccountId] = useState("");
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [campaignTitle, setCampaignTitle] = useState("");
  const [content, setContent] = useState("");
  const [scheduleType, setScheduleType] = useState<ScheduleType>("SEND_NOW");
  const [scheduledAt, setScheduledAt] = useState("");
  const [frequency, setFrequency] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("DAILY");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const query = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
      const response = await fetch(`/api/web/telegram/workspace${query}`, { cache: "no-store" });
      const value = await response.json().catch(() => ({})) as WorkspaceResponse;
      if (!response.ok || !value.ok) throw new Error(value.message || "Telegram çalışma alanı yüklenemedi.");
      const nextAccounts = Array.isArray(value.accounts) ? value.accounts : [];
      const nextAccountId = value.selectedAccountId || nextAccounts[0]?.id || "";
      setAccounts(nextAccounts);
      setChats(Array.isArray(value.chats) ? value.chats : []);
      setHistoryItems(Array.isArray(value.history?.items) ? value.history.items : []);
      setSelectedChatIds((current) => current.filter((id) => value.chats?.some((chat) => chat.id === id)));
      if (!accountId && nextAccountId) setAccountId(nextAccountId);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Telegram çalışma alanı yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    // Initial and account-context fetch synchronizes this client workspace with the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const accountReady = selectedAccount?.status === "CONNECTED" && selectedAccount.authState === "READY";

  function toggleChat(id: string) {
    setSelectedChatIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function submit() {
    setError("");
    setNotice("");
    if (!accountId || !accountReady) {
      setError(copy.notConnected);
      return;
    }
    if (!selectedChatIds.length) {
      setError(copy.chooseTarget);
      return;
    }
    if (!content.trim()) {
      setError(copy.enterContent);
      return;
    }
    let scheduledIso: string | undefined;
    if (scheduleType !== "SEND_NOW") {
      const date = new Date(scheduledAt);
      if (!scheduledAt || Number.isNaN(date.getTime())) {
        setError(copy.chooseDate);
        return;
      }
      scheduledIso = date.toISOString();
    }
    try {
      setSubmitting(true);
      const response = await fetch("/api/web/telegram/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          clientRequestId: crypto.randomUUID(),
          title: campaignTitle.trim() || undefined,
          content: content.trim(),
          mediaFileIds: [],
          chatIds: selectedChatIds,
          scheduleType,
          scheduledAt: scheduledIso,
          recurringRule: scheduleType === "RECURRING" ? { frequency, interval: 1 } : undefined,
        }),
      });
      const value = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
      if (!response.ok || !value.ok) throw new Error(value.message || "Gönderim oluşturulamadı.");
      setNotice(copy.sent);
      setContent("");
      setCampaignTitle("");
      setSelectedChatIds([]);
      setTab("history");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gönderim oluşturulamadı.");
    } finally {
      setSubmitting(false);
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Smartphone }> = [
    { id: "accounts", label: copy.accounts, icon: Smartphone },
    { id: "chats", label: copy.chats, icon: UsersRound },
    { id: "compose", label: copy.compose, icon: Send },
    { id: "history", label: copy.history, icon: History },
  ];

  return (
    <main className="space-y-6">
      <header className="rounded-3xl border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8">
        <p className="text-xs font-bold tracking-[0.24em] text-orange-600">{copy.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">{copy.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{copy.description}</p>
      </header>

      <nav className="grid grid-cols-2 gap-2 rounded-2xl border bg-card p-2 shadow-[var(--shadow-soft)] lg:grid-cols-4" role="tablist" aria-label={copy.title}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`telegram-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`telegram-panel-${id}`}
            onClick={() => setTab(id)}
            className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${tab === id ? "bg-orange-500 text-white shadow" : "text-muted hover:bg-secondary hover:text-foreground"}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {accounts.length > 0 && (
        <label className="block max-w-lg text-sm font-semibold text-foreground">
          <span className="mb-2 block">{copy.account}</span>
          <select className={field} value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={loading || submitting}>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.label}{account.username ? ` · @${account.username}` : ""}</option>)}
          </select>
        </label>
      )}

      <div aria-live="polite" className="space-y-2">
        {error && <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}
        {notice && <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</p>}
      </div>

      {loading && accounts.length === 0 ? (
        <div className={`${card} flex min-h-40 items-center justify-center gap-3 text-sm text-muted`}><LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />{copy.loading}</div>
      ) : (
        <>
          <section id="telegram-panel-accounts" role="tabpanel" aria-labelledby="telegram-tab-accounts" hidden={tab !== "accounts"} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {accounts.length === 0 ? (
              <div className={`${card} md:col-span-2 xl:col-span-3`}>
                <h2 className="font-semibold text-foreground">{copy.noAccounts}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">{copy.connectionHelp}</p>
              </div>
            ) : accounts.map((account) => {
              const ready = account.status === "CONNECTED" && account.authState === "READY";
              return (
                <article key={account.id} className={card}>
                  <div className="flex items-start justify-between gap-4">
                    <div><h2 className="font-semibold text-foreground">{account.label}</h2><p className="mt-1 text-sm text-muted">{account.username ? `@${account.username}` : account.phoneNumberMasked || "Telegram"}</p></div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(ready ? "CONNECTED" : account.status)}`}>{ready ? copy.connected : copy.notConnected}</span>
                  </div>
                  <p className="mt-4 text-xs text-muted">{formatDate(account.lastSyncedAt, locale)}</p>
                </article>
              );
            })}
          </section>

          <section id="telegram-panel-chats" role="tabpanel" aria-labelledby="telegram-tab-chats" hidden={tab !== "chats"} className={card}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-semibold text-foreground">{copy.chats}</h2><p className="mt-1 text-sm text-muted">{copy.selectChats}</p></div>
              <span className="rounded-full bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-700 dark:text-orange-300">{selectedChatIds.length} {copy.selected}</span>
            </div>
            {chats.length === 0 ? <p className="mt-5 rounded-xl bg-secondary p-4 text-sm text-muted">{copy.noChats}</p> : (
              <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {chats.map((chat) => (
                  <label key={chat.id} className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${selectedChatIds.includes(chat.id) ? "border-orange-500 bg-orange-500/5" : "hover:bg-secondary"} ${!chat.canSend || chat.isArchived ? "cursor-not-allowed opacity-60" : ""}`}>
                    <input type="checkbox" className="h-4 w-4 accent-orange-500" checked={selectedChatIds.includes(chat.id)} onChange={() => toggleChat(chat.id)} disabled={!chat.canSend || chat.isArchived} />
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold text-foreground">{chat.title}</span><span className="block truncate text-xs text-muted">{chat.username ? `@${chat.username}` : chat.type}{chat.participantCount ? ` · ${chat.participantCount}` : ""}</span></span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section id="telegram-panel-compose" role="tabpanel" aria-labelledby="telegram-tab-compose" hidden={tab !== "compose"} className={`${card} max-w-4xl`}>
            <div className="flex items-center gap-3"><MessageCircle className="h-5 w-5 text-orange-500" aria-hidden="true" /><div><h2 className="font-semibold text-foreground">{copy.compose}</h2><p className="text-sm text-muted">{selectedChatIds.length} {copy.target}</p></div></div>
            {!accountReady && <p className="mt-4 rounded-xl bg-orange-500/10 p-4 text-sm text-orange-800 dark:text-orange-200">{copy.connectionHelp}</p>}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-foreground"><span className="mb-2 block">{copy.titleLabel}</span><input className={field} value={campaignTitle} onChange={(event) => setCampaignTitle(event.target.value)} maxLength={120} /></label>
              <label className="text-sm font-semibold text-foreground"><span className="mb-2 block">{copy.sendMode}</span><select className={field} value={scheduleType} onChange={(event) => setScheduleType(event.target.value as ScheduleType)}><option value="SEND_NOW">{copy.now}</option><option value="SCHEDULED">{copy.scheduled}</option><option value="RECURRING">{copy.recurring}</option></select></label>
              {scheduleType !== "SEND_NOW" && <label className="text-sm font-semibold text-foreground"><span className="mb-2 block">{copy.date}</span><input type="datetime-local" className={field} value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label>}
              {scheduleType === "RECURRING" && <label className="text-sm font-semibold text-foreground"><span className="mb-2 block">{copy.frequency}</span><select className={field} value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)}><option value="DAILY">{copy.daily}</option><option value="WEEKLY">{copy.weekly}</option><option value="MONTHLY">{copy.monthly}</option></select></label>}
            </div>
            <label className="mt-4 block text-sm font-semibold text-foreground"><span className="mb-2 block">{copy.content}</span><textarea className={`${field} min-h-36 resize-y`} value={content} onChange={(event) => setContent(event.target.value)} placeholder={copy.contentPlaceholder} maxLength={4096} /></label>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" className={primaryButton} onClick={() => void submit()} disabled={submitting || !accountReady}><Send className="h-4 w-4" aria-hidden="true" />{submitting ? copy.sending : copy.send}</button>
              <button type="button" className="rounded-xl border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary" onClick={() => setTab("chats")}>{copy.chats}</button>
            </div>
          </section>

          <section id="telegram-panel-history" role="tabpanel" aria-labelledby="telegram-tab-history" hidden={tab !== "history"} className={card}>
            <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-foreground">{copy.history}</h2><button type="button" className="rounded-xl border px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary" onClick={() => void load()} disabled={loading}>{copy.reload}</button></div>
            {historyItems.length === 0 ? <p className="mt-5 rounded-xl bg-secondary p-4 text-sm text-muted">{copy.emptyHistory}</p> : (
              <div className="mt-5 divide-y">
                {historyItems.map((item) => (
                  <article key={item.id} className="grid gap-3 py-4 first:pt-0 sm:grid-cols-[1fr_auto]">
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold text-foreground">{item.title || item.content || copy.compose}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(item.status)}`}>{item.status}</span></div><p className="mt-1 line-clamp-2 text-sm text-muted">{item.content}</p><p className="mt-2 text-xs text-muted">{item.account.label} · {item.targets.length} {copy.target}</p></div>
                    <div className="flex items-center gap-2 text-xs text-muted sm:justify-end"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{formatDate(item.scheduledAt || item.createdAt, locale)}</div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
