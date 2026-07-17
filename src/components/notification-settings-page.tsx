"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, LoaderCircle, MonitorUp, Save } from "lucide-react";
import { useI18n } from "@/i18n/provider";

type Preference = {
  category: string;
  channel: string;
  enabled: boolean;
  mandatoryLocked: boolean;
  digestMode: "IMMEDIATE" | "DAILY" | "WEEKLY";
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
};

export function NotificationSettingsPage() {
  const { t } = useI18n();
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [webPush, setWebPush] = useState<{ configured: boolean; publicKey: string | null; activeDevices: number } | null>(null);
  const categories = useMemo(() => [...new Set(preferences.map((preference) => preference.category))], [preferences]);

  useEffect(() => {
    void fetch("/api/notifications/preferences").then(async (response) => {
      const body = await response.json();
      if (response.ok) setPreferences(body.preferences || []);
      else setStatus(body.error || t("notifications.loadFailed"));
      setLoading(false);
    });
  }, [t]);

  useEffect(() => {
    void fetch("/api/notification-devices").then(async (response) => {
      const body = await response.json();
      if (response.ok) setWebPush(body);
    });
  }, []);

  function toggle(category: string, channel: string) {
    setPreferences((current) => current.map((preference) => preference.category === category && preference.channel === channel && !preference.mandatoryLocked
      ? { ...preference, enabled: !preference.enabled }
      : preference));
  }

  function updatePreference(category: string, channel: string, patch: Partial<Preference>) {
    setPreferences((current) => current.map((preference) =>
      preference.category === category && preference.channel === channel ? { ...preference, ...patch } : preference
    ));
  }

  async function save() {
    setSaving(true);
    setStatus("");
    const response = await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferences }),
    });
    const body = await response.json();
    if (response.ok) {
      setPreferences(body.preferences || []);
      setStatus(t("notifications.preferencesSaved"));
    } else setStatus(body.error || t("notifications.preferencesSaveFailed"));
    setSaving(false);
  }

  async function enableWebPush() {
    setSaving(true);
    setStatus("");
    try {
      if (!webPush?.configured || !webPush.publicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus(t("notifications.webPushUnavailable"));
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(t("notifications.webPushPermissionDenied"));
        return;
      }
      const registration = await navigator.serviceWorker.register("/logivya-notifications-sw.js", { scope: "/" });
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(webPush.publicKey) });
      const response = await fetch("/api/notification-devices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: JSON.stringify(subscription.toJSON()), deviceId: getWebPushDeviceId(), appVersion: "web" }),
      });
      if (!response.ok) throw new Error("REGISTER_FAILED");
      setWebPush((current) => current ? { ...current, activeDevices: Math.max(1, current.activeDevices) } : current);
      setStatus(t("notifications.webPushEnabled"));
    } catch {
      setStatus(t("notifications.webPushEnableFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function disableWebPush() {
    setSaving(true);
    setStatus("");
    try {
      const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration("/") : undefined;
      const subscription = await registration?.pushManager.getSubscription();
      const token = subscription ? JSON.stringify(subscription.toJSON()) : undefined;
      const response = await fetch("/api/notification-devices", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(token ? { token } : {}), deviceId: getWebPushDeviceId() }),
      });
      if (!response.ok) throw new Error("REMOVE_FAILED");
      await subscription?.unsubscribe();
      setWebPush((current) => current ? { ...current, activeDevices: 0 } : current);
      setStatus(t("notifications.webPushDisabled"));
    } catch {
      setStatus(t("notifications.webPushDisableFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{t("settings.managementEyebrow")}</p>
        <h1 className="mt-2 text-3xl font-semibold">{t("notifications.preferences")}</h1>
        <p className="mt-2 text-sm text-muted">{t("notifications.preferencesDescription")}</p>
      </header>
      {loading ? <LoaderCircle className="size-6 animate-spin text-primary" /> : (
        <div className="grid gap-4 xl:grid-cols-2">
          {categories.map((category) => (
            <section key={category} className="rounded-lg border bg-card p-5">
              <div className="mb-4 flex items-center gap-3"><BellRing className="size-4 text-primary" /><h2 className="font-semibold">{t(`notification.category.${category.toLowerCase()}`)}</h2></div>
              <div className="divide-y">
                {preferences.filter((item) => item.category === category && item.channel !== "IOS_PUSH").map((preference) => (
                  <div key={preference.channel} className="space-y-3 py-4">
                    <label className="flex cursor-pointer items-center justify-between gap-4">
                      <span>
                        <span className="block text-sm font-medium">{t(`notification.channel.${preference.channel.toLowerCase()}`)}</span>
                        {preference.mandatoryLocked ? <span className="text-xs text-muted">{t("notifications.mandatory")}</span> : null}
                      </span>
                      <input type="checkbox" checked={preference.enabled} disabled={preference.mandatoryLocked} onChange={() => toggle(preference.category, preference.channel)} className="size-5 accent-[var(--primary)]" />
                    </label>
                    {preference.enabled && preference.channel !== "IN_APP" ? (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="sm:col-span-1">
                          <span className="mb-1 block text-xs text-muted">{t("notifications.deliveryMode")}</span>
                          <select value={preference.digestMode} onChange={(event) => updatePreference(preference.category, preference.channel, { digestMode: event.target.value as Preference["digestMode"] })} className="w-full rounded-lg border bg-card px-3 py-2 text-sm">
                            <option value="IMMEDIATE">{t("notifications.immediate")}</option>
                            <option value="DAILY">{t("notifications.dailyDigest")}</option>
                            <option value="WEEKLY">{t("notifications.weeklyDigest")}</option>
                          </select>
                        </label>
                        <label>
                          <span className="mb-1 block text-xs text-muted">{t("notifications.quietStart")}</span>
                          <input type="time" value={preference.quietHoursStart || ""} onChange={(event) => updatePreference(preference.category, preference.channel, { quietHoursStart: event.target.value || null })} className="w-full rounded-lg border bg-card px-3 py-2 text-sm" />
                        </label>
                        <label>
                          <span className="mb-1 block text-xs text-muted">{t("notifications.quietEnd")}</span>
                          <input type="time" value={preference.quietHoursEnd || ""} onChange={(event) => updatePreference(preference.category, preference.channel, { quietHoursEnd: event.target.value || null })} className="w-full rounded-lg border bg-card px-3 py-2 text-sm" />
                        </label>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <section className="rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <MonitorUp className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <h2 className="font-semibold">{t("notifications.webPushTitle")}</h2>
              <p className="mt-1 text-sm text-muted">{t("notifications.webPushDescription")}</p>
            </div>
          </div>
          {webPush?.activeDevices ? (
            <button type="button" disabled={saving} onClick={() => void disableWebPush()} className="rounded-lg border px-4 py-3 text-sm font-semibold disabled:opacity-60">{t("notifications.webPushDisable")}</button>
          ) : (
            <button type="button" disabled={saving || webPush?.configured === false} onClick={() => void enableWebPush()} className="rounded-lg border px-4 py-3 text-sm font-semibold disabled:opacity-60">{t("notifications.webPushEnable")}</button>
          )}
        </div>
      </section>
      <button type="button" onClick={() => void save()} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"><Save className="size-4" />{t("common.save")}</button>
      {status ? <p className="text-sm text-muted" role="status">{status}</p> : null}
    </div>
  );
}

function getWebPushDeviceId() {
  const key = "logivya-web-push-device-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const value = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(key, value);
  return value;
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = window.atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
