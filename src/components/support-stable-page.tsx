"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, ExternalLink, MessageSquare, Plus, RefreshCw, Send } from "lucide-react";
import { apiErrorMessage } from "@/i18n/api-error";
import { formatDateTime } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";

type SupportMessage = {
  id: string;
  senderType: string;
  message: string;
  attachmentUrl?: string | null;
  createdAt: string;
};

type SupportTicket = {
  id: string;
  publicId: string;
  subject: string;
  title?: string;
  type: string;
  category?: string;
  status: string;
  priority?: string;
  createdAt?: string;
  lastMessageAt?: string;
  unreadReplyCount?: number;
  userUnreadCount?: number;
  messages?: SupportMessage[];
};

type PageInfo = { hasMore: boolean; nextCursor: string | null };

const categories = [
  "TECHNICAL",
  "WHATSAPP_CONNECTION",
  "MESSAGE_DELIVERY",
  "DELETE_FOR_EVERYONE",
  "ACCOUNT",
  "SUBSCRIPTION",
  "BILLING",
  "TEAM",
  "SECURITY",
  "FEATURE_REQUEST",
  "OTHER",
] as const;

const categoryKeys: Record<string, string> = {
  TECHNICAL: "support.category.technical",
  WHATSAPP_CONNECTION: "support.category.whatsappConnection",
  MESSAGE_DELIVERY: "support.category.messageDelivery",
  DELETE_FOR_EVERYONE: "support.category.deleteForEveryone",
  ACCOUNT: "support.category.account",
  SUBSCRIPTION: "support.category.subscription",
  BILLING: "support.category.billing",
  TEAM: "support.category.team",
  SECURITY: "support.category.security",
  FEATURE_REQUEST: "support.category.featureRequest",
  OTHER: "support.category.other",
};

const field = "w-full rounded-lg border bg-input px-4 py-3 text-sm text-input-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary";
const primaryButton = "inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex min-h-10 items-center justify-center rounded-lg border bg-background px-4 py-2 text-sm font-semibold transition hover:border-primary disabled:opacity-50";

function statusLabel(status: string, t: ReturnType<typeof useI18n>["t"]) {
  return t(`status.${status.toLowerCase()}`);
}

function categoryLabel(category: string, t: ReturnType<typeof useI18n>["t"]) {
  return t(categoryKeys[category] ?? "support.category.other");
}

function messageRoleLabel(senderType: string, t: ReturnType<typeof useI18n>["t"]) {
  return senderType === "ADMIN" ? t("adminSupport.adminReply") : t("adminSupport.userMessage");
}

function operationId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function SupportStablePage({ initialPublicId }: { initialPublicId?: string }) {
  const { locale, t } = useI18n();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({ hasMore: false, nextCursor: null });
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replying, setReplying] = useState(false);
  const pendingReply = useRef<{ body: string; id: string } | null>(null);

  const load = useCallback(async (cursor?: string | null, silent = false) => {
    if (cursor) setLoadingMore(true);
    else if (!silent) setLoading(true);
    if (!silent) setError("");
    try {
      const query = new URLSearchParams({ limit: "20" });
      if (statusFilter !== "ALL") query.set("status", statusFilter);
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/support/tickets?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(t, payload, "support.loadFailed"));
      setTickets((current) => cursor ? [...current, ...(payload.tickets || [])] : payload.tickets || []);
      setPageInfo(payload.pageInfo || { hasMore: false, nextCursor: null });
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : t("support.loadFailed"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [statusFilter, t]);

  const openTicket = useCallback(async (identifier: string, options: { updateUrl?: boolean; silent?: boolean } = {}) => {
    if (!options.silent) setDetailLoading(true);
    if (!options.silent) setError("");
    try {
      const response = await fetch(`/api/support/tickets/${encodeURIComponent(identifier)}?limit=50`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(t, payload, "support.accessDenied"));
      setSelected(payload.ticket);
      setTickets((current) => current.map((ticket) => ticket.publicId === payload.ticket.publicId
        ? { ...ticket, unreadReplyCount: 0, userUnreadCount: 0 }
        : ticket));
      setReplyText("");
      pendingReply.current = null;
      if (options.updateUrl !== false) window.history.replaceState(null, "", `/support/${encodeURIComponent(payload.ticket.publicId)}`);
    } catch (openError) {
      if (!options.silent) setError(openError instanceof Error ? openError.message : t("support.accessDenied"));
    } finally {
      if (!options.silent) setDetailLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!initialPublicId) return;
    const timer = window.setTimeout(() => void openTicket(initialPublicId, { updateUrl: false }), 0);
    return () => window.clearTimeout(timer);
  }, [initialPublicId, openTicket]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load(undefined, true);
      if (selected?.publicId) void openTicket(selected.publicId, { updateUrl: false, silent: true });
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [load, openTicket, selected?.publicId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const clientMessageId = operationId("ticket");
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, clientMessageId, clientRequestId: clientMessageId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(t, payload, "support.createFailed"));
      form.reset();
      setNotice(t("support.created"));
      await load();
      await openTicket(payload.ticket.publicId || payload.ticket.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("support.createFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = replyText.trim();
    if (!selected || !body || replying || selected.status === "CLOSED") return;
    if (!pendingReply.current || pendingReply.current.body !== body) {
      pendingReply.current = { body, id: operationId("reply") };
    }
    setReplying(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/support/tickets/${encodeURIComponent(selected.publicId || selected.id)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, clientMessageId: pendingReply.current.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(t, payload, "support.replyFailed"));
      pendingReply.current = null;
      setReplyText("");
      setNotice(t("support.replySent"));
      await Promise.all([load(), openTicket(selected.publicId || selected.id, { updateUrl: false })]);
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : t("support.replyFailed"));
    } finally {
      setReplying(false);
    }
  }

  return (
    <div>
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("nav.support")}</p>
        <h1 className="mt-2 text-3xl font-semibold">{t("support.centerTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{t("support.centerDescription")}</p>
      </header>

      <form onSubmit={submit} className="mb-6 grid gap-3 border-y py-5 md:grid-cols-2">
        <input required name="subject" minLength={3} maxLength={160} placeholder={t("support.subject")} className={field} />
        <select name="category" className={field} defaultValue="TECHNICAL">
          {categories.map((category) => <option key={category} value={category}>{categoryLabel(category, t)}</option>)}
        </select>
        <textarea required name="message" minLength={5} maxLength={10000} placeholder={t("support.describeIssue")} className={`${field} min-h-28 md:col-span-2`} />
        <button disabled={submitting} className={primaryButton}>
          {submitting ? <RefreshCw className="me-2 size-4 animate-spin" /> : <Plus className="me-2 size-4" />}
          {submitting ? t("support.sending") : t("support.create")}
        </button>
      </form>

      <div aria-live="polite">
        {error ? <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm font-semibold text-red-600">{error}</p> : null}
        {notice ? <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-600">{notice}</p> : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-2" aria-label={locale === "tr" ? "Talep durumu" : "Ticket status"}>
        {["ALL", "WAITING_FOR_ADMIN", "WAITING_FOR_USER", "RESOLVED", "CLOSED"].map((value) => (
          <button key={value} type="button" className={statusFilter === value ? primaryButton : secondaryButton} onClick={() => setStatusFilter(value)}>
            {value === "ALL" ? (locale === "tr" ? "Tümü" : "All") : statusLabel(value, t)}
          </button>
        ))}
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,480px)]">
        <section className="min-w-0">
          {loading ? (
            <div className="grid min-h-48 place-items-center border-y text-sm text-muted"><RefreshCw className="me-2 inline size-4 animate-spin" />{t("support.loading")}</div>
          ) : tickets.length ? (
            <div className="grid gap-2">
              {tickets.map((ticket) => {
                const unread = ticket.unreadReplyCount || ticket.userUnreadCount || 0;
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => void openTicket(ticket.publicId || ticket.id)}
                    className={`w-full rounded-lg border p-4 text-start transition hover:border-primary ${selected?.id === ticket.id ? "border-primary bg-primary/5" : "bg-card"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="truncate text-sm font-semibold">{ticket.title || ticket.subject}</h2>
                          {unread ? <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">{unread}</span> : null}
                        </div>
                        <p className="mt-1 text-xs text-muted">{ticket.publicId} · {categoryLabel(ticket.category || ticket.type, t)}</p>
                      </div>
                      <span className="rounded-full border px-2.5 py-1 text-xs font-semibold">{statusLabel(ticket.status, t)}</span>
                    </div>
                    {ticket.messages?.[0]?.message ? <p className="mt-3 line-clamp-2 text-sm text-muted">{ticket.messages[0].message}</p> : null}
                    <p className="mt-3 text-xs text-muted">{ticket.lastMessageAt ? formatDateTime(ticket.lastMessageAt, locale) : ""}</p>
                  </button>
                );
              })}
              {pageInfo.hasMore ? (
                <button type="button" className={secondaryButton} disabled={loadingMore} onClick={() => void load(pageInfo.nextCursor)}>
                  {loadingMore ? <RefreshCw className="me-2 size-4 animate-spin" /> : <ChevronDown className="me-2 size-4" />}
                  {t("support.loadMore")}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid min-h-48 place-items-center border-y px-4 text-center text-sm text-muted">{t("support.empty.user")}</div>
          )}
        </section>

        <aside className="min-w-0 rounded-lg border bg-card p-5">
          {!selected || detailLoading ? (
            <div className="grid min-h-80 place-items-center text-center text-sm text-muted">
              <div><MessageSquare className="mx-auto mb-3 size-8 text-primary" />{detailLoading ? t("adminSupport.ticketLoading") : t("support.selectConversation")}</div>
            </div>
          ) : (
            <div className="grid gap-5">
              <div>
                <p className="text-xs font-semibold text-primary">{selected.publicId}</p>
                <h2 className="mt-2 text-xl font-semibold">{selected.title || selected.subject}</h2>
                <p className="mt-1 text-xs text-muted">{categoryLabel(selected.category || selected.type, t)} · {statusLabel(selected.status, t)}</p>
              </div>
              <div className="grid max-h-[440px] gap-3 overflow-y-auto pe-1" aria-label={t("support.conversation")}>
                {(selected.messages || []).map((message) => (
                  <article key={message.id} className={`max-w-[90%] rounded-lg border p-3 ${message.senderType === "ADMIN" ? "bg-primary/5" : "ms-auto bg-background"}`}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-muted">{messageRoleLabel(message.senderType, t)}</p>
                      <p className="text-xs text-muted">{formatDateTime(message.createdAt, locale)}</p>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.message}</p>
                    {message.attachmentUrl ? <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary"><ExternalLink className="size-4" />{locale === "tr" ? "Eki aç" : "Open attachment"}</a> : null}
                  </article>
                ))}
              </div>
              {selected.status === "CLOSED" ? (
                <p className="rounded-lg bg-muted/10 p-4 text-sm font-semibold text-muted">{t("support.closedNoReply")}</p>
              ) : (
                <form className="grid gap-3" onSubmit={sendReply}>
                  <label className="text-xs font-semibold uppercase text-muted">{t("adminSupport.writeReply")}</label>
                  <textarea
                    value={replyText}
                    onChange={(event) => {
                      setReplyText(event.target.value);
                      if (pendingReply.current?.body !== event.target.value.trim()) pendingReply.current = null;
                    }}
                    maxLength={10000}
                    className={`${field} min-h-28`}
                    placeholder={t("support.replyPlaceholder")}
                  />
                  <button disabled={replying || !replyText.trim()} className={primaryButton}>
                    {replying ? <RefreshCw className="me-2 size-4 animate-spin" /> : <Send className="me-2 size-4" />}
                    {t("adminSupport.sendReply")}
                  </button>
                </form>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
