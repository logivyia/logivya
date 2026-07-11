"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, RefreshCw, Send, Ticket } from "lucide-react";

type SupportMessage = {
  id: string;
  senderType: string;
  message: string;
  attachmentUrl?: string | null;
  isInternal?: boolean;
  createdAt: string;
  senderUser?: { name: string | null; email: string } | null;
};

type SupportTicket = {
  id: string;
  tenantId?: string;
  userId?: string;
  title?: string;
  description?: string;
  category?: string;
  subject: string;
  type: string;
  source?: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt?: string;
  lastMessageAt?: string;
  closedAt?: string | null;
  company?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string | null; email: string } | null;
  assignedToAdmin?: { id: string; name: string | null; email: string } | null;
  messages?: SupportMessage[];
};

const listStatuses = [
  ["ALL", "Tümü"],
  ["OPEN", "Açık"],
  ["PENDING", "Beklemede"],
  ["IN_PROGRESS", "İşlemde"],
  ["ANSWERED", "Yanıtlandı"],
  ["RESOLVED", "Çözüldü"],
  ["CLOSED", "Kapalı"],
] as const;

const editableStatuses = [
  ["OPEN", "Açık"],
  ["PENDING", "Beklemede"],
  ["IN_PROGRESS", "İşlemde"],
  ["ANSWERED", "Yanıtlandı"],
  ["RESOLVED", "Çözüldü"],
  ["CLOSED", "Kapalı"],
] as const;

const field = "w-full rounded-xl border bg-white px-3 py-3 text-sm outline-none";
const button = "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const ghost = "inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-primary disabled:opacity-50";

function statusLabel(status: string) {
  return listStatuses.find(([value]) => value === status)?.[1] ?? status;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("tr-TR");
}

function ticketTitle(ticket: SupportTicket) {
  return ticket.title || ticket.subject;
}

function ticketCategory(ticket: SupportTicket) {
  return ticket.category || ticket.type;
}

function messageRoleLabel(message: SupportMessage) {
  if (message.isInternal) return "İç not";
  if (message.senderType === "ADMIN") return "Yönetici yanıtı";
  if (message.senderType === "USER" || message.senderType === "CUSTOMER") return "Kullanıcı mesajı";
  return "Sistem mesajı";
}

export function AdminSupportPage() {
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingReply, setSavingReply] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [statusDraft, setStatusDraft] = useState("OPEN");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: "30", status });
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [page, search, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/support/tickets?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Destek talepleri yüklenemedi.");
      const nextTickets = payload.tickets || [];
      setTickets(nextTickets);
      setPagination(payload.pagination || { page: 1, total: 0, pages: 1 });
      setSelectedId((current) => current ?? nextTickets[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Destek talepleri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/support/tickets/${id}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Destek talebi açılamadı.");
      setSelected(payload.ticket);
      setStatusDraft(payload.ticket?.status || "OPEN");
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Destek talebi açılamadı.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [loadDetail, selectedId]);

  useEffect(() => {
    setReplyText("");
    setNotice("");
  }, [selectedId]);

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || savingReply || !replyText.trim()) return;
    setSavingReply(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/support/tickets/${selected.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: replyText.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Yanıt gönderilemedi.");
      setReplyText("");
      setNotice("Yanıt gönderildi.");
      await Promise.all([load(), loadDetail(selected.id)]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Yanıt gönderilemedi.");
    } finally {
      setSavingReply(false);
    }
  }

  async function updateStatus() {
    if (!selected || savingStatus || statusDraft === selected.status) return;
    setSavingStatus(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/support/tickets/${selected.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: statusDraft }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Talep durumu güncellenemedi.");
      setNotice("Talep durumu güncellendi.");
      await Promise.all([load(), loadDetail(selected.id)]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Talep durumu güncellenemedi.");
    } finally {
      setSavingStatus(false);
    }
  }

  return (
    <div>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">Logivya Destek Operasyonları</p>
        <h1 className="mt-2 text-3xl font-semibold">Destek Talepleri</h1>
        <p className="mt-2 text-sm text-muted">Tüm şirketlerden gelen destek taleplerini merkezi akıştan yönetin.</p>
      </header>

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto]">
        <input
          className={field}
          value={search}
          onChange={(event) => {
            setPage(1);
            setSearch(event.target.value);
          }}
          placeholder="Konu, şirket, kullanıcı veya e-posta ara..."
        />
        <button type="button" className={ghost} onClick={() => void load()}>
          <RefreshCw className="size-4" />
          Yenile
        </button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {listStatuses.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setPage(1);
              setStatus(value);
            }}
            className={value === status ? button : ghost}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-700">{notice}</p> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
        <section className="panel rounded-2xl p-0">
          <div className="border-b p-4 text-sm font-semibold text-muted">
            {loading ? "Yükleniyor..." : `${pagination.total} destek talebi`}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">Talep</th>
                  <th className="px-4 py-3">Şirket</th>
                  <th className="px-4 py-3">Kullanıcı e-posta</th>
                  <th className="px-4 py-3">Durum</th>
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3">Son mesaj</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => setSelectedId(ticket.id)}
                    className={`cursor-pointer border-b last:border-0 hover:bg-slate-50 ${selectedId === ticket.id ? "bg-orange-50" : ""}`}
                  >
                    <td className="px-4 py-4">
                      <p className="font-semibold">{ticketTitle(ticket)}</p>
                      <button type="button" className="mt-1 text-xs font-semibold text-primary">
                        Talebi aç
                      </button>
                    </td>
                    <td className="px-4 py-4">{ticket.company?.name || "-"}</td>
                    <td className="px-4 py-4">{ticket.createdBy?.email || "-"}</td>
                    <td className="px-4 py-4">{statusLabel(ticket.status)}</td>
                    <td className="px-4 py-4">{ticketCategory(ticket)}</td>
                    <td className="px-4 py-4">{formatDate(ticket.lastMessageAt || ticket.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !tickets.length ? <p className="py-12 text-center text-sm text-muted">Kayıt bulunmuyor.</p> : null}
          <div className="flex items-center justify-between gap-3 border-t p-4 text-sm">
            <button className={ghost} disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              Önceki
            </button>
            <span className="text-muted">Sayfa {pagination.page} / {Math.max(1, pagination.pages)}</span>
            <button className={ghost} disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>
              Sonraki
            </button>
          </div>
        </section>

        <aside className="panel rounded-2xl p-5">
          {!selected || detailLoading ? (
            <div className="grid min-h-80 place-items-center text-center text-sm text-muted">
              <div>
                <Ticket className="mx-auto mb-3 size-8 text-primary" />
                {detailLoading ? "Talep yükleniyor..." : "Detay görmek için talep seçin."}
              </div>
            </div>
          ) : (
            <div className="grid gap-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">
                  {ticketCategory(selected)} - {selected.source || "WEB"}
                </p>
                <h2 className="mt-2 text-xl font-semibold">{ticketTitle(selected)}</h2>
                <p className="mt-2 text-sm text-muted">{selected.createdBy?.email || "-"} - {selected.company?.name || "-"}</p>
                <p className="mt-1 text-xs text-muted">{formatDate(selected.createdAt)}</p>
              </div>

              <div className="rounded-2xl border bg-white p-4">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">Talep durumu</label>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <select className={field} value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)}>
                    {editableStatuses.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <button type="button" className={button} disabled={savingStatus || statusDraft === selected.status} onClick={() => void updateStatus()}>
                    {savingStatus ? <RefreshCw className="size-4 animate-spin" /> : null}
                    Güncelle
                  </button>
                </div>
              </div>

              <div className="grid max-h-[420px] gap-3 overflow-y-auto pr-1">
                {(selected.messages || []).map((message) => (
                  <article key={message.id} className={`rounded-xl border p-3 ${message.isInternal ? "bg-amber-50" : "bg-white"}`}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-muted">{messageRoleLabel(message)}</p>
                      <p className="text-xs text-muted">{formatDate(message.createdAt)}</p>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6">{message.message}</p>
                  </article>
                ))}
              </div>

              <form className="grid gap-3" onSubmit={sendReply}>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">Yanıt yaz</label>
                <textarea
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  className={`${field} min-h-32`}
                  placeholder="Kullanıcıya yanıt yazın..."
                />
                <button className={button} disabled={savingReply || !replyText.trim()}>
                  {savingReply ? <RefreshCw className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Yanıt gönder
                </button>
              </form>
            </div>
          )}
        </aside>
      </div>

      <div className="mt-5 rounded-2xl border bg-white p-4 text-sm text-muted">
        <MessageSquare className="me-2 inline size-4 text-primary" />
        Kullanıcı yanıtları ve yönetici yanıtları bu konuşma akışında gerçek zamanlı yenileme sonrası görünür.
      </div>
    </div>
  );
}
