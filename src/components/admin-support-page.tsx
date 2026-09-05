"use client";
import { AdminMetricCard } from "./admin-metric-card";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ChevronDown,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Ticket,
  UserCheck,
  UserMinus,
} from "lucide-react";
import { apiErrorMessage } from "@/i18n/api-error";
import { formatDateTime } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";

type SupportMessage = {
  id: string;
  senderType: string;
  message: string;
  isInternal?: boolean;
  attachmentUrl?: string | null;
  createdAt: string;
};

type SupportAudit = {
  id: string;
  eventType: string;
  createdAt: string;
};

type SupportTicket = {
  id: string;
  publicId: string;
  title?: string;
  subject: string;
  category?: string;
  type: string;
  source?: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt?: string;
  lastMessageAt?: string;
  adminUnreadCount?: number;
  unreadReplyCount?: number;
  company?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string | null; email: string } | null;
  assignedToAdmin?: { id: string; name: string | null; email: string } | null;
  messages?: SupportMessage[];
  auditTrail?: SupportAudit[];
};

type Metrics = {
  totalOpen: number;
  open: number;
  inProgress: number;
  waitingForUser: number;
  waitingForAdmin: number;
  resolvedToday: number;
  urgent: number;
  unread: number;
  failedNotifications?: number;
  failedEmails?: number;
  averageFirstResponseSeconds: number | null;
};

type PageInfo = { hasMore: boolean; nextCursor: string | null };

const statuses = [
  "ALL",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_ADMIN",
  "WAITING_FOR_USER",
  "RESOLVED",
  "CLOSED",
] as const;
const priorities = ["ALL", "LOW", "NORMAL", "HIGH", "URGENT"] as const;
const categories = [
  "ALL",
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
const sorts = ["LAST_ACTIVITY", "NEWEST", "OLDEST", "PRIORITY"] as const;
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

const field =
  "w-full rounded-lg border bg-input px-3 py-2.5 text-sm text-input-foreground outline-none transition focus:border-primary";
const primaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50";
const secondaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border bg-background px-4 py-2.5 text-sm font-semibold hover:border-primary disabled:opacity-50";

function statusLabel(status: string, t: ReturnType<typeof useI18n>["t"]) {
  return t(`status.${status.toLowerCase()}`);
}

function priorityLabel(priority: string, t: ReturnType<typeof useI18n>["t"]) {
  return t(`priority.${priority.toLowerCase()}`);
}

function categoryLabel(category: string, t: ReturnType<typeof useI18n>["t"]) {
  return t(categoryKeys[category] ?? "support.category.other");
}

function operationId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function AdminSupportPage({
  initialPublicId,
  canManage,
}: {
  initialPublicId?: string;
  canManage: boolean;
}) {
  const { locale, t } = useI18n();
  const [status, setStatus] = useState("ALL");
  const [priority, setPriority] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [assignment, setAssignment] = useState("ALL");
  const [sort, setSort] = useState("LAST_ACTIVITY");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({
    hasMore: false,
    nextCursor: null,
  });
  const [messagePageInfo, setMessagePageInfo] = useState<PageInfo>({
    hasMore: false,
    nextCursor: null,
  });
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [statusDraft, setStatusDraft] = useState("OPEN");
  const [priorityDraft, setPriorityDraft] = useState("NORMAL");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pendingReply = useRef<{ body: string; id: string } | null>(null);

  const load = useCallback(
    async (cursor?: string | null, silent = false) => {
      if (cursor) setLoadingMore(true);
      else if (!silent) setLoading(true);
      if (!silent) setError("");
      try {
        const query = new URLSearchParams({
          limit: "30",
          status,
          priority,
          category,
        });
        if (search.trim()) query.set("search", search.trim());
        if (unreadOnly) query.set("unread", "true");
        if (assignment === "UNASSIGNED") query.set("unassigned", "true");
        if (assignment === "ME") query.set("assignedAdminId", "ME");
        query.set("sort", sort);
        if (createdFrom) query.set("createdFrom", createdFrom);
        if (createdTo) query.set("createdTo", createdTo);
        if (cursor) query.set("cursor", cursor);
        const response = await fetch(`/api/admin/support/tickets?${query}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(apiErrorMessage(t, payload, "support.loadFailed"));
        setTickets((current) =>
          cursor
            ? [...current, ...(payload.tickets || [])]
            : payload.tickets || [],
        );
        setPageInfo(payload.pageInfo || { hasMore: false, nextCursor: null });
        setMetrics(payload.metrics || null);
      } catch (loadError) {
        if (!silent)
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("support.loadFailed"),
          );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [
      assignment,
      category,
      createdFrom,
      createdTo,
      priority,
      search,
      sort,
      status,
      t,
      unreadOnly,
    ],
  );

  const openTicket = useCallback(
    async (
      identifier: string,
      options: {
        older?: boolean;
        updateUrl?: boolean;
        cursor?: string | null;
        silent?: boolean;
      } = {},
    ) => {
      if (!options.silent) setDetailLoading(true);
      if (!options.silent) setError("");
      try {
        const query = new URLSearchParams({ limit: "50" });
        if (options.older && options.cursor)
          query.set("cursor", options.cursor);
        const response = await fetch(
          `/api/admin/support/tickets/${encodeURIComponent(identifier)}?${query}`,
          { cache: "no-store" },
        );
        const payload = await response.json();
        if (!response.ok)
          throw new Error(apiErrorMessage(t, payload, "support.openFailed"));
        if (options.older) {
          setSelected((current) =>
            current
              ? {
                  ...current,
                  messages: [
                    ...(payload.messages || []),
                    ...(current.messages || []),
                  ],
                }
              : payload.ticket,
          );
        } else {
          setSelected({
            ...payload.ticket,
            auditTrail: payload.auditTrail || [],
          });
          setStatusDraft(payload.ticket.status);
          setPriorityDraft(payload.ticket.priority);
          setTickets((current) =>
            current.map((ticket) =>
              ticket.publicId === payload.ticket.publicId
                ? { ...ticket, adminUnreadCount: 0, unreadReplyCount: 0 }
                : ticket,
            ),
          );
          if (options.updateUrl !== false)
            window.history.replaceState(
              null,
              "",
              `/admin/support/${encodeURIComponent(payload.ticket.publicId)}`,
            );
        }
        setMessagePageInfo(
          payload.pageInfo || { hasMore: false, nextCursor: null },
        );
      } catch (detailError) {
        if (!options.silent)
          setError(
            detailError instanceof Error
              ? detailError.message
              : t("support.openFailed"),
          );
      } finally {
        if (!options.silent) setDetailLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!initialPublicId) return;
    const timer = window.setTimeout(
      () => void openTicket(initialPublicId, { updateUrl: false }),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [initialPublicId, openTicket]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load(undefined, true);
      if (selected?.publicId)
        void openTicket(selected.publicId, { updateUrl: false, silent: true });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [load, openTicket, selected?.publicId]);

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = replyText.trim();
    if (!canManage || !selected || !body || saving) return;
    if (!pendingReply.current || pendingReply.current.body !== body)
      pendingReply.current = { body, id: operationId("admin-reply") };
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/support/tickets/${encodeURIComponent(selected.publicId || selected.id)}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            body,
            clientMessageId: pendingReply.current.id,
            visibility: internalNote ? "INTERNAL" : "PUBLIC",
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(apiErrorMessage(t, payload, "support.replyFailed"));
      pendingReply.current = null;
      setReplyText("");
      setInternalNote(false);
      setNotice(t("support.replySent"));
      await Promise.all([
        load(),
        openTicket(selected.publicId || selected.id, { updateUrl: false }),
      ]);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("support.replyFailed"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateTicket(kind: "status" | "priority") {
    if (!canManage || !selected || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const value = kind === "status" ? statusDraft : priorityDraft;
      const response = await fetch(
        `/api/admin/support/tickets/${encodeURIComponent(selected.publicId || selected.id)}/${kind}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ [kind]: value }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          apiErrorMessage(
            t,
            payload,
            kind === "status"
              ? "adminSupport.statusUpdateFailed"
              : "support.priorityUpdateFailed",
          ),
        );
      setNotice(
        kind === "status"
          ? t("adminSupport.statusUpdated")
          : t("support.priorityUpdated"),
      );
      await Promise.all([
        load(),
        openTicket(selected.publicId || selected.id, { updateUrl: false }),
      ]);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("support.updateFailed"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateAssignment(assigned: boolean) {
    if (!canManage || !selected || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/support/tickets/${encodeURIComponent(selected.publicId || selected.id)}/assignment`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            assignedAdminUserId: assigned ? "SELF" : null,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(apiErrorMessage(t, payload, "support.updateFailed"));
      setNotice(
        assigned
          ? locale === "tr"
            ? "Destek kaydı size atandı."
            : "Ticket assigned to you."
          : locale === "tr"
            ? "Destek kaydı ataması kaldırıldı."
            : "Ticket assignment removed.",
      );
      await Promise.all([
        load(),
        openTicket(selected.publicId || selected.id, { updateUrl: false }),
      ]);
    } catch (assignmentError) {
      setError(
        assignmentError instanceof Error
          ? assignmentError.message
          : t("support.updateFailed"),
      );
    } finally {
      setSaving(false);
    }
  }

  const metricItems = metrics
    ? ([
        ["support.metrics.open", metrics.totalOpen],
        ["support.metrics.waitingForAdmin", metrics.waitingForAdmin],
        ["support.metrics.waitingForUser", metrics.waitingForUser],
        ["support.metrics.inProgress", metrics.inProgress],
        ["support.metrics.resolvedToday", metrics.resolvedToday],
        ["support.metrics.urgent", metrics.urgent],
        ["support.metrics.unread", metrics.unread],
        [
          "support.metrics.failedNotifications",
          metrics.failedNotifications || 0,
        ],
      ] as const)
    : [];

  return (
    <div>
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {t("adminSupport.eyebrow")}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          {t("adminSupport.title")}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {t("adminSupport.description")}
        </p>
      </header>

      {metricItems.length ? (
        <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          {metricItems.map(([label,value],index) => <AdminMetricCard key={label} label={label === "support.metrics.failedNotifications" ? (locale === "tr" ? "Başarısız bildirim" : "Failed notifications") : t(label)} value={value} recordsAvailable href={index === 7 ? "/admin/notifications" : undefined} onClick={[1,2,3,5,6].includes(index) ? () => { setStatus(index === 1 ? "WAITING_FOR_ADMIN" : index === 2 ? "WAITING_FOR_USER" : index === 3 ? "IN_PROGRESS" : "ALL"); setPriority(index === 5 ? "URGENT" : "ALL"); setUnreadOnly(index === 6); setCategory("ALL"); setAssignment("ALL"); setCreatedFrom(""); setCreatedTo(""); setSearch(""); document.getElementById("admin-records")?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"}); } : undefined} />)}
        </div>
      ) : null}

      <div className="mb-5 grid gap-2 border-y py-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="relative">
          <Search className="pointer-events-none absolute start-3 top-3 size-4 text-muted" />
          <input
            className={`${field} ps-9`}
            value={search}
            aria-label={t("adminSupport.searchPlaceholder")}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("adminSupport.searchPlaceholder")}
          />
        </label>
        <select
          className={field}
          value={status}
          aria-label={locale === "tr" ? "Durum filtresi" : "Status filter"}
          onChange={(event) => setStatus(event.target.value)}
        >
          {statuses.map((value) => (
            <option key={value} value={value}>
              {value === "ALL" ? t("adminSupport.all") : statusLabel(value, t)}
            </option>
          ))}
        </select>
        <select
          className={field}
          value={priority}
          aria-label={locale === "tr" ? "Öncelik filtresi" : "Priority filter"}
          onChange={(event) => setPriority(event.target.value)}
        >
          {priorities.map((value) => (
            <option key={value} value={value}>
              {value === "ALL"
                ? t("support.allPriorities")
                : priorityLabel(value, t)}
            </option>
          ))}
        </select>
        <select
          className={field}
          value={category}
          aria-label={locale === "tr" ? "Kategori filtresi" : "Category filter"}
          onChange={(event) => setCategory(event.target.value)}
        >
          {categories.map((value) => (
            <option key={value} value={value}>
              {value === "ALL"
                ? t("support.allCategories")
                : categoryLabel(value, t)}
            </option>
          ))}
        </select>
        <select
          className={field}
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label={locale === "tr" ? "Sıralama" : "Sort"}
        >
          {sorts.map((value) => (
            <option key={value} value={value}>
              {
                {
                  LAST_ACTIVITY:
                    locale === "tr" ? "Son aktivite" : "Last activity",
                  NEWEST: locale === "tr" ? "En yeni" : "Newest",
                  OLDEST: locale === "tr" ? "En eski" : "Oldest",
                  PRIORITY: locale === "tr" ? "Öncelik" : "Priority",
                }[value]
              }
            </option>
          ))}
        </select>
        <select
          className={field}
          value={assignment}
          onChange={(event) => setAssignment(event.target.value)}
          aria-label={locale === "tr" ? "Atama" : "Assignment"}
        >
          <option value="ALL">
            {locale === "tr" ? "Tüm atamalar" : "All assignments"}
          </option>
          <option value="ME">
            {locale === "tr" ? "Bana atanan" : "Assigned to me"}
          </option>
          <option value="UNASSIGNED">
            {locale === "tr" ? "Atanmamış" : "Unassigned"}
          </option>
        </select>
        <label className="grid gap-1 text-xs font-semibold text-muted">
          <span>{locale === "tr" ? "Başlangıç tarihi" : "Created from"}</span>
          <input
            type="date"
            className={field}
            value={createdFrom}
            onChange={(event) => setCreatedFrom(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted">
          <span>{locale === "tr" ? "Bitiş tarihi" : "Created to"}</span>
          <input
            type="date"
            className={field}
            value={createdTo}
            onChange={(event) => setCreatedTo(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={unreadOnly ? primaryButton : secondaryButton}
          onClick={() => setUnreadOnly((value) => !value)}
        >
          {t("support.unreadOnly")}
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => void load()}
        >
          <RefreshCw className="size-4" />
          {t("adminSupport.refresh")}
        </button>
      </div>

      <div aria-live="polite">
        {error ? (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm font-semibold text-red-600">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-600">
            {notice}
          </p>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,500px)]">
        <section id="admin-records" className="min-w-0 scroll-mt-24 rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-sm font-semibold text-muted">
            {loading
              ? t("common.loading")
              : t("adminSupport.ticketCount", { count: tickets.length })}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="border-b text-start text-xs uppercase text-muted">
                  <th scope="col" className="px-4 py-3">
                    {t("adminSupport.ticket")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("common.company")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("adminSupport.userEmail")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {locale === "tr" ? "Kategori" : "Category"}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("common.status")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("support.priority")}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {locale === "tr" ? "Kaynak" : "Source"}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {locale === "tr" ? "Atanan" : "Assignee"}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t("adminSupport.lastMessage")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => {
                  const unread =
                    ticket.adminUnreadCount || ticket.unreadReplyCount || 0;
                  return (
                    <tr
                      key={ticket.id}
                      className={`border-b transition last:border-0 hover:bg-primary/5 ${selected?.id === ticket.id ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-start hover:underline"
                          onClick={() =>
                            void openTicket(ticket.publicId || ticket.id)
                          }
                        >
                          <span className="flex items-center gap-2">
                            <span className="font-semibold">
                              {ticket.title || ticket.subject}
                            </span>
                            {unread ? (
                              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                                {unread}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-1 block text-xs text-muted">
                            {ticket.publicId}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {ticket.company?.name || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {ticket.createdBy?.email || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {categoryLabel(ticket.category || ticket.type, t)}
                      </td>
                      <td className="px-4 py-3">
                        {statusLabel(ticket.status, t)}
                      </td>
                      <td className="px-4 py-3">
                        {priorityLabel(ticket.priority, t)}
                      </td>
                      <td className="px-4 py-3">{ticket.source || "-"}</td>
                      <td className="px-4 py-3">
                        {ticket.assignedToAdmin?.name ||
                          ticket.assignedToAdmin?.email ||
                          (locale === "tr" ? "Atanmamış" : "Unassigned")}
                      </td>
                      <td className="px-4 py-3">
                        {formatDateTime(
                          ticket.lastMessageAt || ticket.createdAt,
                          locale,
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!loading && !tickets.length ? (
            <p className="py-12 text-center text-sm text-muted">
              {t("support.empty.admin")}
            </p>
          ) : null}
          {pageInfo.hasMore ? (
            <button
              type="button"
              className={`${secondaryButton} m-4 w-[calc(100%-2rem)]`}
              disabled={loadingMore}
              onClick={() => void load(pageInfo.nextCursor)}
            >
              {loadingMore ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <ChevronDown className="size-4" />
              )}
              {t("support.loadMore")}
            </button>
          ) : null}
        </section>

        <aside className="min-w-0 rounded-lg border bg-card p-5">
          {!selected ? (
            <div className="grid min-h-80 place-items-center text-center text-sm text-muted">
              <div>
                <Ticket className="mx-auto mb-3 size-8 text-primary" />
                {detailLoading
                  ? t("adminSupport.ticketLoading")
                  : t("adminSupport.selectTicket")}
              </div>
            </div>
          ) : (
            <div className="grid gap-5">
              <div>
                <p className="text-xs font-semibold text-primary">
                  {selected.publicId}
                </p>
                <h2 className="mt-2 text-xl font-semibold">
                  {selected.title || selected.subject}
                </h2>
                <p className="mt-2 text-sm text-muted">
                  {selected.createdBy?.name || selected.createdBy?.email || "-"}{" "}
                  · {selected.company?.name || "-"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {formatDateTime(selected.createdAt, locale)}
                </p>
              </div>
              {canManage ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted">
                      {t("adminSupport.ticketStatus")}
                    </label>
                    <div className="flex gap-2">
                      <select
                        className={field}
                        value={statusDraft}
                        aria-label={t("adminSupport.ticketStatus")}
                        onChange={(event) => setStatusDraft(event.target.value)}
                      >
                        {statuses
                          .filter((value) => value !== "ALL")
                          .map((value) => (
                            <option key={value} value={value}>
                              {statusLabel(value, t)}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        title={t("adminSupport.update")}
                        className={primaryButton}
                        disabled={saving || statusDraft === selected.status}
                        onClick={() => void updateTicket("status")}
                      >
                        {t("common.save")}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted">
                      {t("support.priority")}
                    </label>
                    <div className="flex gap-2">
                      <select
                        className={field}
                        value={priorityDraft}
                        aria-label={t("support.priority")}
                        onChange={(event) =>
                          setPriorityDraft(event.target.value)
                        }
                      >
                        {priorities
                          .filter((value) => value !== "ALL")
                          .map((value) => (
                            <option key={value} value={value}>
                              {priorityLabel(value, t)}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        title={t("adminSupport.update")}
                        className={primaryButton}
                        disabled={saving || priorityDraft === selected.priority}
                        onClick={() => void updateTicket("priority")}
                      >
                        {t("common.save")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted">
                      {t("adminSupport.ticketStatus")}
                    </dt>
                    <dd className="mt-1 font-medium">
                      {statusLabel(selected.status, t)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">
                      {t("support.priority")}
                    </dt>
                    <dd className="mt-1 font-medium">
                      {priorityLabel(selected.priority, t)}
                    </dd>
                  </div>
                </dl>
              )}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                <span className="me-auto text-sm text-muted">
                  {selected.assignedToAdmin?.name ||
                    selected.assignedToAdmin?.email ||
                    (locale === "tr" ? "Atanmamış" : "Unassigned")}
                </span>
                {canManage ? (
                  <>
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={saving}
                      onClick={() => void updateAssignment(true)}
                    >
                      <UserCheck className="size-4" />
                      {locale === "tr" ? "Bana ata" : "Assign to me"}
                    </button>
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={saving || !selected.assignedToAdmin}
                      onClick={() => void updateAssignment(false)}
                    >
                      <UserMinus className="size-4" />
                      {locale === "tr" ? "Atamayı kaldır" : "Unassign"}
                    </button>
                  </>
                ) : null}
              </div>
              <div className="grid max-h-[430px] gap-3 overflow-y-auto pe-1">
                {messagePageInfo.hasMore ? (
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={detailLoading}
                    onClick={() =>
                      void openTicket(selected.publicId || selected.id, {
                        older: true,
                        updateUrl: false,
                        cursor: messagePageInfo.nextCursor,
                      })
                    }
                  >
                    {t("support.loadOlder")}
                  </button>
                ) : null}
                {(selected.messages || []).map((message) => (
                  <article
                    key={message.id}
                    className={`max-w-[92%] rounded-lg border p-3 ${message.isInternal ? "bg-amber-500/10" : message.senderType === "ADMIN" ? "ms-auto bg-primary/5" : "bg-background"}`}
                  >
                    <div className="mb-2 flex justify-between gap-3 text-xs text-muted">
                      <span className="font-semibold">
                        {message.isInternal
                          ? t("adminSupport.internalNote")
                          : message.senderType === "ADMIN"
                            ? t("adminSupport.adminReply")
                            : t("adminSupport.userMessage")}
                      </span>
                      <span>{formatDateTime(message.createdAt, locale)}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6">
                      {message.message}
                    </p>
                    {message.attachmentUrl ? (
                      <a
                        href={message.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary"
                      >
                        <ExternalLink className="size-4" />
                        {locale === "tr" ? "Eki aç" : "Open attachment"}
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
              {selected.auditTrail?.length ? (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-semibold">
                    {locale === "tr" ? "Denetim geçmişi" : "Audit history"}
                  </summary>
                  <div className="mt-3 grid gap-2">
                    {selected.auditTrail.map((audit) => (
                      <div
                        key={audit.id}
                        className="flex justify-between gap-3 border-t pt-2 text-xs text-muted"
                      >
                        <span>{audit.eventType.replaceAll("_", " ")}</span>
                        <span>{formatDateTime(audit.createdAt, locale)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              {canManage && selected.status === "CLOSED" && !internalNote ? (
                <p className="rounded-lg bg-muted/10 p-3 text-sm text-muted">
                  {t("support.closedNoReply")}
                </p>
              ) : null}
              {canManage ? (
                <form className="grid gap-3" onSubmit={sendReply}>
                  <label className="text-xs font-semibold uppercase text-muted">
                    {t("adminSupport.writeReply")}
                  </label>
                  <textarea
                    value={replyText}
                    aria-label={t("adminSupport.writeReply")}
                    onChange={(event) => {
                      setReplyText(event.target.value);
                      if (
                        pendingReply.current?.body !== event.target.value.trim()
                      )
                        pendingReply.current = null;
                    }}
                    maxLength={10000}
                    className={`${field} min-h-28`}
                    placeholder={t("adminSupport.replyPlaceholder")}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={internalNote}
                      onChange={(event) =>
                        setInternalNote(event.target.checked)
                      }
                    />
                    {t("adminSupport.internalNote")}
                  </label>
                  <button
                    className={primaryButton}
                    disabled={
                      saving ||
                      !replyText.trim() ||
                      (selected.status === "CLOSED" && !internalNote)
                    }
                  >
                    {saving ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    {t("adminSupport.sendReply")}
                  </button>
                </form>
              ) : (
                <p className="rounded-lg bg-muted/10 p-3 text-sm text-muted">
                  {locale === "tr"
                    ? "Bu rol destek kayıtlarını yalnızca görüntüleyebilir."
                    : "This role can only view support tickets."}
                </p>
              )}
            </div>
          )}
        </aside>
      </div>

      <p className="mt-5 border-t pt-4 text-sm text-muted">
        <MessageSquare className="me-2 inline size-4 text-primary" />
        {t("adminSupport.threadNotice")}
      </p>
    </div>
  );
}
