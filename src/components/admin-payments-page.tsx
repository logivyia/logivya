"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";

type Payment = {
  id: string;
  status: string;
  paymentMethod: string;
  amount: string;
  currency: string;
  failureReason?: string;
  createdAt: string;
  company: { name: string };
  plan?: { name: string };
};

const button = "inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50";

export function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/payments");
    const result = await response.json();
    setPayments(result.payments || []);
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/admin/payments")
      .then((response) => response.json())
      .then((result) => { if (active) setPayments(result.payments || []); });
    return () => { active = false; };
  }, []);

  async function approve(paymentId: string) {
    setBusyId(paymentId);
    const response = await fetch("/api/admin/payments/mark-paid", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId }),
    });
    const result = await response.json();
    setStatus(response.ok ? "Ödeme onaylandı." : result.error);
    setBusyId("");
    await load();
  }

  async function reject(paymentId: string) {
    const reason = window.prompt("Ödeme reddetme nedeni (en az 5 karakter):")?.trim();
    if (!reason) return;
    setBusyId(paymentId);
    const response = await fetch("/api/admin/payments/reject", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId, reason }),
    });
    const result = await response.json();
    setStatus(response.ok ? "Ödeme reddedildi." : result.error);
    setBusyId("");
    await load();
  }

  return <>
    <header className="mb-7"><p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">Billing Operations</p><h1 className="mt-2 text-3xl font-semibold">Ödemeler</h1><p className="mt-2 text-sm text-muted">Ödeme taleplerini inceleyin, onaylayın veya gerekçeli olarak reddedin.</p></header>
    {status && <p className="mb-4 rounded-xl border bg-card p-3 text-sm">{status}</p>}
    {!payments ? <LoaderCircle className="animate-spin text-primary" /> : <div className="panel overflow-x-auto rounded-2xl p-5"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left"><th className="py-3">Şirket</th><th>Plan</th><th>Tutar</th><th>Durum</th><th>Tarih</th><th>İşlemler</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-b last:border-0"><td className="py-4 font-medium">{payment.company.name}</td><td>{payment.plan?.name || "-"}</td><td>{Number(payment.amount).toLocaleString("tr-TR")} {payment.currency}</td><td><span>{payment.status}</span>{payment.failureReason && <p className="mt-1 max-w-64 text-xs text-danger">{payment.failureReason}</p>}</td><td>{new Date(payment.createdAt).toLocaleString("tr-TR")}</td><td><div className="flex gap-2"><button disabled={busyId === payment.id || ["PAID", "SUCCEEDED"].includes(payment.status)} onClick={() => void approve(payment.id)} className={`${button} border-green-200 bg-green-50 text-green-800`}><Check className="size-4" />Onayla</button><button disabled={busyId === payment.id || ["PAID", "SUCCEEDED", "FAILED"].includes(payment.status)} onClick={() => void reject(payment.id)} className={`${button} border-red-200 bg-red-50 text-red-700`}><X className="size-4" />Reddet</button></div></td></tr>)}</tbody></table>{!payments.length && <p className="py-12 text-center text-sm text-muted">Ödeme kaydı bulunmuyor.</p>}</div>}
  </>;
}
