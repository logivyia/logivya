/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

type SupportTicket = {
  id: string;
  subject: string;
  type: string;
  status: string;
  createdBy?: { name?: string | null; email?: string | null };
  messages?: Array<{ message: string }>;
};

const field =
  "w-full rounded-2xl border bg-input px-4 py-3 text-sm text-input-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary";
const panel = "rounded-3xl border bg-card p-6 shadow-[var(--shadow-soft)]";

export function SupportStablePage() {
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/support/tickets", { cache: "no-store" });
    const payload = await response.json();
    setTickets(payload.tickets || []);
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

    setSubmitting(false);
    setStatus(response.ok ? "Destek talebiniz oluşturuldu." : "Talep oluşturulamadı.");

    if (response.ok) {
      form.reset();
      await load();
    }
  }

  return (
    <>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Destek</p>
        <h1 className="mt-2 text-3xl font-semibold">Destek Merkezi</h1>
        <p className="mt-2 text-sm text-muted">
          Teknik, ödeme ve WhatsApp bağlantı sorunlarını Logivya ekibine iletin.
        </p>
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
        <textarea
          required
          name="message"
          placeholder="Sorununuzu açıklayın"
          className={`${field} min-h-32 md:col-span-2`}
        />
        <button
          disabled={submitting}
          className="inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95 disabled:opacity-60"
        >
          <Plus className="me-2 size-4" />
          {submitting ? "Gönderiliyor..." : "Talep oluştur"}
        </button>
        {status ? <p className="self-center text-sm font-medium text-muted">{status}</p> : null}
      </form>

      {!tickets ? (
        <div className={panel}>Destek talepleri yükleniyor...</div>
      ) : (
        <div className="grid gap-4">
          {tickets.map((ticket) => (
            <article key={ticket.id} className={panel}>
              <div className="flex justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{ticket.subject}</h3>
                  <p className="mt-1 text-xs text-muted">
                    {ticket.type} · {ticket.createdBy?.name || ticket.createdBy?.email || "Kullanıcı"}
                  </p>
                </div>
                <span className="h-fit rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                  {ticket.status}
                </span>
              </div>
              <p className="mt-4 text-sm text-muted">{ticket.messages?.[0]?.message}</p>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
