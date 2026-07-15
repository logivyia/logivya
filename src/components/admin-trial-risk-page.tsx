"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminCenter } from "@/components/admin-center";
import { formatDateTime } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";

export type AdminTrialRiskItem = {
  id: string;
  companyName: string;
  userEmail: string;
  accountName: string | null;
  status: string;
  riskScore: number;
  riskSignals: string[];
  decisionCode: string | null;
  createdAt: string;
};

export function AdminTrialRiskPage({ items }: { items: AdminTrialRiskItem[] }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [selected, setSelected] = useState<AdminTrialRiskItem | null>(null);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = items.filter((item) => item.status === "BLOCKED").length;
  const review = items.filter((item) => item.status === "INELIGIBLE" || item.status === "PENDING_IDENTITY").length;
  const active = items.filter((item) => item.status === "ACTIVE").length;

  async function decide(action: "APPROVE_REVIEW" | "BLOCK") {
    if (!selected || password.length < 1 || reason.trim().length < 8 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const reauth = await fetch("/api/admin/security/re-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!reauth.ok) throw new Error(locale === "tr" ? "Yönetici parolası doğrulanamadı." : "Administrator password could not be verified.");
      const response = await fetch(`/api/admin/trial-entitlements/${selected.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || (locale === "tr" ? "Karar kaydedilemedi." : "The decision could not be saved."));
      setSelected(null);
      setPassword("");
      setReason("");
      router.refresh();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : t("api.error.generic"));
    } finally {
      setSaving(false);
    }
  }

  return <AdminCenter
    eyebrow={t("admin.menu.security")}
    title={t("admin.menu.trialRisk")}
    description={t("adminSecurity.description")}
    metrics={{
      [locale === "tr" ? "Toplam kayıt" : "Total records"]: items.length,
      [locale === "tr" ? "İncelemede" : "Under review"]: review,
      [locale === "tr" ? "Engellenen" : "Blocked"]: blocked,
      [locale === "tr" ? "Aktif" : "Active"]: active,
    }}
  >
    <div className="overflow-x-auto rounded-lg border bg-white p-5 shadow-sm">
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-xs text-slate-500">
          <th className="py-3 pe-4">{t("common.company")}</th>
          <th className="py-3 pe-4">{t("users.user")}</th>
          <th className="py-3 pe-4">{t("admin.menu.whatsappAccounts")}</th>
          <th className="py-3 pe-4">{t("common.status")}</th>
          <th className="py-3 pe-4">{t("adminApi.abuse")}</th>
          <th className="py-3 pe-4">{t("admin.list.date")}</th>
          <th className="py-3" />
        </tr></thead>
        <tbody>{items.map((item) => <tr key={item.id} className="border-b last:border-0">
          <td className="py-4 pe-4 font-medium">{item.companyName}</td>
          <td className="py-4 pe-4">{item.userEmail}</td>
          <td className="py-4 pe-4">{item.accountName ?? "-"}</td>
          <td className="py-4 pe-4">{item.status}</td>
          <td className="py-4 pe-4"><b>{item.riskScore}</b>{item.riskSignals.length ? <small className="mt-1 block max-w-64 text-slate-500">{item.riskSignals.join(", ")}</small> : null}</td>
          <td className="py-4 pe-4">{formatDateTime(item.createdAt, locale)}</td>
          <td className="py-4 text-right"><button type="button" onClick={() => { setSelected(item); setError(null); }} className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-slate-50">{locale === "tr" ? "İncele" : "Review"}</button></td>
        </tr>)}</tbody>
      </table>
      {!items.length ? <p className="py-10 text-center text-sm text-slate-500">{t("admin.list.empty")}</p> : null}
    </div>

    {selected ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-semibold">{selected.companyName}</h2>
        <p className="mt-1 text-sm text-slate-500">{selected.userEmail} · {selected.status}</p>
        <label className="mt-5 block text-xs font-semibold">{locale === "tr" ? "Yönetici parolası" : "Administrator password"}
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-orange-400" />
        </label>
        <label className="mt-4 block text-xs font-semibold">{t("adminSubscriptions.actionReason")}
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={8} maxLength={500} className="mt-2 min-h-24 w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-orange-400" />
        </label>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setSelected(null)} className="rounded-lg border px-4 py-2 text-sm font-semibold">{locale === "tr" ? "Kapat" : "Close"}</button>
          <button type="button" disabled={saving || reason.trim().length < 8 || !password} onClick={() => void decide("BLOCK")} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{locale === "tr" ? "Engelle" : "Block"}</button>
          <button type="button" disabled={saving || reason.trim().length < 8 || !password} onClick={() => void decide("APPROVE_REVIEW")} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{locale === "tr" ? "Onayla" : "Approve"}</button>
        </div>
      </div>
    </div> : null}
  </AdminCenter>;
}
