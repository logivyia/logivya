"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Lock, RefreshCw, Search, Send } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { apiErrorMessage } from "@/i18n/api-error";
import { intlLocale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import { countryRegistry } from "@/lib/international/country-registry";
import {
  getBrowserScheduleTimeZone,
  getQuickScheduleInput,
  normalizeNativeDateTimeInput,
  parseSmartScheduleDateTime
} from "@/lib/smart-schedule-date";
import { cn } from "@/lib/utils";
import {
  WebMessageAttachmentPicker,
  type WebMessageAttachment,
} from "@/components/web-message-attachment-picker";

type Group = { id: string; name: string; participantCount: number; canSend: boolean; account: { label: string } };
type Category = { id: string; name: string; _count: { groups: number; contacts: number }; groups?: Array<{ groupId: string }> };
type Contact = { id: string; phone: string; name: string | null; pushName: string | null; displayName?: string | null; accountId: string };
type ContactPageInfo = { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
type ContactResponse = {
  account?: { lastContactSyncAt?: string | null };
  contacts?: Contact[];
  pageInfo?: ContactPageInfo;
  syncRun?: { id: string; status: "QUEUED" | "RUNNING" | "PARTIAL" | "COMPLETED" | "FAILED" | "CANCELLED"; errorCode?: string | null } | null;
  message?: string;
  error?: string;
};
type Data = {
  groups: Group[];
  categories: Category[];
  entitlements?: { contactMessaging?: boolean; messageBrandingRequired?: boolean } | null;
};
type Mode = "SEND_NOW" | "SCHEDULED" | "RECURRING";

const card = "rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]";
const tab = "rounded-xl border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted-background";
const OUTBOUND_TEXT_LIMIT = 4096;
const STARTER_MESSAGE_LIMIT = OUTBOUND_TEXT_LIMIT - Math.max(...countryRegistry.map((country) => country.attribution.length)) - 2;

function contactDisplayName(contact: Contact) {
  for (const value of [contact.displayName, contact.name, contact.pushName]) {
    const candidate = value?.trim();
    if (!candidate) continue;
    const lower = candidate.toLowerCase();
    if (lower.endsWith("@s.whatsapp.net") || lower.endsWith("@lid") || lower.endsWith("@g.us")) continue;
    const candidateDigits = candidate.replace(/\D/g, "");
    if (/^[+\d\s().-]+$/.test(candidate) && candidateDigits.length >= 7) continue;
    if (candidateDigits && candidateDigits === contact.phone.replace(/\D/g, "")) continue;
    return candidate;
  }
  const digits = contact.phone.replace(/\D/g, "");
  return digits ? `+${digits}` : contact.phone;
}

function contactPhoneLabel(contact: Contact, displayName: string) {
  const digits = contact.phone.replace(/\D/g, "");
  if (!digits) return null;
  const displayDigits = displayName.replace(/\D/g, "");
  if (/^[+\d\s().-]+$/.test(displayName) && displayDigits === digits) return null;
  return `+${digits}`;
}

function formatCategoryAudience(category: Category, t: ReturnType<typeof useI18n>["t"]) {
  const groups = category._count.groups ?? 0;
  const contacts = category._count.contacts ?? 0;
  if (groups && contacts) return t("composer.groupContactCount", { groups, contacts });
  if (groups) return t("composer.groupCount", { count: groups });
  if (contacts) return t("composer.contactCount", { count: contacts });
  return t("composer.noAudience");
}

export function CampaignComposerPage() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<Data | null>(null);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = JSON.parse(localStorage.getItem("logivya.selectedGroupIds") || "[]");
      return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
    } catch {
      localStorage.removeItem("logivya.selectedGroupIds");
      return [];
    }
  });
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState("");
  const [contactPageInfo, setContactPageInfo] = useState<ContactPageInfo | null>(null);
  const contactRequestVersionRef = useRef(0);
  const contactLastSyncAtRef = useRef<string | null>(null);
  const [mode, setMode] = useState<Mode>("SEND_NOW");
  const [scheduledAt, setScheduledAt] = useState("");
  const [frequency, setFrequency] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("DAILY");
  const [interval, setIntervalValue] = useState(1);
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<WebMessageAttachment[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const scheduleTimeZone = useMemo(() => getBrowserScheduleTimeZone(), []);

  const scheduleState = useMemo(() => {
    if (mode !== "SCHEDULED" || !scheduledAt.trim()) return null;
    try {
      const parsed = parseSmartScheduleDateTime(scheduledAt, { timeZone: scheduleTimeZone });
      return { ok: true, message: t("composer.scheduledTime", { time: parsed.canonical, timeZone: parsed.timeZone }) };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? t(error.message) : t("composer.dateNotUnderstood") };
    }
  }, [mode, scheduledAt, scheduleTimeZone, t]);

  const loadPlatform = useCallback(() => {
    void fetch("/api/platform", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: Data) => {
        setData(result);
        if (result.entitlements?.contactMessaging) {
          const requestVersion = ++contactRequestVersionRef.current;
          setContactLoading(true);
          void fetch("/api/whatsapp/contacts?limit=100", { cache: "no-store" })
            .then((response) => response.json().then((body: ContactResponse) => ({ response, body })))
            .then(({ response, body }) => {
              if (!response.ok) throw new Error(apiErrorMessage(t, body, "composer.contactsLoadFailed"));
              if (requestVersion !== contactRequestVersionRef.current) return;
              setContacts(body.contacts ?? []);
              setContactPageInfo(body.pageInfo ?? null);
              contactLastSyncAtRef.current = body.account?.lastContactSyncAt ?? null;
            })
            .catch((error) => {
              if (requestVersion === contactRequestVersionRef.current) {
                setContactError(error instanceof Error ? error.message : t("composer.contactsLoadFailed"));
              }
            })
            .finally(() => {
              if (requestVersion === contactRequestVersionRef.current) setContactLoading(false);
            });
        } else {
          contactRequestVersionRef.current += 1;
          setContacts([]);
          setSelectedContacts([]);
          setContactPageInfo(null);
          contactLastSyncAtRef.current = null;
        }
      });
  }, [t]);

  useEffect(() => {
    loadPlatform();
    window.addEventListener("focus", loadPlatform);
    return () => window.removeEventListener("focus", loadPlatform);
  }, [loadPlatform]);

  useEffect(() => {
    if (!data?.entitlements?.contactMessaging) {
      contactRequestVersionRef.current += 1;
      return;
    }
    const requestVersion = ++contactRequestVersionRef.current;
    const timer = setTimeout(() => {
      setContactLoading(true);
      setContactError("");
      const query = new URLSearchParams({ limit: "100" });
      if (contactSearch.trim()) query.set("search", contactSearch.trim());
      void fetch(`/api/whatsapp/contacts?${query.toString()}`, { cache: "no-store" })
        .then((response) => response.json().then((body: ContactResponse) => ({ response, body })))
        .then(({ response, body }) => {
          if (!response.ok) throw new Error(apiErrorMessage(t, body, "composer.contactsLoadFailed"));
          if (requestVersion !== contactRequestVersionRef.current) return;
          setContacts(body.contacts ?? []);
          setContactPageInfo(body.pageInfo ?? null);
          contactLastSyncAtRef.current = body.account?.lastContactSyncAt ?? null;
        })
        .catch((error) => {
          if (requestVersion === contactRequestVersionRef.current) {
            setContactError(error instanceof Error ? error.message : t("composer.contactsLoadFailed"));
          }
        })
        .finally(() => {
          if (requestVersion === contactRequestVersionRef.current) setContactLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      if (requestVersion === contactRequestVersionRef.current) contactRequestVersionRef.current += 1;
    };
  }, [contactSearch, data?.entitlements?.contactMessaging, t]);

  const groups = useMemo(
    () => data?.groups.filter((group) => group.canSend && group.name.toLocaleLowerCase(intlLocale(locale)).includes(search.toLocaleLowerCase(intlLocale(locale)))) || [],
    [data, locale, search]
  );
  const sendableGroupCount = data?.groups.filter((group) => group.canSend).length ?? 0;
  const selectedCategoryNames = useMemo(
    () => data?.categories.filter((category) => selectedCategories.includes(category.id)).map((category) => category.name) ?? [],
    [data, selectedCategories]
  );
  const resolved = useMemo(
    () =>
      new Set([
        ...selected,
        ...(data?.categories
          .filter((category) => selectedCategories.includes(category.id))
          .flatMap((category) => category.groups?.map((item) => item.groupId) || []) || [])
      ]),
    [data, selected, selectedCategories]
  );
  const categoryContactCount = useMemo(
    () => data?.categories
      .filter((category) => selectedCategories.includes(category.id))
      .reduce((total, category) => total + (category._count.contacts ?? 0), 0) ?? 0,
    [data, selectedCategories],
  );
  const selectedTargetCount = resolved.size + selectedContacts.length + categoryContactCount;
  const targetTitle = selectedCategoryNames.length
    ? selectedCategoryNames.join(", ")
      : resolved.size && (selectedContacts.length || categoryContactCount)
      ? t("composer.selectedGroupsContacts")
      : resolved.size
        ? t("composer.selectedGroups")
        : selectedContacts.length || categoryContactCount
          ? t("composer.selectedContacts")
          : t("composer.noTargetSelected");
  const targetContent = selectedTargetCount
    ? t("composer.targetSummary", { total: selectedTargetCount, groups: resolved.size, contacts: selectedContacts.length + categoryContactCount })
    : t("composer.selectCategoryGroupContact");
  const messageLimit = data?.entitlements?.messageBrandingRequired ? STARTER_MESSAGE_LIMIT : OUTBOUND_TEXT_LIMIT;
  const messageTooLong = text.length > messageLimit;
  const canSubmit = Boolean(text.trim() || attachments.length) && !messageTooLong && !uploadingAttachments && !sending && selectedTargetCount > 0 && !(mode === "SCHEDULED" && !scheduledAt.trim());

  async function uploadAttachments(files: File[]) {
    setUploadingAttachments(true);
    setAttachmentError("");
    try {
      const uploaded: WebMessageAttachment[] = [];
      for (const file of files) {
        const response = await fetch("/api/media/upload", {
          method: "PUT",
          headers: {
            "content-type": file.type || "application/octet-stream",
            "x-file-name": encodeURIComponent(file.name),
            "x-file-size": String(file.size),
            "x-message-platform": "WHATSAPP",
          },
          body: file,
        });
        const result = await response.json() as {
          attachment?: { mediaFileId: string; fileName: string; mimeType: string; size: number; kind: WebMessageAttachment["kind"] };
          error?: string;
        };
        if (!response.ok || !result.attachment) {
          throw new Error(result.error || t("composer.uploadFailed"));
        }
        uploaded.push({
          id: result.attachment.mediaFileId,
          name: result.attachment.fileName,
          mimeType: result.attachment.mimeType,
          size: result.attachment.size,
          kind: result.attachment.kind,
        });
      }
      setAttachments((current) => [...current, ...uploaded]);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("composer.uploadFailed");
      setAttachmentError(message);
      throw error;
    } finally {
      setUploadingAttachments(false);
    }
  }

  async function refreshContacts() {
    const requestVersion = ++contactRequestVersionRef.current;
    const previousSyncAt = contactLastSyncAtRef.current;
    setContactLoading(true);
    setContactError("");
    try {
      const syncResponse = await fetch("/api/whatsapp/contacts/sync-current", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const syncResult = await syncResponse.json() as { syncRunId?: string; message?: string; error?: string };
      if (!syncResponse.ok) throw new Error(syncResult.message || syncResult.error);
      let result: ContactResponse = {};
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const response = await fetch("/api/whatsapp/contacts?limit=100", { cache: "no-store" });
        result = await response.json() as ContactResponse;
        if (!response.ok) throw new Error(apiErrorMessage(t, result, "contacts.loadFailed"));
        if (requestVersion !== contactRequestVersionRef.current) return;
        const currentSyncAt = result.account?.lastContactSyncAt ?? null;
        if (syncResult.syncRunId && result.syncRun?.id === syncResult.syncRunId && ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(result.syncRun.status)) {
          if (result.syncRun.status === "FAILED") throw new Error(t("composer.contactsRefreshFailed"));
          break;
        }
        if (currentSyncAt && currentSyncAt !== previousSyncAt) {
          contactLastSyncAtRef.current = currentSyncAt;
          break;
        }
      }
      if (requestVersion !== contactRequestVersionRef.current) return;
      setContacts(result.contacts ?? []);
      setContactPageInfo(result.pageInfo ?? null);
      contactLastSyncAtRef.current = result.account?.lastContactSyncAt ?? null;
    } catch (error) {
      if (requestVersion === contactRequestVersionRef.current) {
        setContactError(error instanceof Error ? error.message : t("composer.contactsRefreshFailed"));
      }
    } finally {
      if (requestVersion === contactRequestVersionRef.current) setContactLoading(false);
    }
  }

  async function loadMoreContacts() {
    if (!contactPageInfo?.hasMore || contactLoading) return;
    const requestVersion = contactRequestVersionRef.current;
    setContactLoading(true);
    setContactError("");
    try {
      const query = new URLSearchParams({ page: String(contactPageInfo.page + 1), limit: String(contactPageInfo.limit) });
      if (contactSearch.trim()) query.set("search", contactSearch.trim());
      const response = await fetch(`/api/whatsapp/contacts?${query.toString()}`, { cache: "no-store" });
      const result = await response.json() as ContactResponse;
      if (!response.ok) throw new Error(apiErrorMessage(t, result, "contacts.loadFailed"));
      if (requestVersion !== contactRequestVersionRef.current) return;
      setContacts((current) => {
        const byId = new Map(current.map((contact) => [contact.id, contact]));
        for (const contact of (result.contacts ?? []) as Contact[]) byId.set(contact.id, contact);
        return [...byId.values()];
      });
      setContactPageInfo(result.pageInfo ?? null);
      contactLastSyncAtRef.current = result.account?.lastContactSyncAt ?? null;
    } catch (error) {
      if (requestVersion === contactRequestVersionRef.current) {
        setContactError(error instanceof Error ? error.message : t("composer.contactsLoadFailed"));
      }
    } finally {
      if (requestVersion === contactRequestVersionRef.current) setContactLoading(false);
    }
  }

  const displayableContacts = useMemo(() => contacts.flatMap((contact) => {
    const displayName = contactDisplayName(contact);
    return displayName ? [{ contact, displayName }] : [];
  }), [contacts]);

  function toggleVisibleContacts() {
    const visibleIds = displayableContacts.map(({ contact }) => contact.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedContacts.includes(id));
    setSelectedContacts((current) => allVisibleSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])]);
  }

  async function send() {
    if (text.length > messageLimit) {
      setStatus(t("composer.attributionLengthExceeded", { max: messageLimit }));
      return;
    }
    setSending(true);
    setStatus("");
    if (mode === "SCHEDULED" && scheduleState?.ok === false) {
      setSending(false);
      setStatus(scheduleState.message);
      return;
    }
    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: text.trim().slice(0, 60) || attachments[0]?.name.slice(0, 60) || t("composer.attachmentCampaign"),
        content: text,
        mediaFileIds: attachments.map((attachment) => attachment.id),
        groupIds: selected,
        categoryIds: selectedCategories,
        contactIds: selectedContacts,
        scheduleType: mode,
        scheduledAt: mode === "SCHEDULED" ? scheduledAt.trim() : undefined,
        scheduledTimeZone: scheduleTimeZone,
        recurringRule: mode === "RECURRING" ? { frequency, interval } : undefined
      })
    });
    const result = await response.json();
    setSending(false);
    if (!response.ok) {
      setStatus(apiErrorMessage(t, result));
      return;
    }
    setStatus(t("composer.queued"));
    setText("");
    setSelected([]);
    setSelectedCategories([]);
    setSelectedContacts([]);
    setAttachments([]);
    setAttachmentError("");
    localStorage.removeItem("logivya.selectedGroupIds");
  }

  if (!data) {
    return (
      <div className="grid min-h-52 place-items-center">
        <LoaderCircle className="size-7 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-orange-500">{t("composer.eyebrow")}</p>
        <h1 className="mt-2 text-3xl font-semibold">{t("nav.sendMessage")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{t("composer.description")}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label={t("composer.selectedAudience")} value={selectedTargetCount} />
        <SummaryCard label={t("composer.sendableGroups")} value={sendableGroupCount} />
        <SummaryCard label={t("common.category")} value={data.categories.length} />
        <SummaryCard label={t("composer.selectedContactCount")} value={selectedContacts.length} />
      </div>

      <div className="mt-6 grid gap-6">
        <section className={card}>
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-semibold">{t("composer.write")}</h2>
            <span className={cn("text-xs text-muted", messageTooLong && "font-semibold text-rose-600")}>{text.length}/{messageLimit}</span>
          </div>
          <textarea
            maxLength={messageLimit}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("composer.placeholder")}
            className="mt-4 min-h-64 w-full rounded-xl border bg-input p-4 text-sm text-input-foreground outline-none focus:border-primary"
          />
          <WebMessageAttachmentPicker
            className="mt-4"
            attachments={attachments}
            onUpload={uploadAttachments}
            onRemove={(id) => {
              setAttachments((current) => current.filter((attachment) => attachment.id !== id));
              setAttachmentError("");
            }}
            uploading={uploadingAttachments}
            error={attachmentError || null}
            disabled={sending}
            maxFiles={30}
            onValidationError={setAttachmentError}
            labels={{
              trigger: t("composer.addMedia"),
              title: t("composer.addMedia"),
              description: t("composer.attachmentDescription"),
              photo: t("composer.photo"),
              video: t("composer.video"),
              document: t("composer.document"),
              close: t("common.close"),
              remove: t("composer.removeAttachment"),
              selected: t("composer.selectedAttachments"),
              limitReached: t("composer.attachmentLimit"),
              invalidType: t("composer.attachmentInvalidType"),
            }}
          />
          {data.entitlements?.messageBrandingRequired ? (
            <p className="mt-3 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs leading-5 text-foreground">
              {t("accounts.starterAttributionNotice")}
            </p>
          ) : null}
          {messageTooLong ? (
            <p className="mt-3 text-xs font-semibold text-rose-600">{t("composer.attributionLengthExceeded", { max: messageLimit })}</p>
          ) : null}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(["SEND_NOW", "SCHEDULED", "RECURRING"] as Mode[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(tab, mode === value && "border-primary bg-accent font-semibold text-accent-foreground")}
              >
                {value === "SEND_NOW" ? t("composer.sendNow") : value === "SCHEDULED" ? t("composer.schedule") : t("composer.recurring")}
              </button>
            ))}
          </div>

          {mode === "SCHEDULED" ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {(["today", "tomorrow", "nextMonday", "nextWeek"] as const).map((action) => (
                  <button key={action} type="button" onClick={() => setScheduledAt(getQuickScheduleInput(action, { timeZone: scheduleTimeZone }))} className={tab}>
                    {t(`composer.quick.${action}`)}
                  </button>
                ))}
                <label className={cn(tab, "cursor-pointer")}>
                  <span>{t("composer.selectDate")}</span>
                  <input className="sr-only" type="datetime-local" onChange={(event) => setScheduledAt(normalizeNativeDateTimeInput(event.target.value))} />
                </label>
              </div>
              <input
                className="w-full rounded-xl border bg-input px-3 py-3 text-sm text-input-foreground"
                type="text"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                placeholder={t("composer.dateTimePlaceholder")}
              />
              {scheduleState ? <p className={cn("text-xs font-medium", scheduleState.ok ? "text-success" : "text-danger")}>{scheduleState.message}</p> : null}
            </div>
          ) : null}

          {mode === "RECURRING" ? (
            <div className="mt-4 flex gap-2">
              <select className="flex-1 rounded-xl border bg-input px-3 py-3 text-sm text-input-foreground" value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)}>
                <option value="DAILY">{t("composer.daily")}</option>
                <option value="WEEKLY">{t("composer.weekly")}</option>
                <option value="MONTHLY">{t("composer.monthly")}</option>
              </select>
              <input
                aria-label={t("composer.interval")}
                min={1}
                max={365}
                type="number"
                className="w-24 rounded-xl border bg-input px-3 py-3 text-sm text-input-foreground"
                value={interval}
                onChange={(event) => setIntervalValue(Number(event.target.value))}
              />
            </div>
          ) : null}

          <div className="mt-5 rounded-xl border bg-accent p-4 text-accent-foreground">
            <p className="text-xs font-semibold">{t("composer.targetLabel")}: {targetTitle}</p>
            <p className="mt-2 text-sm leading-6">{t("composer.contentLabel")}: {targetContent}</p>
          </div>
          <button
            disabled={sending || !canSubmit}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
            onClick={() => void send()}
          >
            {sending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
            {t("composer.reviewSend")}
          </button>
          {status ? <p className="mt-3 rounded-xl border p-3 text-sm">{status}</p> : null}
        </section>

        <section className={card}>
          <h2 className="font-semibold">{t("composer.selectAudiences")}</h2>
          <label className="mt-4 flex items-center gap-2 rounded-xl border bg-input px-3 text-input-foreground">
            <Search className="size-4 text-muted" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("composer.search")} className="w-full bg-transparent py-3 text-sm outline-none" />
          </label>

          <p className="mt-5 text-xs font-semibold uppercase text-muted">{t("nav.categories")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {data.categories.map((category) => (
              <label key={category.id} className={cn("flex items-center gap-2 rounded-xl border p-3 text-sm", selectedCategories.includes(category.id) && "border-primary bg-accent text-accent-foreground")}>
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(category.id)}
                  onChange={(event) => setSelectedCategories((value) => (event.target.checked ? [...value, category.id] : value.filter((id) => id !== category.id)))}
                />
                <b>{category.name}</b>
                <span className="ms-auto text-muted">{formatCategoryAudience(category, t)}</span>
              </label>
            ))}
          </div>

          <p className="mt-5 text-xs font-semibold uppercase text-muted">{t("common.groups")}</p>
          <label className="mt-3 flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={groups.length > 0 && groups.every((group) => selected.includes(group.id))}
              onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, ...groups.map((group) => group.id)])] : selected.filter((id) => !groups.some((group) => group.id === id)))}
            />
            {t("composer.selectVisible")}
          </label>
          <div className="mt-3 grid max-h-[520px] gap-2 overflow-auto md:grid-cols-2">
            {groups.map((group) => (
              <label key={group.id} className={cn("flex items-center gap-3 rounded-xl border p-3 text-sm", resolved.has(group.id) && "border-primary bg-accent text-accent-foreground")}>
                <input
                  type="checkbox"
                  checked={selected.includes(group.id)}
                  onChange={(event) => setSelected((value) => (event.target.checked ? [...new Set([...value, group.id])] : value.filter((id) => id !== group.id)))}
                />
                <span>
                  <b className="block">{group.name}</b>
                  <small className="text-muted">
                    {group.account.label} · {t("composer.memberCount", { count: group.participantCount })}
                  </small>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-7 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase text-muted">{t("common.contacts")}</p>
            {data.entitlements?.contactMessaging ? (
              <button type="button" disabled={contactLoading} onClick={() => void refreshContacts()} className={cn(tab, "inline-flex items-center gap-2 disabled:opacity-50")}>
                <RefreshCw className={cn("size-4", contactLoading && "animate-spin")} />
                {t("composer.refreshContacts")}
              </button>
            ) : null}
          </div>
          {!data.entitlements?.contactMessaging ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl border bg-accent p-4 text-sm text-accent-foreground">
              <Lock className="size-5 text-primary" />
              <span>{t("composer.contactMessagingProfessional")}</span>
            </div>
          ) : (
            <>
              <label className="mt-3 flex items-center gap-2 rounded-xl border bg-input px-3 text-input-foreground">
                <Search className="size-4 text-muted" />
                <input value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} placeholder={t("composer.searchContacts")} className="w-full bg-transparent py-3 text-sm outline-none" />
              </label>
              <label className="mt-3 flex items-center gap-3 rounded-xl border p-3 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={displayableContacts.length > 0 && displayableContacts.every(({ contact }) => selectedContacts.includes(contact.id))}
                  onChange={toggleVisibleContacts}
                />
                {t("composer.selectVisibleContacts")}
                <span className="ms-auto text-muted">{t("composer.selectedCount", { count: selectedContacts.length })}</span>
              </label>
              {contactError ? <p className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-danger">{contactError}</p> : null}
              {!displayableContacts.length && contactLoading ? <div className="mt-3 flex items-center gap-2 text-sm text-muted"><LoaderCircle className="size-4 animate-spin" />{t("composer.contactsLoading")}</div> : displayableContacts.length ? (
                <div className="mt-3 grid max-h-[520px] gap-2 overflow-auto md:grid-cols-2">
                  {displayableContacts.map(({ contact, displayName }) => (
                    <label key={contact.id} className={cn("flex items-center gap-3 rounded-xl border p-3 text-sm", selectedContacts.includes(contact.id) && "border-primary bg-accent text-accent-foreground")}>
                      <input
                        type="checkbox"
                        checked={selectedContacts.includes(contact.id)}
                        onChange={(event) => setSelectedContacts((value) => event.target.checked ? [...new Set([...value, contact.id])] : value.filter((id) => id !== contact.id))}
                      />
                      <span className="min-w-0"><b className="block truncate">{displayName}</b>{contactPhoneLabel(contact, displayName) ? <small className="text-muted">{contactPhoneLabel(contact, displayName)}</small> : null}</span>
                    </label>
                  ))}
                </div>
              ) : <p className="mt-3 rounded-xl border p-4 text-sm text-muted">{t("composer.noContacts")}</p>}
              {contactPageInfo?.hasMore ? (
                <button type="button" disabled={contactLoading} onClick={() => void loadMoreContacts()} className={cn(tab, "mt-3 w-full disabled:opacity-50")}>
                  {contactLoading ? t("common.loading") : t("composer.loadMoreContacts")}
                </button>
              ) : null}
              <p className="mt-3 text-xs leading-5 text-muted">{t("composer.permissionNotice")}</p>
            </>
          )}
        </section>
      </div>
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  const { locale } = useI18n();
  return (
    <div className={card}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold">{formatNumber(value, locale)}</p>
    </div>
  );
}
