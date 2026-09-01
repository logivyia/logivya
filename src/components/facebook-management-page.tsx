"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, FileClock, History, LoaderCircle, Send, SquareStack } from "lucide-react";

import { useI18n } from "@/i18n/provider";

type FacebookPage = {
  id: string;
  pageId?: string | null;
  name: string;
  username?: string | null;
  category?: string | null;
  pictureUrl?: string | null;
  status: string;
  canPublish: boolean;
  lastSyncedAt?: string | null;
};

type FacebookHistoryItem = {
  id: string;
  pageName: string;
  content: string;
  status: string;
  scheduledAt?: string | null;
  attachmentCount: number;
  createdAt: string;
  sentAt?: string | null;
  errorMessage?: string | null;
};

type WorkspaceResponse = {
  ok?: boolean;
  message?: string;
  pages?: FacebookPage[];
  history?: FacebookHistoryItem[];
};

type Tab = "pages" | "compose" | "history";

const card = "rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]";
const field = "w-full rounded-xl border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-300";

function textFor(locale: string) {
  const tr = locale.toLowerCase().startsWith("tr");
  return tr
    ? {
        eyebrow: "FACEBOOK",
        title: "Facebook Yönetimi",
        description: "Facebook sayfalarınızı bağlayın, gönderi oluşturun, yayınları zamanlayın ve geçmişi yönetin.",
        pages: "Sayfalar",
        compose: "Gönderi Oluştur",
        history: "Geçmiş",
        noPages: "Henüz bağlı bir Facebook sayfası yok.",
        connectionHelp: "Meta bağlantısını LOGIVYA mobil uygulamasındaki güvenli OAuth akışıyla tamamlayın. Bağlanan sayfalar burada otomatik görünür.",
        connected: "Yayına hazır",
        reconnect: "Yeniden bağlantı gerekli",
        selectPages: "Gönderinin yayınlanacağı sayfaları seçin.",
        selected: "sayfa seçildi",
        content: "Gönderi metni",
        contentPlaceholder: "Facebook gönderinizi yazın",
        link: "Bağlantı (isteğe bağlı)",
        linkPlaceholder: "https://ornek.com",
        schedule: "Yayın tarihi (isteğe bağlı)",
        scheduleHelp: "Planlanan gönderiler en az 10 dakika sonrası için oluşturulabilir.",
        publish: "Gönderiyi sıraya al",
        publishing: "Sıraya alınıyor",
        queued: "Facebook gönderisi yayın kuyruğuna alındı.",
        choosePage: "Yayına hazır en az bir sayfa seçin.",
        enterContent: "Gönderi metni veya bağlantı girin.",
        invalidSchedule: "Geçerli bir yayın tarihi seçin.",
        emptyHistory: "Henüz Facebook gönderisi yok.",
        reload: "Yenile",
        loading: "Facebook çalışma alanı yükleniyor…",
      }
    : {
        eyebrow: "FACEBOOK",
        title: "Facebook Management",
        description: "Connect Facebook Pages, create posts, schedule publication, and manage history.",
        pages: "Pages",
        compose: "Create Post",
        history: "History",
        noPages: "No Facebook Page is connected yet.",
        connectionHelp: "Complete Meta connection through the secure OAuth flow in the LOGIVYA mobile app. Connected Pages appear here automatically.",
        connected: "Ready to publish",
        reconnect: "Reconnect required",
        selectPages: "Select the Pages where this post should be published.",
        selected: "Pages selected",
        content: "Post text",
        contentPlaceholder: "Write your Facebook post",
        link: "Link (optional)",
        linkPlaceholder: "https://example.com",
        schedule: "Publication date (optional)",
        scheduleHelp: "Scheduled posts must be created at least 10 minutes in advance.",
        publish: "Queue post",
        publishing: "Queueing",
        queued: "The Facebook post was added to the publication queue.",
        choosePage: "Select at least one Page that is ready to publish.",
        enterContent: "Enter post text or a link.",
        invalidSchedule: "Choose a valid publication date.",
        emptyHistory: "No Facebook posts yet.",
        reload: "Refresh",
        loading: "Loading Facebook workspace…",
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
  if (["CONNECTED", "SENT", "COMPLETED"].includes(normalized)) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (["FAILED", "ERROR", "CANCELED", "RECONNECT_REQUIRED", "ARCHIVED"].includes(normalized)) return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
  return "bg-orange-500/10 text-orange-700 dark:text-orange-300";
}

export function FacebookManagementPage() {
  const { locale } = useI18n();
  const copy = useMemo(() => textFor(locale), [locale]);
  const [tab, setTab] = useState<Tab>("pages");
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [historyItems, setHistoryItems] = useState<FacebookHistoryItem[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/web/facebook/workspace", { cache: "no-store" });
      const value = await response.json().catch(() => ({})) as WorkspaceResponse;
      if (!response.ok || !value.ok) throw new Error(value.message || "Facebook çalışma alanı yüklenemedi.");
      const nextPages = Array.isArray(value.pages) ? value.pages : [];
      setPages(nextPages);
      setHistoryItems(Array.isArray(value.history) ? value.history : []);
      setSelectedPageIds((current) => current.filter((id) => nextPages.some((page) => page.id === id && page.canPublish)));
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Facebook çalışma alanı yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch synchronizes this client workspace with the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function togglePage(id: string) {
    setSelectedPageIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function submit() {
    setError("");
    setNotice("");
    if (!selectedPageIds.length) {
      setError(copy.choosePage);
      return;
    }
    if (!message.trim() && !link.trim()) {
      setError(copy.enterContent);
      return;
    }
    let scheduledIso: string | undefined;
    if (scheduledAt) {
      const date = new Date(scheduledAt);
      if (Number.isNaN(date.getTime())) {
        setError(copy.invalidSchedule);
        return;
      }
      scheduledIso = date.toISOString();
    }
    try {
      setSubmitting(true);
      const response = await fetch("/api/web/facebook/workspace", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          pageAccountIds: selectedPageIds,
          message: message.trim(),
          link: link.trim() || undefined,
          mediaFileIds: [],
          scheduledAt: scheduledIso,
        }),
      });
      const value = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
      if (!response.ok || !value.ok) throw new Error(value.message || "Facebook gönderisi oluşturulamadı.");
      setMessage("");
      setLink("");
      setScheduledAt("");
      setSelectedPageIds([]);
      setNotice(copy.queued);
      setTab("history");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Facebook gönderisi oluşturulamadı.");
    } finally {
      setSubmitting(false);
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof SquareStack }> = [
    { id: "pages", label: copy.pages, icon: SquareStack },
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

      <nav className="grid grid-cols-3 gap-2 rounded-2xl border bg-card p-2 shadow-[var(--shadow-soft)]" role="tablist" aria-label={copy.title}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} id={`facebook-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`facebook-panel-${id}`} onClick={() => setTab(id)} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold transition ${tab === id ? "bg-orange-500 text-white shadow" : "text-muted hover:bg-secondary hover:text-foreground"}`}>
            <Icon className="h-4 w-4" aria-hidden="true" /><span>{label}</span>
          </button>
        ))}
      </nav>

      <div aria-live="polite" className="space-y-2">
        {error && <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}
        {notice && <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</p>}
      </div>

      {loading && pages.length === 0 ? (
        <div className={`${card} flex min-h-40 items-center justify-center gap-3 text-sm text-muted`}><LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />{copy.loading}</div>
      ) : (
        <>
          <section id="facebook-panel-pages" role="tabpanel" aria-labelledby="facebook-tab-pages" hidden={tab !== "pages"} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pages.length === 0 ? (
              <div className={`${card} md:col-span-2 xl:col-span-3`}><h2 className="font-semibold text-foreground">{copy.noPages}</h2><p className="mt-2 text-sm leading-6 text-muted">{copy.connectionHelp}</p></div>
            ) : pages.map((page) => (
              <article key={page.id} className={card}>
                <div className="flex items-start gap-3">
                  {page.pictureUrl ? <img src={page.pictureUrl} alt="" className="h-12 w-12 rounded-full border object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-full bg-blue-500/10 text-lg font-bold text-blue-700">{page.name.slice(0, 1).toUpperCase()}</span>}
                  <div className="min-w-0 flex-1"><h2 className="truncate font-semibold text-foreground">{page.name}</h2><p className="truncate text-sm text-muted">{page.username ? `@${page.username}` : page.category || "Facebook Page"}</p></div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(page.canPublish ? "CONNECTED" : page.status)}`}>{page.canPublish ? copy.connected : copy.reconnect}</span><span className="text-xs text-muted">{formatDate(page.lastSyncedAt, locale)}</span></div>
              </article>
            ))}
          </section>

          <section id="facebook-panel-compose" role="tabpanel" aria-labelledby="facebook-tab-compose" hidden={tab !== "compose"} className={`${card} max-w-4xl`}>
            <div className="flex items-center gap-3"><Send className="h-5 w-5 text-orange-500" aria-hidden="true" /><div><h2 className="font-semibold text-foreground">{copy.compose}</h2><p className="text-sm text-muted">{copy.selectPages}</p></div></div>
            {pages.length === 0 ? <p className="mt-5 rounded-xl bg-orange-500/10 p-4 text-sm text-orange-800 dark:text-orange-200">{copy.connectionHelp}</p> : (
              <fieldset className="mt-5"><legend className="sr-only">{copy.selectPages}</legend><div className="grid gap-2 sm:grid-cols-2">{pages.map((page) => (
                <label key={page.id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${selectedPageIds.includes(page.id) ? "border-orange-500 bg-orange-500/5" : "hover:bg-secondary"} ${!page.canPublish ? "cursor-not-allowed opacity-60" : ""}`}>
                  <input type="checkbox" className="h-4 w-4 accent-orange-500" checked={selectedPageIds.includes(page.id)} onChange={() => togglePage(page.id)} disabled={!page.canPublish} /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-foreground">{page.name}</span><span className="block text-xs text-muted">{page.canPublish ? copy.connected : copy.reconnect}</span></span>
                </label>
              ))}</div><p className="mt-2 text-xs text-muted">{selectedPageIds.length} {copy.selected}</p></fieldset>
            )}
            <label className="mt-5 block text-sm font-semibold text-foreground"><span className="mb-2 block">{copy.content}</span><textarea className={`${field} min-h-36 resize-y`} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={copy.contentPlaceholder} maxLength={20_000} /></label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-foreground"><span className="mb-2 block">{copy.link}</span><input type="url" className={field} value={link} onChange={(event) => setLink(event.target.value)} placeholder={copy.linkPlaceholder} maxLength={2_000} /></label>
              <label className="text-sm font-semibold text-foreground"><span className="mb-2 block">{copy.schedule}</span><input type="datetime-local" className={field} value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /><span className="mt-1 block text-xs font-normal text-muted">{copy.scheduleHelp}</span></label>
            </div>
            <button type="button" className={`${primaryButton} mt-5`} onClick={() => void submit()} disabled={submitting || !pages.some((page) => page.canPublish)}><Send className="h-4 w-4" aria-hidden="true" />{submitting ? copy.publishing : copy.publish}</button>
          </section>

          <section id="facebook-panel-history" role="tabpanel" aria-labelledby="facebook-tab-history" hidden={tab !== "history"} className={card}>
            <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-foreground">{copy.history}</h2><button type="button" className="rounded-xl border px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary" onClick={() => void load()} disabled={loading}>{copy.reload}</button></div>
            {historyItems.length === 0 ? <p className="mt-5 rounded-xl bg-secondary p-4 text-sm text-muted">{copy.emptyHistory}</p> : (
              <div className="mt-5 divide-y">{historyItems.map((item) => (
                <article key={item.id} className="grid gap-3 py-4 first:pt-0 sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-foreground">{item.pageName}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(item.status)}`}>{item.status}</span></div><p className="mt-1 line-clamp-2 text-sm text-muted">{item.content || "—"}</p>{item.errorMessage && <p className="mt-2 text-xs text-rose-600">{item.errorMessage}</p>}</div>
                  <div className="flex items-center gap-2 text-xs text-muted sm:justify-end">{item.scheduledAt ? <FileClock className="h-3.5 w-3.5" aria-hidden="true" /> : <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />}{formatDate(item.scheduledAt || item.sentAt || item.createdAt, locale)}</div>
                </article>
              ))}</div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
