"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  LockKeyhole,
  Mail,
  Megaphone,
  RefreshCw,
  Send,
} from "lucide-react";
import { apiErrorMessage } from "@/i18n/api-error";
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

type ProviderStatus = {
  configured?: boolean;
  provider?: string;
  activeDevices?: number;
  readiness?: string;
  missingVariables?: string[];
};

type ProviderReadiness = {
  providers: Record<string, ProviderStatus>;
  recentWebhooks: number;
};

type OperationDialogValue = {
  reason?: string;
  confirmation?: string;
  secondConfirmation?: string;
};

type OperationDialogOptions = {
  title: string;
  description?: string;
  summary?: Array<{ label: string; value: string }>;
  preview?: { subject?: string; title?: string; body: string };
  reasonLabel?: string;
  confirmationPhrase?: string;
  secondConfirmationPhrase?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  readOnly?: boolean;
};

type OperationDialogState = OperationDialogOptions & {
  resolve: (value: OperationDialogValue | null) => void;
};

export function AdminNotificationOperations({
  deadLetters,
  eventTypes,
  canManage,
}: {
  deadLetters: DeadLetter[];
  eventTypes: string[];
  canManage: boolean;
}) {
  const { locale, t } = useI18n();
  const copy = notificationAdminCopy(t);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminPassword, setAdminPassword] = useState("");
  const [elevated, setElevated] = useState(false);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [providers, setProviders] = useState<ProviderReadiness | null>(null);
  const [announcements, setAnnouncements] = useState<
    NotificationAnnouncement[]
  >([]);
  const [operationDialog, setOperationDialog] =
    useState<OperationDialogState | null>(null);

  function requestOperation(options: OperationDialogOptions) {
    operationDialog?.resolve(null);
    return new Promise<OperationDialogValue | null>((resolve) => {
      setOperationDialog({ ...options, resolve });
    });
  }

  function resolveOperation(value: OperationDialogValue | null) {
    operationDialog?.resolve(value);
    setOperationDialog(null);
  }

  useEffect(() => {
    let active = true;
    async function loadOperations() {
      setLoading(true);
      try {
        const responses = await Promise.all([
          fetch("/api/admin/notification-templates", { cache: "no-store" }),
          fetch("/api/admin/notifications/providers", { cache: "no-store" }),
          fetch("/api/admin/announcements", { cache: "no-store" }),
        ]);
        const [templateBody, providerBody, announcementBody] =
          await Promise.all(responses.map((response) => response.json()));
        const failedIndex = responses.findIndex((response) => !response.ok);
        if (failedIndex >= 0)
          throw new Error(
            apiErrorMessage(
              t,
              [templateBody, providerBody, announcementBody][failedIndex],
            ),
          );
        if (!active) return;
        setTemplates(templateBody.templates || []);
        setProviders({
          providers: providerBody.providers || {},
          recentWebhooks: Number(providerBody.recentWebhooks || 0),
        });
        setAnnouncements(announcementBody.announcements || []);
      } catch (loadError) {
        if (active)
          setStatus(
            loadError instanceof Error
              ? loadError.message
              : t("errors.generic"),
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadOperations();
    return () => {
      active = false;
    };
  }, [t]);

  function mutationError(
    response: Response,
    body: { error?: unknown; code?: unknown; message?: unknown } | null,
    fallback: string,
  ) {
    if (response.status === 428) setElevated(false);
    const translated = apiErrorMessage(t, body);
    return translated === t("errors.generic") ? fallback : translated;
  }

  function requireElevatedSession() {
    if (!canManage) {
      setStatus(
        locale === "tr"
          ? "Bu rol bildirim operasyonlarını değiştiremez."
          : "This role cannot modify notification operations.",
      );
      return false;
    }
    if (elevated) return true;
    setStatus(
      locale === "tr"
        ? "Bu işlem için önce yönetici parolanızla doğrulama yapın."
        : "Verify with your administrator password before this action.",
    );
    return false;
  }

  async function unlockOperations(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adminPassword || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/security/re-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(t, body));
      setElevated(true);
      setAdminPassword("");
      setStatus(
        locale === "tr"
          ? "Kritik operasyonlar için yönetici doğrulaması tamamlandı."
          : "Administrator verification completed for critical operations.",
      );
    } catch (unlockError) {
      setElevated(false);
      setStatus(
        unlockError instanceof Error
          ? unlockError.message
          : t("errors.generic"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function dispatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireElevatedSession()) return;
    const formElement = event.currentTarget;
    setBusy(true);
    setStatus("");
    try {
      const form = new FormData(formElement);
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
      if (!response.ok)
        throw new Error(mutationError(response, body, copy.draftFailed));
      setStatus(copy.draftCreated);
      setAnnouncements((current) => [body.announcement, ...current]);
      formElement.reset();
    } catch (dispatchError) {
      setStatus(
        dispatchError instanceof Error
          ? dispatchError.message
          : copy.draftFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  async function publishAnnouncement(id: string) {
    if (!requireElevatedSession()) return;
    setBusy(true);
    setStatus("");
    try {
      const previewResponse = await fetch(
        `/api/admin/announcements/${encodeURIComponent(id)}/preview`,
      );
      const previewBody = await previewResponse.json();
      if (!previewResponse.ok || !previewBody.unchanged)
        throw new Error(copy.previewStale);
      const preview = previewBody.preview as {
        title: string;
        recipientCount: number;
        channels: string[];
        locale: string;
        startsAt: string;
        confirmation: string;
      };
      const decision = await requestOperation({
        title: preview.title,
        description: copy.continueConfirmation,
        summary: [
          { label: copy.audience, value: String(preview.recipientCount) },
          {
            label: copy.channels,
            value: preview.channels
              .map((channel) => copy.channelLabels[channel] ?? channel)
              .join(", "),
          },
          { label: copy.locale, value: preview.locale },
          {
            label: copy.schedule,
            value: new Date(preview.startsAt).toLocaleString(locale),
          },
        ],
        reasonLabel:
          locale === "tr"
            ? "Yayın gerekçesi (en az 5 karakter)"
            : "Publication reason (at least 5 characters)",
        confirmationPhrase: preview.confirmation,
        secondConfirmationPhrase: previewBody.requiresSecondConfirmation
          ? `CONFIRM ${id}`
          : undefined,
        confirmLabel:
          locale === "tr" ? "Duyuruyu yayınla" : "Publish announcement",
        cancelLabel: t("common.cancel"),
        destructive: true,
      });
      if (!decision) return;
      const response = await fetch(
        `/api/admin/announcements/${encodeURIComponent(id)}/publish`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            previewHash: previewBody.previewHash,
            confirmation: decision.confirmation,
            secondConfirmation: decision.secondConfirmation,
            reason: decision.reason,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(mutationError(response, body, copy.publishFailed));
      setAnnouncements((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: body.status } : item,
        ),
      );
      setStatus(`${copy.announcementQueued}: ${body.recipientCount}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.publishFailed);
    } finally {
      setBusy(false);
    }
  }

  async function cancelAnnouncement(id: string) {
    if (!requireElevatedSession()) return;
    const decision = await requestOperation({
      title: copy.cancel,
      description: copy.cancelReason,
      reasonLabel: copy.cancelReason,
      confirmLabel: copy.cancel,
      cancelLabel: t("common.cancel"),
      destructive: true,
    });
    if (!decision?.reason) return;
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(
        `/api/admin/announcements/${encodeURIComponent(id)}/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: decision.reason }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(mutationError(response, body, copy.cancelFailed));
      setStatus(copy.announcementCanceled);
      setAnnouncements((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: "CANCELED" } : item,
        ),
      );
    } catch (cancelError) {
      setStatus(
        cancelError instanceof Error ? cancelError.message : copy.cancelFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  async function retry(id: string) {
    if (!requireElevatedSession()) return;
    const decision = await requestOperation({
      title: copy.retry,
      description: copy.retryReason,
      reasonLabel: copy.retryReason,
      confirmLabel: copy.retry,
      cancelLabel: t("common.cancel"),
    });
    if (!decision?.reason) return;
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(
        `/api/admin/notifications/dead-letters/${encodeURIComponent(id)}/retry`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ resolution: decision.reason }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(mutationError(response, body, copy.retryFailed));
      setStatus(copy.retryQueued);
      window.location.reload();
    } catch (retryError) {
      setStatus(
        retryError instanceof Error ? retryError.message : copy.retryFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireElevatedSession()) return;
    const formElement = event.currentTarget;
    setBusy(true);
    setStatus("");
    try {
      const form = new FormData(formElement);
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
          requiredVariables: String(form.get("requiredVariables") || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          mutationError(response, body, copy.templateCreateFailed),
        );
      setTemplates((current) => [body.template, ...current]);
      setStatus(copy.templateDraftCreated);
      formElement.reset();
    } catch (templateError) {
      setStatus(
        templateError instanceof Error
          ? templateError.message
          : copy.templateCreateFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  async function approveTemplate(id: string) {
    if (!requireElevatedSession()) return;
    const reasonLabel =
      locale === "tr"
        ? "Şablon onay gerekçesi (en az 5 karakter)"
        : "Template approval reason (at least 5 characters)";
    const decision = await requestOperation({
      title: copy.approve,
      description: reasonLabel,
      reasonLabel,
      confirmLabel: copy.approve,
      cancelLabel: t("common.cancel"),
    });
    if (!decision?.reason) return;
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(
        `/api/admin/notification-templates/${encodeURIComponent(id)}/approve`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: decision.reason }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          mutationError(response, body, copy.templateApproveFailed),
        );
      setTemplates((current) =>
        current.map((template) =>
          template.eventType === body.template.eventType &&
          template.channel === body.template.channel &&
          template.locale === body.template.locale
            ? {
                ...template,
                isActive: template.id === id,
                status: template.id === id ? "APPROVED" : template.status,
              }
            : template,
        ),
      );
      setStatus(copy.templateApproved);
    } catch (approveError) {
      setStatus(
        approveError instanceof Error
          ? approveError.message
          : copy.templateApproveFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  async function previewTemplate(template: NotificationTemplate) {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(
        "/api/admin/notification-templates/preview",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            subject: template.subject || undefined,
            title: template.title || undefined,
            body: template.body,
            requiredVariables: template.requiredVariables || [],
            variables: {},
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(t, body));
      await requestOperation({
        title: copy.preview,
        preview: {
          subject: body.preview.subject,
          title: body.preview.title,
          body: body.preview.body,
        },
        confirmLabel: t("common.close"),
        cancelLabel: t("common.cancel"),
        readOnly: true,
      });
    } catch (previewError) {
      setStatus(
        previewError instanceof Error
          ? previewError.message
          : copy.templatePreviewFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  async function testTemplate(id: string) {
    if (!requireElevatedSession()) return;
    const reasonLabel =
      locale === "tr"
        ? "Test gönderim gerekçesi (en az 5 karakter)"
        : "Test-delivery reason (at least 5 characters)";
    const decision = await requestOperation({
      title: copy.testSelf,
      description: copy.testConfirm,
      reasonLabel,
      confirmLabel: copy.testSelf,
      cancelLabel: t("common.cancel"),
    });
    if (!decision?.reason) return;
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(
        `/api/admin/notification-templates/${encodeURIComponent(id)}/test`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ variables: {}, reason: decision.reason }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(mutationError(response, body, copy.testFailed));
      setStatus(copy.testCompleted);
    } catch (testError) {
      setStatus(
        testError instanceof Error ? testError.message : copy.testFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {canManage ? (
        <section
          className={`rounded-xl border p-5 shadow-sm ${elevated ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              {elevated ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" />
              ) : (
                <LockKeyhole className="mt-0.5 size-5 shrink-0 text-amber-700" />
              )}
              <div>
                <h2 className="font-semibold text-slate-900">
                  {locale === "tr"
                    ? "Kritik operasyon koruması"
                    : "Critical operation protection"}
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  {elevated
                    ? locale === "tr"
                      ? "Duyuru, şablon ve yeniden deneme işlemleri kısa süreli olarak açıldı."
                      : "Announcement, template, and retry actions are temporarily unlocked."
                    : locale === "tr"
                      ? "Yayınlama ve veri değiştiren işlemler için yönetici parolanızla yeniden doğrulayın."
                      : "Re-authenticate with your administrator password for publishing and data-changing actions."}
                </p>
              </div>
            </div>
            {!elevated ? (
              <form
                onSubmit={unlockOperations}
                className="flex w-full gap-2 sm:w-auto"
              >
                <label className="min-w-0 flex-1">
                  <span className="sr-only">{t("auth.password")}</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={adminPassword}
                    onChange={(event) => setAdminPassword(event.target.value)}
                    placeholder={t("auth.password")}
                    className="min-h-11 w-full rounded-lg border bg-white px-3 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy || !adminPassword}
                  className="min-h-11 shrink-0 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {locale === "tr" ? "Doğrula" : "Verify"}
                </button>
              </form>
            ) : (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                {locale === "tr" ? "Doğrulandı" : "Verified"}
              </span>
            )}
          </div>
        </section>
      ) : (
        <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">
          {locale === "tr"
            ? "Bu rol bildirim operasyonlarını yalnızca görüntüleyebilir."
            : "This role can only view notification operations."}
        </p>
      )}
      {status ? (
        <p
          className="rounded-xl border bg-white p-4 text-sm text-slate-700"
          role="status"
          aria-live="polite"
        >
          {status}
        </p>
      ) : null}
      {loading ? (
        <p className="rounded-xl border bg-white p-4 text-sm text-slate-500">
          {t("common.loading")}
        </p>
      ) : null}
      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <Megaphone className="size-5 text-orange-500" />
          <div>
            <h2 className="font-semibold">{copy.platformAnnouncement}</h2>
            <p className="text-xs text-slate-500">
              {copy.platformAnnouncementDescription}
            </p>
          </div>
        </div>
        {canManage ? (
          <form onSubmit={dispatch} className="grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="mb-2 block text-xs font-medium text-slate-600">
                {copy.title}
              </span>
              <input
                name="title"
                required
                maxLength={160}
                className="w-full rounded-lg border px-3 py-3 text-sm"
              />
            </label>
            <label className="md:col-span-2">
              <span className="mb-2 block text-xs font-medium text-slate-600">
                {copy.message}
              </span>
              <textarea
                name="message"
                required
                maxLength={2000}
                rows={4}
                className="w-full resize-y rounded-lg border px-3 py-3 text-sm"
              />
            </label>
            <label>
              <span className="mb-2 block text-xs font-medium text-slate-600">
                {copy.deepLink}
              </span>
              <input
                name="deepLink"
                placeholder={copy.deepLinkExample}
                className="w-full rounded-lg border px-3 py-3 text-sm"
              />
            </label>
            <label>
              <span className="mb-2 block text-xs font-medium text-slate-600">
                {copy.locale}
              </span>
              <input
                name="locale"
                defaultValue="tr"
                required
                className="w-full rounded-lg border px-3 py-3 text-sm"
              />
            </label>
            <label>
              <span className="mb-2 block text-xs font-medium text-slate-600">
                {copy.priority}
              </span>
              <select
                name="priority"
                defaultValue="NORMAL"
                className="w-full rounded-lg border px-3 py-3 text-sm"
              >
                {Object.entries(copy.priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="md:col-span-2">
              <legend className="mb-2 text-xs font-medium text-slate-600">
                {copy.channels}
              </legend>
              <div className="flex flex-wrap gap-4 text-sm">
                {Object.entries(copy.channelLabels).map(([channel, label]) => (
                  <label key={channel} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="channels"
                      value={channel}
                      defaultChecked={
                        channel === "IN_APP" || channel === "ANDROID_PUSH"
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              <span className="mb-2 block text-xs font-medium text-slate-600">
                {copy.startTime}
              </span>
              <input
                type="datetime-local"
                name="startsAt"
                className="w-full rounded-lg border px-3 py-3 text-sm"
              />
            </label>
            <label>
              <span className="mb-2 block text-xs font-medium text-slate-600">
                {copy.endTime}
              </span>
              <input
                type="datetime-local"
                name="endsAt"
                className="w-full rounded-lg border px-3 py-3 text-sm"
              />
            </label>
            <div className="flex items-end">
              <button
                disabled={busy || !elevated}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                <Send className="size-4" />
                {copy.createDraft}
              </button>
            </div>
          </form>
        ) : null}
        <div className="mt-5 divide-y rounded-lg border">
          {announcements.slice(0, 20).map((announcement) => (
            <div
              key={announcement.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs"
            >
              <span>
                <strong>{announcement.title}</strong> / {announcement.status} /{" "}
                {announcement.channels
                  .map((channel) => copy.channelLabels[channel] ?? channel)
                  .join(", ")}{" "}
                / {announcement.locale}
              </span>
              {canManage ? (
                <div className="flex gap-2">
                  {announcement.status === "DRAFT" ? (
                    <button
                      type="button"
                      disabled={busy || !elevated}
                      onClick={() => void publishAnnouncement(announcement.id)}
                      className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-50"
                    >
                      {copy.previewAndPublish}
                    </button>
                  ) : null}
                  {!["CANCELED", "COMPLETED", "ARCHIVED"].includes(
                    announcement.status,
                  ) ? (
                    <button
                      type="button"
                      disabled={busy || !elevated}
                      onClick={() => void cancelAnnouncement(announcement.id)}
                      className="rounded-lg border px-3 py-2 font-semibold text-red-700 disabled:opacity-50"
                    >
                      {copy.cancel}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
          {!announcements.length ? (
            <p className="p-4 text-sm text-slate-500">{copy.noAnnouncements}</p>
          ) : null}
        </div>
      </section>

      <section className="min-w-0 max-w-full overflow-hidden rounded-lg border bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="font-semibold">{copy.unresolvedDeadLetters}</h2>
          <p className="text-xs text-slate-500">{copy.deadLetterDescription}</p>
        </div>
        <div className="min-w-0 w-full max-w-full overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th scope="col" className="py-3">
                  {copy.event}
                </th>
                <th scope="col">{copy.channel}</th>
                <th scope="col">{copy.error}</th>
                <th scope="col">{copy.attempts}</th>
                <th scope="col">{copy.date}</th>
                <th scope="col">
                  <span className="sr-only">{t("common.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {deadLetters.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-4 pe-4">{item.eventType}</td>
                  <td className="pe-4">{item.channel}</td>
                  <td className="pe-4 font-mono text-xs">{item.errorCode}</td>
                  <td className="pe-4">{item.attempts}</td>
                  <td className="pe-4">{item.createdAt}</td>
                  <td>
                    {canManage ? (
                      <button
                        type="button"
                        disabled={busy || !elevated}
                        onClick={() => void retry(item.id)}
                        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-60"
                      >
                        <RefreshCw className="size-3.5" />
                        {copy.retry}
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
        {!deadLetters.length ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {copy.noDeadLetters}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <Mail className="size-5 text-orange-500" />
          <div>
            <h2 className="font-semibold">{copy.versionedTemplates}</h2>
            <p className="text-xs text-slate-500">
              {copy.versionedTemplatesDescription}
            </p>
          </div>
        </div>
        {canManage ? (
          <form onSubmit={createTemplate} className="grid gap-3 md:grid-cols-2">
            <select
              name="eventType"
              required
              aria-label={copy.event}
              className="rounded-lg border px-3 py-3 text-sm"
            >
              {eventTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <select
              name="channel"
              required
              aria-label={copy.channel}
              className="rounded-lg border px-3 py-3 text-sm"
            >
              {Object.entries(copy.channelLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              name="locale"
              required
              defaultValue="tr"
              maxLength={8}
              className="rounded-lg border px-3 py-3 text-sm"
              aria-label={copy.locale}
            />
            <input
              name="name"
              required
              aria-label={copy.templateName}
              placeholder={copy.templateName}
              className="rounded-lg border px-3 py-3 text-sm"
            />
            <input
              name="title"
              aria-label={copy.title}
              placeholder={copy.title}
              className="rounded-lg border px-3 py-3 text-sm"
            />
            <input
              name="subject"
              aria-label={copy.emailSubject}
              placeholder={copy.emailSubject}
              className="rounded-lg border px-3 py-3 text-sm"
            />
            <textarea
              name="body"
              required
              aria-label={copy.templateBody}
              placeholder={copy.templateBody}
              rows={4}
              className="rounded-lg border px-3 py-3 text-sm md:col-span-2"
            />
            <input
              name="requiredVariables"
              aria-label={copy.requiredVariables}
              placeholder={copy.requiredVariables}
              className="rounded-lg border px-3 py-3 text-sm md:col-span-2"
            />
            <button
              disabled={busy || !elevated}
              className="rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white md:col-span-2 disabled:opacity-60"
            >
              {copy.createDraft}
            </button>
          </form>
        ) : null}
        <div className="mt-5 divide-y rounded-lg border">
          {templates.slice(0, 20).map((template) => (
            <div
              key={template.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs"
            >
              <span>
                <strong>{template.name}</strong> / {template.eventType} /{" "}
                {copy.channelLabels[template.channel] ?? template.channel}/
                {template.locale} / {copy.version} {template.version}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void previewTemplate(template)}
                  className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-60"
                >
                  {copy.preview}
                </button>
                {canManage ? (
                  <>
                    <button
                      type="button"
                      disabled={busy || !elevated}
                      onClick={() => void testTemplate(template.id)}
                      className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-60"
                    >
                      {copy.testSelf}
                    </button>
                    {template.isActive ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                        <CheckCircle2 className="size-3.5" />
                        {copy.active}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || !elevated}
                        onClick={() => void approveTemplate(template.id)}
                        className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-60"
                      >
                        {copy.approve}
                      </button>
                    )}
                  </>
                ) : template.isActive ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                    <CheckCircle2 className="size-3.5" />
                    {copy.active}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          {!templates.length ? (
            <p className="p-4 text-sm text-slate-500">{copy.noTemplates}</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="font-semibold">{copy.providerReadiness}</h2>
        <p className="mt-1 text-xs text-slate-500">
          {copy.providerReadinessDescription}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(providers?.providers ?? {}).map(
            ([name, provider]) => (
              <div key={name} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <strong className="capitalize text-sm">
                    {name.replace(/([A-Z])/g, " $1")}
                  </strong>
                  {provider.configured ? (
                    <CheckCircle2 className="size-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="size-4 text-amber-600" />
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  {provider.configured
                    ? locale === "tr"
                      ? "Yapılandırıldı"
                      : "Configured"
                    : locale === "tr"
                      ? "Hazır değil"
                      : "Not ready"}
                </p>
                {provider.provider ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {provider.provider}
                  </p>
                ) : null}
                {typeof provider.activeDevices === "number" ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {locale === "tr" ? "Aktif cihaz" : "Active devices"}:{" "}
                    {provider.activeDevices}
                  </p>
                ) : null}
                {provider.missingVariables?.length ? (
                  <p className="mt-2 break-words font-mono text-[10px] text-amber-700">
                    {provider.missingVariables.join(", ")}
                  </p>
                ) : null}
              </div>
            ),
          )}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          {locale === "tr"
            ? "Son 24 saat sağlayıcı web kancası"
            : "Provider webhooks in the last 24 hours"}
          : {providers?.recentWebhooks ?? 0}
        </p>
      </section>
      {operationDialog ? (
        <AdminOperationDialog
          dialog={operationDialog}
          locale={locale}
          confirmationMismatch={copy.confirmationMismatch}
          onResolve={resolveOperation}
        />
      ) : null}
    </div>
  );
}

function AdminOperationDialog({
  dialog,
  locale,
  confirmationMismatch,
  onResolve,
}: {
  dialog: OperationDialogState;
  locale: string;
  confirmationMismatch: string;
  onResolve: (value: OperationDialogValue | null) => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [secondConfirmation, setSecondConfirmation] = useState("");
  const [validationError, setValidationError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dialog.readOnly) {
      onResolve({});
      return;
    }
    if (dialog.reasonLabel && reason.trim().length < 5) {
      setValidationError(
        locale === "tr"
          ? "Gerekçe en az 5 karakter olmalıdır."
          : "The reason must contain at least 5 characters.",
      );
      return;
    }
    if (
      dialog.confirmationPhrase &&
      confirmation !== dialog.confirmationPhrase
    ) {
      setValidationError(confirmationMismatch);
      return;
    }
    if (
      dialog.secondConfirmationPhrase &&
      secondConfirmation !== dialog.secondConfirmationPhrase
    ) {
      setValidationError(confirmationMismatch);
      return;
    }
    onResolve({
      reason: reason.trim() || undefined,
      confirmation: confirmation || undefined,
      secondConfirmation: secondConfirmation || undefined,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onResolve(null);
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-operation-dialog-title"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === "Escape") onResolve(null);
        }}
      >
        <h2
          id="admin-operation-dialog-title"
          className="text-xl font-semibold text-slate-950"
        >
          {dialog.title}
        </h2>
        {dialog.description ? (
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {dialog.description}
          </p>
        ) : null}
        {dialog.summary?.length ? (
          <dl className="mt-4 grid gap-2 rounded-xl border bg-slate-50 p-4 text-sm sm:grid-cols-2">
            {dialog.summary.map((item) => (
              <div key={item.label}>
                <dt className="text-xs font-medium text-slate-500">
                  {item.label}
                </dt>
                <dd className="mt-0.5 break-words font-semibold text-slate-900">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {dialog.preview ? (
          <div className="mt-4 space-y-3 rounded-xl border bg-slate-50 p-4 text-sm text-slate-900">
            {dialog.preview.subject ? (
              <p>
                <span className="font-semibold">
                  {locale === "tr" ? "Konu" : "Subject"}:
                </span>{" "}
                {dialog.preview.subject}
              </p>
            ) : null}
            {dialog.preview.title ? (
              <p>
                <span className="font-semibold">
                  {locale === "tr" ? "Başlık" : "Title"}:
                </span>{" "}
                {dialog.preview.title}
              </p>
            ) : null}
            <p className="whitespace-pre-wrap break-words leading-6">
              {dialog.preview.body}
            </p>
          </div>
        ) : null}
        {dialog.confirmationPhrase ? (
          <label className="mt-4 block text-sm font-medium text-slate-800">
            {locale === "tr" ? "Aynen yazın" : "Type exactly"}:{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              {dialog.confirmationPhrase}
            </code>
            <input
              autoFocus={!dialog.reasonLabel}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-2 min-h-11 w-full rounded-lg border px-3 text-sm text-slate-950"
            />
          </label>
        ) : null}
        {dialog.secondConfirmationPhrase ? (
          <label className="mt-4 block text-sm font-medium text-slate-800">
            {locale === "tr"
              ? "Büyük hedef kitle onayı"
              : "Large-audience confirmation"}
            :{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              {dialog.secondConfirmationPhrase}
            </code>
            <input
              value={secondConfirmation}
              onChange={(event) => setSecondConfirmation(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-2 min-h-11 w-full rounded-lg border px-3 text-sm text-slate-950"
            />
          </label>
        ) : null}
        {dialog.reasonLabel ? (
          <label className="mt-4 block text-sm font-medium text-slate-800">
            {dialog.reasonLabel}
            <textarea
              autoFocus
              required
              minLength={5}
              maxLength={500}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-2 w-full rounded-lg border px-3 py-2 text-sm text-slate-950"
            />
          </label>
        ) : null}
        {validationError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            {validationError}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {!dialog.readOnly ? (
            <button
              type="button"
              onClick={() => onResolve(null)}
              className="min-h-11 rounded-lg border px-4 text-sm font-semibold text-slate-800"
            >
              {dialog.cancelLabel}
            </button>
          ) : null}
          <button
            type="submit"
            className={`min-h-11 rounded-lg px-4 text-sm font-semibold text-white ${dialog.destructive ? "bg-red-700" : "bg-slate-900"}`}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function notificationAdminCopy(t: (key: string) => string) {
  return {
    platformAnnouncement: t("notifications.admin.platformAnnouncement"),
    platformAnnouncementDescription: t(
      "notifications.admin.platformAnnouncementDescription",
    ),
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
    versionedTemplatesDescription: t(
      "notifications.admin.versionedTemplatesDescription",
    ),
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
    providerReadinessDescription: t(
      "notifications.admin.providerReadinessDescription",
    ),
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
