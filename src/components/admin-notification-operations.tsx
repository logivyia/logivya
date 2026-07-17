"use client";

import { type FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Mail, Megaphone, RefreshCw, Send } from "lucide-react";
import { useI18n } from "@/i18n/provider";

type DeadLetter = {
  id: string;
  eventType: string;
  channel: string;
  errorCode: string;
  attempts: number;
  createdAt: string;
};

type NotificationTemplate = {
  id: string;
  eventType: string;
  channel: string;
  locale: string;
  version: number;
  name: string;
  status: string;
  isActive: boolean;
  subject?: string | null;
  title?: string | null;
  body: string;
  requiredVariables: string[];
};

type NotificationAnnouncement = {
  id: string;
  title: string;
  body: string;
  audience: string;
  channels: string[];
  locale: string;
  priority: string;
  status: string;
  startsAt: string;
  previewHash: string;
};

export function AdminNotificationOperations({ deadLetters, eventTypes }: { deadLetters: DeadLetter[]; eventTypes: string[] }) {
  const { t } = useI18n();
  const copy = notificationAdminCopy(t);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [providers, setProviders] = useState<Record<string, unknown> | null>(null);
  const [announcements, setAnnouncements] = useState<NotificationAnnouncement[]>([]);

  useEffect(() => {
    void Promise.all([
      fetch("/api/admin/notification-templates").then((response) => response.json()),
      fetch("/api/admin/notifications/providers").then((response) => response.json()),
      fetch("/api/admin/announcements").then((response) => response.json()),
    ]).then(([templateBody, providerBody, announcementBody]) => {
      setTemplates(templateBody.templates || []);
      setProviders(providerBody.providers || null);
      setAnnouncements(announcementBody.announcements || []);
    });
  }, []);

  async function dispatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const form = new FormData(event.currentTarget);
    const channels = form.getAll("channels").map(String);
    const startsAt = String(form.get("startsAt") || "");
    const endsAt = String(form.get("endsAt") || "");
    const response = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        audience: "PLATFORM_ALL_USERS",
        title: form.get("title"),
        body: form.get("message"),
        locale: form.get("locale"),
        priority: form.get("priority"),
        channels,
        deepLink: form.get("deepLink") || undefined,
        startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
      }),
    });
    const body = await response.json();
    setStatus(response.ok ? copy.draftCreated : copy.draftFailed);
    setBusy(false);
    if (response.ok) {
      setAnnouncements((current) => [body.announcement, ...current]);
      event.currentTarget.reset();
    }
  }

  async function publishAnnouncement(id: string) {
    setBusy(true);
    setStatus("");
    try {
      const previewResponse = await fetch(`/api/admin/announcements/${encodeURIComponent(id)}/preview`);
      const previewBody = await previewResponse.json();
      if (!previewResponse.ok || !previewBody.unchanged) throw new Error(copy.previewStale);
      const preview = previewBody.preview as { title: string; recipientCount: number; channels: string[]; locale: string; startsAt: string; confirmation: string };
      const accepted = window.confirm(`${preview.title}\n\n${copy.audience}: ${preview.recipientCount}\n${copy.channels}: ${preview.channels.join(", ")}\n${copy.locale}: ${preview.locale}\n${copy.schedule}: ${new Date(preview.startsAt).toLocaleString()}\n\n${copy.continueConfirmation}`);
      if (!accepted) return;
      const confirmation = window.prompt(`${copy.typeExactly}: ${preview.confirmation}`);
      if (confirmation !== preview.confirmation) throw new Error(copy.confirmationMismatch);
      let secondConfirmation: string | undefined;
      if (previewBody.requiresSecondConfirmation) {
        secondConfirmation = window.prompt(`${copy.largeAudience}: CONFIRM ${id}`) || undefined;
      }
      const response = await fetch(`/api/admin/announcements/${encodeURIComponent(id)}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ previewHash: previewBody.previewHash, confirmation, secondConfirmation }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(copy.publishFailed);
      setAnnouncements((current) => current.map((item) => item.id === id ? { ...item, status: body.status } : item));
      setStatus(`${copy.announcementQueued}: ${body.recipientCount}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.publishFailed);
    } finally {
      setBusy(false);
    }
  }

  async function cancelAnnouncement(id: string) {
    const reason = window.prompt(copy.cancelReason);
    if (!reason || reason.trim().length < 5) return;
    setBusy(true);
    const response = await fetch(`/api/admin/announcements/${encodeURIComponent(id)}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) });
    await response.json();
    setStatus(response.ok ? copy.announcementCanceled : copy.cancelFailed);
    if (response.ok) setAnnouncements((current) => current.map((item) => item.id === id ? { ...item, status: "CANCELED" } : item));
    setBusy(false);
  }

  async function retry(id: string) {
    const resolution = window.prompt(copy.retryReason);
    if (!resolution || resolution.trim().length < 5) return;
    setBusy(true);
    const response = await fetch(`/api/admin/notifications/dead-letters/${encodeURIComponent(id)}/retry`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolution }),
    });
    await response.json();
    setStatus(response.ok ? copy.retryQueued : copy.retryFailed);
    setBusy(false);
    if (response.ok) window.location.reload();
  }

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/notification-templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scopeKey: "GLOBAL",
        eventType: form.get("eventType"),
        channel: form.get("channel"),
        locale: form.get("locale"),
        name: form.get("name"),
        subject: form.get("subject") || undefined,
        title: form.get("title") || undefined,
        body: form.get("body"),
        requiredVariables: String(form.get("requiredVariables") || "").split(",").map((value) => value.trim()).filter(Boolean),
      }),
    });
    const body = await response.json();
    if (response.ok) {
      setTemplates((current) => [body.template, ...current]);
      setStatus(copy.templateDraftCreated);
      event.currentTarget.reset();
    } else setStatus(copy.templateCreateFailed);
    setBusy(false);
  }

  async function approveTemplate(id: string) {
    setBusy(true);
    const response = await fetch(`/api/admin/notification-templates/${encodeURIComponent(id)}/approve`, { method: "POST" });
    const body = await response.json();
    if (response.ok) {
      setTemplates((current) => current.map((template) => template.eventType === body.template.eventType && template.channel === body.template.channel && template.locale === body.template.locale
        ? { ...template, isActive: template.id === id, status: template.id === id ? "APPROVED" : template.status }
        : template));
      setStatus(copy.templateApproved);
    } else setStatus(copy.templateApproveFailed);
    setBusy(false);
  }

  async function previewTemplate(template: NotificationTemplate) {
    setBusy(true);
    const response = await fetch("/api/admin/notification-templates/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: template.subject || undefined, title: template.title || undefined, body: template.body, requiredVariables: template.requiredVariables || [], variables: {} }),
    });
    const body = await response.json();
    if (response.ok) window.alert(`Subject: ${body.preview.subject}\nTitle: ${body.preview.title}\n\n${body.preview.body}`);
    else setStatus(copy.templatePreviewFailed);
    setBusy(false);
  }

  async function testTemplate(id: string) {
    if (!window.confirm(copy.testConfirm)) return;
    setBusy(true);
    const response = await fetch(`/api/admin/notification-templates/${encodeURIComponent(id)}/test`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ variables: {} }) });
    await response.json();
    setStatus(response.ok ? copy.testCompleted : copy.testFailed);
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <Megaphone className="size-5 text-orange-500" />
          <div>
            <h2 className="font-semibold">{copy.platformAnnouncement}</h2>
            <p className="text-xs text-slate-500">{copy.platformAnnouncementDescription}</p>
          </div>
        </div>
        <form onSubmit={dispatch} className="grid gap-4 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className="mb-2 block text-xs font-medium text-slate-600">{copy.title}</span>
            <input name="title" required maxLength={160} className="w-full rounded-lg border px-3 py-3 text-sm" />
          </label>
          <label className="md:col-span-2">
            <span className="mb-2 block text-xs font-medium text-slate-600">{copy.message}</span>
            <textarea name="message" required maxLength={2000} rows={4} className="w-full resize-y rounded-lg border px-3 py-3 text-sm" />
          </label>
          <label>
            <span className="mb-2 block text-xs font-medium text-slate-600">{copy.deepLink}</span>
            <input name="deepLink" placeholder={copy.deepLinkExample} className="w-full rounded-lg border px-3 py-3 text-sm" />
          </label>
          <label><span className="mb-2 block text-xs font-medium text-slate-600">{copy.locale}</span><input name="locale" defaultValue="tr" required className="w-full rounded-lg border px-3 py-3 text-sm" /></label>
          <label><span className="mb-2 block text-xs font-medium text-slate-600">{copy.priority}</span><select name="priority" defaultValue="NORMAL" className="w-full rounded-lg border px-3 py-3 text-sm">{Object.entries(copy.priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <fieldset className="md:col-span-2"><legend className="mb-2 text-xs font-medium text-slate-600">{copy.channels}</legend><div className="flex flex-wrap gap-4 text-sm">{Object.entries(copy.channelLabels).map(([channel, label]) => <label key={channel} className="flex items-center gap-2"><input type="checkbox" name="channels" value={channel} defaultChecked={channel === "IN_APP" || channel === "ANDROID_PUSH"} />{label}</label>)}</div></fieldset>
          <label><span className="mb-2 block text-xs font-medium text-slate-600">{copy.startTime}</span><input type="datetime-local" name="startsAt" className="w-full rounded-lg border px-3 py-3 text-sm" /></label>
          <label><span className="mb-2 block text-xs font-medium text-slate-600">{copy.endTime}</span><input type="datetime-local" name="endsAt" className="w-full rounded-lg border px-3 py-3 text-sm" /></label>
          <div className="flex items-end">
            <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
              <Send className="size-4" />
              {copy.createDraft}
            </button>
          </div>
        </form>
        {status ? <p className="mt-4 text-sm text-slate-600" role="status">{status}</p> : null}
        <div className="mt-5 divide-y rounded-lg border">
          {announcements.slice(0, 20).map((announcement) => <div key={announcement.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs"><span><strong>{announcement.title}</strong> / {announcement.status} / {announcement.channels.map((channel) => copy.channelLabels[channel] ?? channel).join(", ")} / {announcement.locale}</span><div className="flex gap-2">{announcement.status === "DRAFT" ? <button type="button" disabled={busy} onClick={() => void publishAnnouncement(announcement.id)} className="rounded-lg border px-3 py-2 font-semibold">{copy.previewAndPublish}</button> : null}{!["CANCELED", "COMPLETED", "ARCHIVED"].includes(announcement.status) ? <button type="button" disabled={busy} onClick={() => void cancelAnnouncement(announcement.id)} className="rounded-lg border px-3 py-2 font-semibold text-red-700">{copy.cancel}</button> : null}</div></div>)}
          {!announcements.length ? <p className="p-4 text-sm text-slate-500">{copy.noAnnouncements}</p> : null}
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="font-semibold">{copy.unresolvedDeadLetters}</h2>
          <p className="text-xs text-slate-500">{copy.deadLetterDescription}</p>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-3">{copy.event}</th><th>{copy.channel}</th><th>{copy.error}</th><th>{copy.attempts}</th><th>{copy.date}</th><th /></tr></thead>
          <tbody>
            {deadLetters.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="py-4 pe-4">{item.eventType}</td><td className="pe-4">{item.channel}</td><td className="pe-4 font-mono text-xs">{item.errorCode}</td><td className="pe-4">{item.attempts}</td><td className="pe-4">{item.createdAt}</td>
                <td><button type="button" disabled={busy} onClick={() => void retry(item.id)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-60"><RefreshCw className="size-3.5" />{copy.retry}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!deadLetters.length ? <p className="py-8 text-center text-sm text-slate-500">{copy.noDeadLetters}</p> : null}
      </section>

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <Mail className="size-5 text-orange-500" />
          <div><h2 className="font-semibold">{copy.versionedTemplates}</h2><p className="text-xs text-slate-500">{copy.versionedTemplatesDescription}</p></div>
        </div>
        <form onSubmit={createTemplate} className="grid gap-3 md:grid-cols-2">
          <select name="eventType" required className="rounded-lg border px-3 py-3 text-sm">{eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>
          <select name="channel" required className="rounded-lg border px-3 py-3 text-sm">{Object.entries(copy.channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input name="locale" required defaultValue="tr" maxLength={8} className="rounded-lg border px-3 py-3 text-sm" aria-label={copy.locale} />
          <input name="name" required placeholder={copy.templateName} className="rounded-lg border px-3 py-3 text-sm" />
          <input name="title" placeholder={copy.title} className="rounded-lg border px-3 py-3 text-sm" />
          <input name="subject" placeholder={copy.emailSubject} className="rounded-lg border px-3 py-3 text-sm" />
          <textarea name="body" required placeholder={copy.templateBody} rows={4} className="rounded-lg border px-3 py-3 text-sm md:col-span-2" />
          <input name="requiredVariables" placeholder={copy.requiredVariables} className="rounded-lg border px-3 py-3 text-sm md:col-span-2" />
          <button disabled={busy} className="rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white md:col-span-2 disabled:opacity-60">{copy.createDraft}</button>
        </form>
        <div className="mt-5 divide-y rounded-lg border">
          {templates.slice(0, 20).map((template) => (
            <div key={template.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
              <span><strong>{template.name}</strong> / {template.eventType} / {copy.channelLabels[template.channel] ?? template.channel}/{template.locale} / {copy.version} {template.version}</span>
              <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={busy} onClick={() => void previewTemplate(template)} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-60">{copy.preview}</button><button type="button" disabled={busy} onClick={() => void testTemplate(template.id)} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-60">{copy.testSelf}</button>{template.isActive ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="size-3.5" />{copy.active}</span> : <button type="button" disabled={busy} onClick={() => void approveTemplate(template.id)} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-60">{copy.approve}</button>}</div>
            </div>
          ))}
          {!templates.length ? <p className="p-4 text-sm text-slate-500">{copy.noTemplates}</p> : null}
        </div>
      </section>

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="font-semibold">{copy.providerReadiness}</h2>
        <p className="mt-1 text-xs text-slate-500">{copy.providerReadinessDescription}</p>
        <pre className="mt-4 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(providers, null, 2)}</pre>
      </section>
    </div>
  );
}

function notificationAdminCopy(t: (key: string) => string) {
  return {
    platformAnnouncement: t("notifications.admin.platformAnnouncement"),
    platformAnnouncementDescription: t("notifications.admin.platformAnnouncementDescription"),
    title: t("notifications.admin.title"),
    message: t("notifications.admin.message"),
    deepLink: t("notifications.admin.deepLink"),
    deepLinkExample: "/dashboard",
    locale: t("notifications.admin.locale"),
    priority: t("notifications.admin.priority"),
    channels: t("notifications.admin.channels"),
    startTime: t("notifications.admin.startTime"),
    endTime: t("notifications.admin.endTime"),
    createDraft: t("notifications.admin.createDraft"),
    previewAndPublish: t("notifications.admin.previewAndPublish"),
    cancel: t("notifications.admin.cancel"),
    noAnnouncements: t("notifications.admin.noAnnouncements"),
    unresolvedDeadLetters: t("notifications.admin.unresolvedDeadLetters"),
    deadLetterDescription: t("notifications.admin.deadLetterDescription"),
    event: t("notifications.admin.event"),
    channel: t("notifications.admin.channel"),
    error: t("notifications.admin.error"),
    attempts: t("notifications.admin.attempts"),
    date: t("notifications.admin.date"),
    retry: t("notifications.admin.retry"),
    noDeadLetters: t("notifications.admin.noDeadLetters"),
    versionedTemplates: t("notifications.admin.versionedTemplates"),
    versionedTemplatesDescription: t("notifications.admin.versionedTemplatesDescription"),
    templateName: t("notifications.admin.templateName"),
    emailSubject: t("notifications.admin.emailSubject"),
    templateBody: t("notifications.admin.templateBody"),
    requiredVariables: t("notifications.admin.requiredVariables"),
    preview: t("notifications.admin.preview"),
    testSelf: t("notifications.admin.testSelf"),
    active: t("notifications.admin.active"),
    approve: t("notifications.admin.approve"),
    noTemplates: t("notifications.admin.noTemplates"),
    version: t("adminCompliance.version"),
    providerReadiness: t("notifications.admin.providerReadiness"),
    providerReadinessDescription: t("notifications.admin.providerReadinessDescription"),
    draftCreated: t("notifications.admin.draftCreated"),
    draftFailed: t("notifications.admin.draftFailed"),
    previewStale: t("notifications.admin.previewStale"),
    audience: t("notifications.admin.audience"),
    schedule: t("notifications.admin.schedule"),
    continueConfirmation: t("notifications.admin.continueConfirmation"),
    typeExactly: t("notifications.admin.typeExactly"),
    confirmationMismatch: t("notifications.admin.confirmationMismatch"),
    largeAudience: t("notifications.admin.largeAudience"),
    publishFailed: t("notifications.admin.publishFailed"),
    announcementQueued: t("notifications.admin.announcementQueued"),
    cancelReason: t("notifications.admin.cancelReason"),
    announcementCanceled: t("notifications.admin.announcementCanceled"),
    cancelFailed: t("notifications.admin.cancelFailed"),
    retryReason: t("notifications.admin.retryReason"),
    retryQueued: t("notifications.admin.retryQueued"),
    retryFailed: t("notifications.admin.retryFailed"),
    templateDraftCreated: t("notifications.admin.templateDraftCreated"),
    templateCreateFailed: t("notifications.admin.templateCreateFailed"),
    templateApproved: t("notifications.admin.templateApproved"),
    templateApproveFailed: t("notifications.admin.templateApproveFailed"),
    templatePreviewFailed: t("notifications.admin.templatePreviewFailed"),
    testConfirm: t("notifications.admin.testConfirm"),
    testCompleted: t("notifications.admin.testCompleted"),
    testFailed: t("notifications.admin.testFailed"),
    priorityLabels: {
      LOW: t("notifications.admin.priorityLow"),
      NORMAL: t("notifications.admin.priorityNormal"),
      HIGH: t("notifications.admin.priorityHigh"),
      CRITICAL: t("notifications.admin.priorityCritical"),
    },
    channelLabels: {
      IN_APP: t("notification.channel.in_app"),
      EMAIL: t("notification.channel.email"),
      ANDROID_PUSH: t("notification.channel.android_push"),
      WEB_PUSH: t("notification.channel.web_push"),
      IOS_PUSH: t("notification.channel.ios_push"),
    } as Record<string, string>,
  };
}
