"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, RefreshCw, Send, Ticket } from "lucide-react";

type SupportMessage = {
  id: string;
  senderType: string;
  message: string;
  isInternal: boolean;
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
  company?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string | null; email: string } | null;
  assignedToAdmin?: { id: string; name: string | null; email: string } | null;
  messages?: SupportMessage[];
};

const statuses = [
  ["ALL", "Tumu"],
  ["OPEN", "Acik"],
  ["PENDING", "Devam ediyor"],
  ["IN_PROGRESS", "Islemde"],
  ["RESOLVED", "Cozuldu"],
  ["CLOSED", "Kapali"],
] as const;

const field = "w-full rounded-xl border bg-white px-3 py-3 text-sm outline-none";
const button = "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const ghost = "inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-primary";

function statusLabel(status: string) {
  return statuses.find(([value]) => value === status)?.[1] ?? status;
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("tr-TR");
}

function ticketTitle(ticket: SupportTicket) {
  return ticket.title || ticket.subject;
}

function ticketCategory(ticket: SupportTicket) {
  return ticket.category || ticket.type;
}

export function AdminSupportPage() {
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: "30", status });
    if (q.trim()) params.set("q", q.trim());
    return params.toString();
  }, [page, q, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/support/tickets?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Destek talepleri yuklenemedi.");
      setTickets(payload.tickets || []);
      setPagination(payload.pagination || { page: 1, total: 0, pages: 1 });
      if (!selectedId && payload.tickets?.[0]?.id) setSelectedId(payload.tickets[0].id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Destek talepleri yuklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [query, selectedId]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/support/tickets/${id}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Destek talebi acilmadi.");
      setSelected(payload.ticket);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Destek talebi acilmadi.");
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

  async function updateTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || saving) return;
    const form = new FormData(event.currentTarget);
    const message = String(form.get("message") || "").trim();
    const nextStatus = String(form.get("status") || selected.status);
    const priority = String(form.get("priority") || selected.priority);
    const internalNote = form.get("internalNote") === "on";
    if (!message && nextStatus === selected.status && priority === selected.priority) {
      setNotice("Degisiklik yok.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/support/tickets/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: message || undefined, status: nextStatus, priority, internalNote }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Destek talebi guncellenemedi.");
      event.currentTarget.reset();
      setNotice("Destek talebi guncellendi.");
      await Promise.all([load(), loadDetail(selected.id)]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Destek talebi guncellenemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">Logivya Destek Operasyonlari</p>
        <h1 className="mt-2 text-3xl font-semibold">Destek Talepleri</h1>
        <p className="mt-2 text-sm text-muted">Tum sirketlerden gelen destek taleplerini merkezi akistan yonetin.</p>
      </header>

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto]">
        <input
          className={field}
          value={q}
          onChange={(event) => {
            setPage(1);
            setQ(event.target.value);
          }}
          placeholder="Konu, sirket, kullanici veya e-posta ara..."
        />
        <button type="button" className={ghost} onClick={() => void load()}>
          <RefreshCw className="size-4" />
          Yenile
        </button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {statuses.map(([value, label]) => (
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="panel rounded-2xl p-0">
          <div className="border-b p-4 text-sm font-semibold text-muted">
            {loading ? "Yukleniyor..." : `${pagination.total} destek talebi`}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">Talep</th>
                  <th className="px-4 py-3">Sirket</th>
                  <th className="px-4 py-3">Kullanici e-posta</th>
                  <th className="px-4 py-3">Durum</th>
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3">Olusturma</th>
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
                      <p className="mt-1 text-xs text-muted">{ticket.source || "WEB"}</p>
                    </td>
                    <td className="px-4 py-4">{ticket.company?.name || "-"}</td>
                    <td className="px-4 py-4">{ticket.createdBy?.email || "-"}</td>
                    <td className="px-4 py-4">{statusLabel(ticket.status)}</td>
                    <td className="px-4 py-4">{ticketCategory(ticket)}</td>
                    <td className="px-4 py-4">{formatDate(ticket.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !tickets.length ? <p className="py-12 text-center text-sm text-muted">Kayit bulunmuyor.</p> : null}
          <div className="flex items-center justify-between gap-3 border-t p-4 text-sm">
            <button className={ghost} disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Onceki</button>
            <span className="text-muted">Sayfa {pagination.page} / {Math.max(1, pagination.pages)}</span>
            <button className={ghost} disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Sonraki</button>
          </div>
        </section>

        <aside className="panel rounded-2xl p-5">
          {!selected || detailLoading ? (
            <div className="grid min-h-80 place-items-center text-center text-sm text-muted">
              <div>
                <Ticket className="mx-auto mb-3 size-8 text-primary" />
                {detailLoading ? "Talep yukleniyor..." : "Detay gormek icin talep secin."}
              </div>
            </div>
          ) : (
            <div className="grid gap-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">{ticketCategory(selected)} - {selected.source || "WEB"}</p>
                <h2 className="mt-2 text-xl font-semibold">{ticketTitle(selected)}</h2>
                <p className="mt-2 text-sm text-muted">{selected.createdBy?.email || "-"} - {selected.company?.name || "-"}</p>
                <p className="mt-1 text-xs text-muted">{formatDate(selected.createdAt)}</p>
              </div>

              <div className="grid gap-3">
                {(selected.messages || []).map((message) => (
                  <article key={message.id} className={`rounded-xl border p-3 ${message.isInternal ? "bg-amber-50" : "bg-white"}`}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-muted">
                        {message.senderType === "ADMIN" ? "Admin" : message.senderType === "CUSTOMER" ? "Kullanici" : "Sistem"}
                        {message.isInternal ? " - Ic not" : ""}
                      </p>
                      <p className="text-xs text-muted">{formatDate(message.createdAt)}</p>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6">{message.message}</p>
                  </article>
                ))}
              </div>

              <form className="grid gap-3" onSubmit={updateTicket}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <select name="status" className={field} defaultValue={selected.status}>
                    {statuses.filter(([value]) => value !== "ALL").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <select name="priority" className={field} defaultValue={selected.priority}>
                    <option value="LOW">Dusuk</option>
                    <option value="MEDIUM">Orta</option>
                    <option value="HIGH">Yuksek</option>
                    <option value="URGENT">Acil</option>
                  </select>
                </div>
                <textarea name="message" className={`${field} min-h-32`} placeholder="Kullaniciya yanit yazin..." />
                <label className="inline-flex items-center gap-2 text-sm text-muted">
                  <input type="checkbox" name="internalNote" />
                  Ic not olarak kaydet
                </label>
                <button className={button} disabled={saving}>
                  {saving ? <RefreshCw className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Kaydet / Yanitla
                </button>
              </form>
            </div>
          )}
        </aside>
      </div>

      <div className="mt-5 rounded-2xl border bg-white p-4 text-sm text-muted">
        <MessageSquare className="me-2 inline size-4 text-primary" />
        Yeni mobil destek talepleri bu listede MOBILE kaynagi ile gorunur. Yenile butonu en guncel kayitlari getirir.
      </div>
    </div>
  );
}
