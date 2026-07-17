"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Archive, Bell, CheckCheck, LoaderCircle } from "lucide-react";
import { formatDateTime } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";

type NotificationItem = {
  id: string;
  type: string;
  category: string;
  priority: string;
  title: string;
  message: string;
  deepLink?: string | null;
  isRead: boolean;
  createdAt: string;
};

const categories = ["ALL", "ACCOUNT", "SECURITY", "SUPPORT", "SUBSCRIPTION", "BILLING", "INVITATION", "WHATSAPP", "MESSAGE", "SYSTEM", "COMPLIANCE", "INCIDENT"];

export function NotificationCenterPage() {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [category, setCategory] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ limit: "50" });
    if (category !== "ALL") query.set("category", category);
    const response = await fetch(`/api/notifications?${query}`);
    const body = await response.json();
    if (!response.ok) setError(body.error || t("notifications.loadFailed"));
    else setItems(body.notifications || []);
    setLoading(false);
  }, [category, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function mutate(id: string, action: "read" | "archive") {
    const response = await fetch(`/api/notifications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) return;
    if (action === "archive") setItems((current) => current.filter((item) => item.id !== id));
    else setItems((current) => current.map((item) => item.id === id ? { ...item, isRead: true } : item));
  }

  async function markAll() {
    await fetch("/api/notifications", { method: "POST" });
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{t("notifications.eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold">{t("notifications.title")}</h1>
          <p className="mt-2 text-sm text-muted">{t("notifications.centerDescription")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/settings/notifications" className="inline-flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold"><Bell className="size-4" />{t("notifications.preferences")}</Link>
          <button type="button" onClick={() => void markAll()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"><CheckCheck className="size-4" />{t("notifications.markAll")}</button>
        </div>
      </header>

      <label className="block max-w-sm">
        <span className="mb-2 block text-xs font-medium">{t("notifications.category")}</span>
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-lg border bg-card px-3 py-3 text-sm">
          {categories.map((value) => <option key={value} value={value}>{value === "ALL" ? t("common.all") : t(`notification.category.${value.toLowerCase()}`)}</option>)}
        </select>
      </label>

      <section className="divide-y rounded-lg border bg-card">
        {loading ? <div className="grid min-h-40 place-items-center"><LoaderCircle className="size-6 animate-spin text-primary" /></div> : null}
        {!loading && error ? <p className="p-6 text-sm text-danger-foreground">{error}</p> : null}
        {!loading && !error && !items.length ? <p className="p-10 text-center text-sm text-muted">{t("notifications.empty")}</p> : null}
        {!loading && !error ? items.map((item) => (
          <article key={item.id} className="flex gap-4 p-5">
            <span className={`mt-2 size-2 shrink-0 rounded-full ${item.isRead ? "bg-muted/30" : "bg-primary"}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted">{t(`notification.category.${item.category.toLowerCase()}`)} · {item.priority}</p>
                  <h2 className="mt-1 font-semibold">{item.title}</h2>
                </div>
                <time className="text-xs text-muted">{formatDateTime(item.createdAt, locale)}</time>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">{item.message}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {safeNotificationHref(item.deepLink) ? <Link href={safeNotificationHref(item.deepLink)!} onClick={() => void mutate(item.id, "read")} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">{t("notifications.open")}</Link> : null}
                {!item.isRead ? <button type="button" onClick={() => void mutate(item.id, "read")} className="rounded-lg border px-3 py-2 text-xs font-semibold">{t("notifications.markRead")}</button> : null}
                <button type="button" onClick={() => void mutate(item.id, "archive")} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"><Archive className="size-3.5" />{t("notifications.archive")}</button>
              </div>
            </div>
          </article>
        )) : null}
      </section>
    </div>
  );
}

function safeNotificationHref(value?: string | null) {
  if (!value) return null;
  if (value.startsWith("/")) return value;
  if (/^https:\/\/(www\.)?logivya\.com(\/|$)/i.test(value)) return value;
  return null;
}
