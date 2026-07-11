/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { MessageSquare, Plus, RefreshCw, Send } from "lucide-react";

type SupportMessage = {
  id: string;
  senderType: string;
  message: string;
  createdAt: string;
};

type SupportTicket = {
  id: string;
  subject: string;
  title?: string;
  type: string;
  category?: string;
  status: string;
  createdAt?: string;
  createdBy?: { name?: string | null; email?: string | null };
  company?: { name?: string | null };
  messages?: SupportMessage[];
};

const field =
  "w-full rounded-2xl border bg-input px-4 py-3 text-sm text-input-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary";
const panel = "rounded-3xl border bg-card p-6 shadow-[var(--shadow-soft)]";
const button =
  "inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95 disabled:opacity-60";

function statusLabel(status: string) {
  if (status === "OPEN") return "Açık";
  if (status === "PENDING") return "Beklemede";
  if (status === "IN_PROGRESS") return "İşlemde";
  if (status === "ANSWERED") return "Yanıtlandı";
  if (status === "RESOLVED") return "Çözüldü";
  if (status === "CLOSED") return "Kapalı";
  return status;
}

function messageRoleLabel(senderType: string) {
  if (senderType === "ADMIN") return "Yönetici yanıtı";
  if (senderType === "USER" || senderType === "CUSTOMER") return "Kullanıcı mesajı";
  return "Sistem mesajı";
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString("tr-TR") : "-";
}

export function SupportStablePage() {
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replying, setReplying] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/support/tickets", { cache: "no-store" });
    const payload = await response.json();
    setTickets(payload.tickets || []);
  }, []);

  const openTicket = useCallback(async (ticketId: string) => {
    setDetailLoading(true);
    setStatus("");
    try {
      const response = await fetch(`/api/support/tickets/${ticketId}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Bu talebe erişim yetkiniz yok.");
      setSelected(payload.ticket);
      setReplyText("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Bu talebe erişim yetkiniz yok.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatus("");

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const response = await fetch("/api/support/tickets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    const payload = await response.json();

    setSubmitting(false);
    setStatus(response.ok ? "Destek talebiniz oluşturuldu." : payload.message || payload.error || "Talep oluşturulamadı.");

    if (response.ok) {
      form.reset();
      await load();
      if (payload.ticket?.id) await openTicket(payload.ticket.id);
    }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !replyText.trim() || replying || selected.status === "CLOSED") return;
    setReplying(true);
    setStatus("");
    const response = await fetch(`/api/support/tickets/${selected.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: replyText.trim() }),
    });
    const payload = await response.json();
    setReplying(false);
    if (!response.ok) {
      setStatus(payload.message || payload.error || "Yanıt gönderilemedi.");
      return;
    }
    setReplyText("");
    setStatus("Yanıt gönderildi.");
    await Promise.all([load(), openTicket(selected.id)]);
  }

  return (
    <>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Destek</p>
        <h1 className="mt-2 text-3xl font-semibold">Destek Merkezi</h1>
        <p className="mt-2 text-sm text-muted">Teknik, ödeme ve WhatsApp bağlantı sorunlarını Logivya ekibine iletin.</p>
      </header>

      <form onSubmit={submit} className={`${panel} mb-6 grid gap-3 md:grid-cols-2`}>
        <input required name="subject" placeholder="Konu" className={field} />
        <select name="type" className={field} defaultValue="WhatsApp bağlantı sorunu">
          {[
            "WhatsApp bağlantı sorunu",
            "QR kod sorunu",
            "Mesaj gönderim sorunu",
            "Abonelik / ödeme",
            "Fatura",
            "Teknik hata",
            "Diğer",
          ].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <textarea required name="message" placeholder="Sorununuzu açıklayın" className={`${field} min-h-32 md:col-span-2`} />
        <button disabled={submitting} className={button}>
          <Plus className="me-2 size-4" />
          {submitting ? "Gönderiliyor..." : "Talep oluştur"}
        </button>
        {status ? <p className="self-center text-sm font-medium text-muted">{status}</p> : null}
      </form>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
        {!tickets ? (
          <div className={panel}>Destek talepleri yükleniyor...</div>
        ) : (
          <div className="grid gap-4">
            {tickets.map((ticket) => (
              <article key={ticket.id} className={`${panel} cursor-pointer transition hover:border-primary`} onClick={() => void openTicket(ticket.id)}>
                <div className="flex justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{ticket.title || ticket.subject}</h3>
                    <p className="mt-1 text-xs text-muted">
                      {ticket.category || ticket.type} · {ticket.createdBy?.name || ticket.createdBy?.email || "Kullanıcı"}
                    </p>
                  </div>
                  <span className="h-fit rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                    {statusLabel(ticket.status)}
                  </span>
                </div>
                <p className="mt-4 text-sm text-muted">{ticket.messages?.[0]?.message}</p>
                <button type="button" className="mt-4 text-sm font-semibold text-primary">Talebi aç</button>
              </article>
            ))}
          </div>
        )}

        <aside className={panel}>
          {!selected || detailLoading ? (
            <div className="grid min-h-80 place-items-center text-center text-sm text-muted">
              <div>
                <MessageSquare className="mx-auto mb-3 size-8 text-primary" />
                {detailLoading ? "Talep yükleniyor..." : "Konuşmayı görmek için talep seçin."}
              </div>
            </div>
          ) : (
            <div className="grid gap-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{selected.category || selected.type}</p>
                <h2 className="mt-2 text-xl font-semibold">{selected.title || selected.subject}</h2>
                <p className="mt-1 text-xs text-muted">{statusLabel(selected.status)} · {formatDate(selected.createdAt)}</p>
              </div>
              <div className="grid max-h-[420px] gap-3 overflow-y-auto pr-1">
                {(selected.messages || []).map((message) => (
                  <article key={message.id} className="rounded-2xl border bg-background p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-muted">{messageRoleLabel(message.senderType)}</p>
                      <p className="text-xs text-muted">{formatDate(message.createdAt)}</p>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6">{message.message}</p>
                  </article>
                ))}
              </div>
              {selected.status === "CLOSED" ? (
                <p className="rounded-2xl bg-muted/40 p-4 text-sm font-semibold text-muted">
                  Talep kapalı olduğu için yanıt yazılamaz.
                </p>
              ) : (
                <form className="grid gap-3" onSubmit={sendReply}>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Yanıt yaz</label>
                  <textarea value={replyText} onChange={(event) => setReplyText(event.target.value)} className={`${field} min-h-28`} placeholder="Yanıtınızı yazın..." />
                  <button disabled={replying || !replyText.trim()} className={button}>
                    {replying ? <RefreshCw className="me-2 size-4 animate-spin" /> : <Send className="me-2 size-4" />}
                    Yanıt gönder
                  </button>
                </form>
              )}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
