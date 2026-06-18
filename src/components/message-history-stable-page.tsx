/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, FileText, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { getMessageStatusLabel } from "@/lib/i18n/status-labels";

type Campaign = {
  id: string;
  title: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
};

const ghost =
  "inline-flex items-center justify-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50";
const danger =
  "inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 hover:bg-red-100";

async function post(url: string, body: unknown = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || result.message || "errors.generic");
  return result;
}

export function MessageHistoryStablePage() {
  const { locale, t } = useI18n();
  const [showDeleted, setShowDeleted] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/messages/campaigns?showDeleted=${showDeleted}`, { cache: "no-store" });
    const result = await response.json();
    setCampaigns(response.ok ? result.campaigns : []);
    setSelected([]);
    setLoading(false);
  }, [showDeleted]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(id: string, action: "archive" | "delete") {
    if (!confirm(action === "archive" ? t("history.archiveConfirm") : t("history.deleteConfirm"))) return;
    await post(`/api/messages/campaigns/${id}/${action}`);
    void load();
  }

  async function bulk(action: "archive" | "delete") {
    if (!selected.length) return;
    if (!confirm(action === "archive" ? t("history.bulkArchiveConfirm") : t("history.bulkDeleteConfirm"))) return;
    try {
      const result = await post("/api/messages/campaigns/bulk", { ids: selected, action });
      setStatus(t("history.recordsUpdated", { count: result.affected || 0 }));
      void load();
    } catch (error) {
      const key = error instanceof Error ? error.message : "errors.generic";
      setStatus(t(key));
    }
  }

  async function deleteEveryone(id: string) {
    if (!confirm(t("history.deleteEveryoneConfirm"))) return;
    const response = await fetch(`/api/messages/campaigns/${id}/delete-everyone`, { method: "POST" });
    const result = await response.json();
    setStatus(
      result.message ||
        t("history.deleteEveryoneResult", {
          deleted: result.deleted || 0,
          failed: result.failed || 0,
        }),
    );
  }

  const allSelected = campaigns.length > 0 && selected.length === campaigns.length;

  return (
    <>
      <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.22em] text-primary">{t("history.eyebrow")}</p>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{t("history.title")}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{t("history.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={!selected.length} className={ghost} onClick={() => void bulk("archive")}>
            {t("history.bulkArchive")}
          </button>
          <button disabled={!selected.length} className={ghost} onClick={() => void bulk("delete")}>
            {t("history.bulkDelete")}
          </button>
          <button className={ghost} onClick={() => setShowDeleted((value) => !value)}>
            {showDeleted ? t("history.hideDeleted") : t("history.showDeleted")}
          </button>
          <button className={ghost}>
            <FileText className="size-4" />
            {t("history.export")}
          </button>
        </div>
      </header>
      {status && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">{status}</p>}
      {loading ? (
        <LoaderCircle className="animate-spin text-primary" />
      ) : (
        <section className="panel overflow-hidden rounded-2xl">
          {!campaigns.length ? (
            <div className="p-10 text-center text-sm text-muted">{t("history.empty")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="border-b bg-foreground/[.025] text-[10px] uppercase text-muted">
                  <tr>
                    <th className="px-5 py-4">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(event) => setSelected(event.target.checked ? campaigns.map((campaign) => campaign.id) : [])}
                      />
                    </th>
                    <th className="px-5 py-4 font-medium">{t("history.campaign")}</th>
                    <th className="px-5 py-4 font-medium">{t("history.status")}</th>
                    <th className="px-5 py-4 font-medium">{t("history.progress")}</th>
                    <th className="px-5 py-4 font-medium">{t("history.date")}</th>
                    <th className="px-5 py-4 font-medium">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-b last:border-0">
                      <td className="px-5 py-4">
                        <input
                          type="checkbox"
                          checked={selected.includes(campaign.id)}
                          onChange={(event) =>
                            setSelected(
                              event.target.checked
                                ? [...selected, campaign.id]
                                : selected.filter((id) => id !== campaign.id),
                            )
                          }
                        />
                      </td>
                      <td className="px-5 py-4 font-medium">{campaign.title}</td>
                      <td className="px-5 py-4">{getMessageStatusLabel(campaign.status, locale)}</td>
                      <td className="px-5 py-4">
                        {t("history.sentFailed", {
                          sent: campaign.sentCount,
                          failed: campaign.failedCount,
                        })}{" "}
                        / {campaign.totalRecipients}
                      </td>
                      <td className="px-5 py-4 text-muted">{new Date(campaign.createdAt).toLocaleString(locale)}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          {campaign.failedCount > 0 && (
                            <button
                              title={t("history.retryFailed")}
                              onClick={() => void post(`/api/messages/campaigns/${campaign.id}/retry-failed`).then(load)}
                              className={ghost}
                            >
                              <RefreshCw className="size-4" />
                            </button>
                          )}
                          {campaign.status !== "DELETED" && (
                            <>
                              <button onClick={() => void mutate(campaign.id, "archive")} className={ghost}>
                                <Archive className="size-4" />
                                {t("history.archive")}
                              </button>
                              <button
                                disabled
                                title={t("history.deleteEveryoneUnavailable")}
                                onClick={() => void deleteEveryone(campaign.id)}
                                className={ghost}
                              >
                                {t("history.deleteEveryone")}
                              </button>
                              <button onClick={() => void mutate(campaign.id, "delete")} className={danger}>
                                <Trash2 className="size-4" />
                                {t("history.delete")}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
