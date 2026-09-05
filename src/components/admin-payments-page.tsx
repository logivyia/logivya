"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Check, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import { AdminRecordDialog } from "./admin-record-dialog";
import { useI18n } from "@/i18n/provider";
import { formatCurrency, formatDateTime } from "@/i18n/format";
import { useSearchParams } from "next/navigation";
import { apiErrorMessage } from "@/i18n/api-error";
import { statusLabel } from "@/i18n/status";

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

const button =
  "inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const field =
  "w-full rounded-xl border bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100";
const actionableStatuses = new Set(["PENDING"]);
type PendingAction = { paymentId: string; kind: "approve" | "reject" };
type Pagination = { page: number; total: number; pages: number };

export function AdminPaymentsPage({ canConfirm }: { canConfirm: boolean }) {
  const { locale, t } = useI18n();
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "ALL");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    total: 0,
    pages: 1,
  });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (appliedQuery) params.set("q", appliedQuery);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const response = await fetch(`/api/admin/payments?${params}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(t, result));
      setPayments(result.payments || []);
      setPagination(result.pagination || { page, total: 0, pages: 1 });
    } catch (loadError) {
      setStatus(
        loadError instanceof Error ? loadError.message : t("errors.generic"),
      );
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, page, statusFilter, t]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setStatusFilter(searchParams.get("status") ?? "ALL");
    const initialQuery = searchParams.get("search") ?? searchParams.get("q") ?? "";
    setQuery(initialQuery); setAppliedQuery(initialQuery); setPage(1);
  }, [searchParams]);

  function openAction(paymentId: string, kind: PendingAction["kind"]) {
    setSelectedPayment(null);
    setPendingAction({ paymentId, kind });
    setReason("");
    setPassword("");
    setStatus("");
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canConfirm || !pendingAction || busyId) return;
    const actionReason = reason.trim();
    if (actionReason.length < 5 || !password) return;
    setBusyId(pendingAction.paymentId);
    setStatus("");
    try {
      const reauthResponse = await fetch("/api/admin/security/re-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const reauthResult = await reauthResponse.json();
      if (!reauthResponse.ok) throw new Error(apiErrorMessage(t, reauthResult));

      const response = await fetch(
        pendingAction.kind === "approve"
          ? "/api/admin/payments/mark-paid"
          : "/api/admin/payments/reject",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            pendingAction.kind === "approve"
              ? { paymentId: pendingAction.paymentId, note: actionReason }
              : { paymentId: pendingAction.paymentId, reason: actionReason },
          ),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(t, result));
      setStatus(
        pendingAction.kind === "approve"
          ? t("adminPayments.approved")
          : t("adminPayments.rejected"),
      );
      setPendingAction(null);
      setReason("");
      setPassword("");
      await load();
    } catch (actionError) {
      setStatus(
        actionError instanceof Error
          ? actionError.message
          : t("errors.generic"),
      );
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">
            {t("adminPayments.eyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            {t("adminPayments.title")}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {t("adminPayments.description")}
          </p>
        </div>
        <button
          type="button"
          className={button}
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          {locale === "tr" ? "Yenile" : "Refresh"}
        </button>
      </header>
      {status && (
        <p
          role="status"
          aria-live="polite"
          className="mb-4 rounded-xl border bg-card p-3 text-sm"
        >
          {status}
        </p>
      )}
      <form
        className="mb-5 grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-[minmax(0,1fr)_220px_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setAppliedQuery(query.trim());
        }}
      >
        <label className="relative">
          <span className="sr-only">{t("admin.searchPlaceholder")}</span>
          <Search className="pointer-events-none absolute start-3 top-3.5 size-4 text-slate-400" />
          <input
            className={`${field} ps-10`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("admin.searchPlaceholder")}
          />
        </label>
        <select
          className={field}
          value={statusFilter}
          onChange={(event) => {
            setPage(1);
            setStatusFilter(event.target.value);
          }}
          aria-label={t("common.status")}
        >
          <option value="ALL">
            {locale === "tr" ? "Tüm durumlar" : "All statuses"}
          </option>
          {[
            "PENDING",
            "PAID",
            "SUCCEEDED",
            "MANUALLY_CONFIRMED",
            "FAILED",
            "REFUNDED",
            "REJECTED",
            "CANCELED",
          ].map((value) => (
            <option key={value} value={value}>
              {statusLabel(t, "payment", value)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className={`${button} border-orange-600 bg-orange-600 px-5 text-white`}
        >
          <Search className="size-4" />
          {locale === "tr" ? "Ara" : "Search"}
        </button>
      </form>
      {!payments ? (
        <LoaderCircle
          aria-label={t("common.loading")}
          className="animate-spin text-primary"
        />
      ) : (
        <div className="panel overflow-x-auto rounded-2xl p-5">
          <div className="space-y-3 md:hidden">{payments.map(payment => <button key={payment.id} type="button" onClick={() => setSelectedPayment(payment)} className="block w-full rounded-xl border p-4 text-start active:bg-orange-50"><strong className="block break-words">{payment.company.name}</strong><span className="mt-2 flex flex-wrap justify-between gap-2 text-sm"><span>{formatCurrency(Number(payment.amount), payment.currency, locale)}</span><span>{statusLabel(t, "payment", payment.status)}</span></span><span className="mt-2 block text-xs text-muted">{formatDateTime(payment.createdAt, locale)}</span><span className="mt-3 block text-xs font-semibold text-orange-600">{locale === "tr" ? "Ayrıntıları aç →" : "Open details →"}</span></button>)}</div>
          <table className="hidden w-full min-w-[760px] text-sm md:table">
            <thead>
              <tr className="border-b text-left">
                <th scope="col" className="py-3">
                  {t("common.company")}
                </th>
                <th scope="col">{t("adminSubscriptions.plan")}</th>
                <th scope="col">{t("adminPayments.amount")}</th>
                <th scope="col">{t("common.status")}</th>
                <th scope="col">{t("admin.list.date")}</th>
                <th scope="col">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => {
                const actionable =
                  canConfirm &&
                  actionableStatuses.has(payment.status.toUpperCase());
                return (
                  <tr key={payment.id} className="border-b last:border-0">
                    <td className="py-4 font-medium"><button type="button" className="text-start hover:text-orange-600" onClick={() => setSelectedPayment(payment)}>{payment.company.name}</button></td>
                    <td>{payment.plan?.name || "-"}</td>
                    <td>
                      {formatCurrency(
                        Number(payment.amount),
                        payment.currency,
                        locale,
                      )}
                    </td>
                    <td>
                      <span>{statusLabel(t, "payment", payment.status)}</span>
                      {payment.failureReason && (
                        <p className="mt-1 max-w-64 text-xs text-danger">
                          {payment.failureReason}
                        </p>
                      )}
                    </td>
                    <td>{formatDateTime(payment.createdAt, locale)}</td>
                    <td>
                      {actionable ? (
                        <div className="flex gap-2">
                          <button
                            disabled={busyId === payment.id}
                            onClick={() => openAction(payment.id, "approve")}
                            className={`${button} border-green-200 bg-green-50 text-green-800`}
                          >
                            <Check className="size-4" />
                            {t("adminPayments.approve")}
                          </button>
                          <button
                            disabled={busyId === payment.id}
                            onClick={() => openAction(payment.id, "reject")}
                            className={`${button} border-red-200 bg-red-50 text-red-700`}
                          >
                            <X className="size-4" />
                            {t("adminPayments.reject")}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!payments.length && (
            <p className="py-12 text-center text-sm text-muted">
              {t("adminPayments.empty")}
            </p>
          )}
          {pagination.pages > 1 ? (
            <nav
              className="mt-5 flex items-center justify-between gap-3 border-t pt-4"
              aria-label={locale === "tr" ? "Ödeme sayfaları" : "Payment pages"}
            >
              <span className="text-xs text-muted">
                {pagination.total} · {pagination.page}/{pagination.pages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={button}
                  disabled={loading || page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  {locale === "tr" ? "Önceki" : "Previous"}
                </button>
                <button
                  type="button"
                  className={button}
                  disabled={loading || page >= pagination.pages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  {locale === "tr" ? "Sonraki" : "Next"}
                </button>
              </div>
            </nav>
          ) : null}
        </div>
      )}
      <AdminRecordDialog open={Boolean(selectedPayment)} title={selectedPayment?.company.name ?? t("adminPayments.eyebrow")} onClose={() => setSelectedPayment(null)}>{selectedPayment ? <><dl className="grid gap-4 sm:grid-cols-2">{[[t("adminSubscriptions.plan"),selectedPayment.plan?.name || "-"],[t("adminPayments.amount"),formatCurrency(Number(selectedPayment.amount),selectedPayment.currency,locale)],[t("common.status"),statusLabel(t,"payment",selectedPayment.status)],[t("admin.list.date"),formatDateTime(selectedPayment.createdAt,locale)],[locale === "tr" ? "Ödeme yöntemi" : "Payment method",selectedPayment.paymentMethod]].map(([label,value]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 break-words text-sm font-semibold">{value}</dd></div>)}</dl>{selectedPayment.failureReason ? <p className="mt-4 text-sm text-red-700">{selectedPayment.failureReason}</p> : null}{canConfirm && actionableStatuses.has(selectedPayment.status.toUpperCase()) ? <div className="mt-5 flex flex-wrap gap-3"><button type="button" className={button} onClick={() => openAction(selectedPayment.id,"approve")}>{t("adminPayments.approve")}</button><button type="button" className={button} onClick={() => openAction(selectedPayment.id,"reject")}>{t("adminPayments.reject")}</button></div> : null}</> : null}</AdminRecordDialog>
      {canConfirm && pendingAction ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !busyId)
              setPendingAction(null);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-action-title"
            onSubmit={submitAction}
            className="w-full max-w-lg rounded-2xl bg-white p-6 text-slate-900 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-orange-600">
                  {t("adminPayments.eyebrow")}
                </p>
                <h2
                  id="payment-action-title"
                  className="mt-2 text-xl font-semibold"
                >
                  {pendingAction.kind === "approve"
                    ? t("adminPayments.approve")
                    : t("adminPayments.reject")}
                </h2>
              </div>
              <button
                type="button"
                aria-label={t("common.close")}
                className="grid size-10 place-items-center rounded-xl border"
                onClick={() => setPendingAction(null)}
                disabled={Boolean(busyId)}
              >
                <X className="size-4" />
              </button>
            </div>
            <label className="mt-5 block text-sm font-semibold">
              {t("adminSubscriptions.actionReason")}
              <textarea
                required
                minLength={5}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className={`${field} mt-2 min-h-24`}
              />
            </label>
            <label className="mt-4 block text-sm font-semibold">
              {t("auth.password")}
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${field} mt-2`}
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className={button}
                onClick={() => setPendingAction(null)}
                disabled={Boolean(busyId)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className={`${button} border-orange-600 bg-orange-600 text-white`}
                disabled={
                  Boolean(busyId) || reason.trim().length < 5 || !password
                }
              >
                {busyId ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : pendingAction.kind === "approve" ? (
                  <Check className="size-4" />
                ) : (
                  <X className="size-4" />
                )}
                {t("common.save")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
