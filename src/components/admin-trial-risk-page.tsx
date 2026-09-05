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

export function AdminTrialRiskPage({
  items,
  canManage,
  metrics,
  pagination,
}: {
  items: AdminTrialRiskItem[];
  canManage: boolean;
  metrics: { total: number; blocked: number; review: number; active: number };
  pagination: { page: number; total: number; pages: number };
}) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [selected, setSelected] = useState<AdminTrialRiskItem | null>(null);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: "APPROVE_REVIEW" | "BLOCK") {
    if (
      !canManage ||
      !selected ||
      password.length < 1 ||
      reason.trim().length < 8 ||
      saving
    )
      return;
    setSaving(true);
    setError(null);
    try {
      const reauth = await fetch("/api/admin/security/re-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!reauth.ok)
        throw new Error(
          locale === "tr"
            ? "Yönetici parolası doğrulanamadı."
            : "Administrator password could not be verified.",
        );
      const response = await fetch(
        `/api/admin/trial-entitlements/${selected.id}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason: reason.trim() }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(
          body.error ||
            (locale === "tr"
              ? "Karar kaydedilemedi."
              : "The decision could not be saved."),
        );
      setSelected(null);
      setPassword("");
      setReason("");
      router.refresh();
    } catch (decisionError) {
      setError(
        decisionError instanceof Error
          ? decisionError.message
          : t("api.error.generic"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminCenter
      eyebrow={t("admin.menu.security")}
      title={t("admin.menu.trialRisk")}
      description={t("adminSecurity.description")}
      metrics={{
        [locale === "tr" ? "Toplam kayıt" : "Total records"]: metrics.total,
        [locale === "tr" ? "İncelemede" : "Under review"]: metrics.review,
        [locale === "tr" ? "Engellenen" : "Blocked"]: metrics.blocked,
        [locale === "tr" ? "Aktif" : "Active"]: metrics.active,
      }}
    >
      <div className="min-w-0 max-w-full overflow-hidden rounded-lg border bg-white p-5 shadow-sm">
        <div className="min-w-0 w-full max-w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th scope="col" className="py-3 pe-4">
                  {t("common.company")}
                </th>
                <th scope="col" className="py-3 pe-4">
                  {t("users.user")}
                </th>
                <th scope="col" className="py-3 pe-4">
                  {t("admin.menu.whatsappAccounts")}
                </th>
                <th scope="col" className="py-3 pe-4">
                  {t("common.status")}
                </th>
                <th scope="col" className="py-3 pe-4">
                  {t("adminApi.abuse")}
                </th>
                <th scope="col" className="py-3 pe-4">
                  {t("admin.list.date")}
                </th>
                <th scope="col" className="py-3">
                  <span className="sr-only">{t("common.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-4 pe-4 font-medium">{item.companyName}</td>
                  <td className="py-4 pe-4">{item.userEmail}</td>
                  <td className="py-4 pe-4">{item.accountName ?? "-"}</td>
                  <td className="py-4 pe-4">
                    {trialStatusLabel(item.status, locale)}
                  </td>
                  <td className="py-4 pe-4">
                    <b>{item.riskScore}</b>
                    {item.riskSignals.length ? (
                      <small className="mt-1 block max-w-64 text-slate-500">
                        {item.riskSignals.join(", ")}
                      </small>
                    ) : null}
                  </td>
                  <td className="py-4 pe-4">
                    {formatDateTime(item.createdAt, locale)}
                  </td>
                  <td className="py-4 text-right">
                    {canManage &&
                    ["PENDING_IDENTITY", "INELIGIBLE", "BLOCKED"].includes(
                      item.status,
                    ) ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(item);
                          setError(null);
                        }}
                        className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                      >
                        {locale === "tr" ? "İncele" : "Review"}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length ? (
          <p className="py-10 text-center text-sm text-slate-500">
            {t("admin.list.empty")}
          </p>
        ) : null}
        {pagination.pages > 1 ? (
          <nav
            className="mt-5 flex items-center justify-between gap-3 border-t pt-4"
            aria-label={locale === "tr" ? "Risk kayıtları" : "Risk records"}
          >
            <span className="text-xs text-slate-500">
              {pagination.total} · {pagination.page}/{pagination.pages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => router.push(`?page=${pagination.page - 1}`)}
                className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
              >
                {locale === "tr" ? "Önceki" : "Previous"}
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.pages}
                onClick={() => router.push(`?page=${pagination.page + 1}`)}
                className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
              >
                {locale === "tr" ? "Sonraki" : "Next"}
              </button>
            </div>
          </nav>
        ) : null}
      </div>

      {canManage && selected ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-semibold">{selected.companyName}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {selected.userEmail} · {trialStatusLabel(selected.status, locale)}
            </p>
            <label className="mt-5 block text-xs font-semibold">
              {locale === "tr" ? "Yönetici parolası" : "Administrator password"}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-orange-400"
              />
            </label>
            <label className="mt-4 block text-xs font-semibold">
              {t("adminSubscriptions.actionReason")}
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={8}
                maxLength={500}
                className="mt-2 min-h-24 w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-orange-400"
              />
            </label>
            {error ? (
              <p className="mt-3 text-sm text-red-600">{error}</p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border px-4 py-2 text-sm font-semibold"
              >
                {locale === "tr" ? "Kapat" : "Close"}
              </button>
              <button
                type="button"
                disabled={saving || reason.trim().length < 8 || !password}
                onClick={() => void decide("BLOCK")}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {locale === "tr" ? "Engelle" : "Block"}
              </button>
              <button
                type="button"
                disabled={saving || reason.trim().length < 8 || !password}
                onClick={() => void decide("APPROVE_REVIEW")}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {locale === "tr" ? "Onayla" : "Approve"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminCenter>
  );
}

function trialStatusLabel(status: string, locale: string) {
  const labels: Record<string, [string, string]> = {
    PENDING_IDENTITY: [
      "Kimlik doğrulama bekliyor",
      "Pending identity verification",
    ],
    ACTIVE: ["Aktif", "Active"],
    CONSUMED: ["Kullanıldı", "Consumed"],
    INELIGIBLE: ["Uygun değil", "Ineligible"],
    BLOCKED: ["Engellendi", "Blocked"],
    PAID_USAGE: ["Ücretli kullanım", "Paid usage"],
  };
  const value = labels[status] ?? ["Bilinmiyor", "Unknown"];
  return value[locale === "tr" ? 0 : 1];
}
