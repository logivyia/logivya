import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";

import {
  getAdminModuleData,
  getAdminModuleDefinition,
  getAdminSupportTicket,
  getAdminSupportTickets,
  replyAdminSupportTicket,
  updateAdminSupportTicketPriority,
  updateAdminSupportTicketStatus,
  type AdminSupportTicket
} from "@/api/mobileAdmin";
import { createSupportOperationId } from "@/api/mobileSupport";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { Badge, PageHeader, SectionTitle, StatCard, SurfaceCard } from "@/components/ui";
import { Screen } from "@/components/screen";
import { adminModuleTranslationKeys } from "@/i18n/admin-modules";
import { formatDateTime } from "@/i18n/format";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { ProfileStackParamList } from "@/types/navigation";

type PlatformModuleRoute = RouteProp<ProfileStackParamList, "PlatformModule">;
type Row = { id: string; title: string; subtitle?: string; meta?: string };
type Stat = { label: string; value: string | number };
const SUPPORT_ADMIN_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_FOR_ADMIN", "WAITING_FOR_USER", "RESOLVED", "CLOSED"] as const;
const SUPPORT_ADMIN_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export function PlatformModuleScreen() {
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const { params } = useRoute<PlatformModuleRoute>();
  const definition = getAdminModuleDefinition(params.moduleKey);
  const moduleTranslation = adminModuleTranslationKeys[params.moduleKey];
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supportTicket, setSupportTicket] = useState<AdminSupportTicket | null>(null);
  const [supportReply, setSupportReply] = useState("");
  const [supportReplyOperation, setSupportReplyOperation] = useState<{ body: string; id: string } | null>(null);
  const [supportStatus, setSupportStatus] = useState("OPEN");
  const [supportPriority, setSupportPriority] = useState("NORMAL");
  const [supportSearch, setSupportSearch] = useState("");
  const [supportStatusFilter, setSupportStatusFilter] = useState("ALL");
  const [supportPriorityFilter, setSupportPriorityFilter] = useState("ALL");
  const [supportUnreadOnly, setSupportUnreadOnly] = useState(false);
  const [supportNextCursor, setSupportNextCursor] = useState<string | null>(null);
  const [supportHasMore, setSupportHasMore] = useState(false);
  const [supportMessageNextCursor, setSupportMessageNextCursor] = useState<string | null>(null);
  const [supportHasOlderMessages, setSupportHasOlderMessages] = useState(false);
  const [supportInternalNote, setSupportInternalNote] = useState(false);
  const [supportSaving, setSupportSaving] = useState(false);
  const [supportNotice, setSupportNotice] = useState<string | null>(null);
  const isSupportModule = params.moduleKey === "support";

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    setError(null);
    try {
      const result = await withTimeout(
        isSupportModule
          ? getAdminSupportTickets({
              ...(supportSearch.trim() ? { search: supportSearch.trim() } : {}),
              status: supportStatusFilter,
              priority: supportPriorityFilter,
              unreadOnly: supportUnreadOnly,
            })
          : getAdminModuleData(definition),
        12000,
        t("requestTimedOut"),
      );
      setData(result);
      if (isSupportModule && isRecord(result.pageInfo)) {
        setSupportNextCursor(readString(result.pageInfo, "nextCursor") ?? null);
        setSupportHasMore(result.pageInfo.hasMore === true);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("dataUnavailable"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [definition, isSupportModule, supportPriorityFilter, supportSearch, supportStatusFilter, supportUnreadOnly, t]);

  const openSupportTicket = useCallback(async (id: string) => {
    if (!isSupportModule) return;
    setSupportSaving(true);
    setSupportNotice(null);
    setError(null);
    try {
      const result = await getAdminSupportTicket(id);
      setSupportTicket(result.ticket);
      setSupportMessageNextCursor(result.pageInfo.nextCursor);
      setSupportHasOlderMessages(result.pageInfo.hasMore);
      setSupportStatus(result.ticket.status);
      setSupportPriority(result.ticket.priority || "NORMAL");
      setSupportReply("");
      setSupportReplyOperation(null);
      setSupportInternalNote(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("supportTicketOpenFailed"));
    } finally {
      setSupportSaving(false);
    }
  }, [isSupportModule, t]);

  const loadOlderSupportMessages = useCallback(async () => {
    if (!supportTicket || !supportMessageNextCursor || !supportHasOlderMessages || supportSaving) return;
    setSupportSaving(true);
    setError(null);
    try {
      const result = await getAdminSupportTicket(supportTicket.publicId || supportTicket.id, supportMessageNextCursor);
      setSupportTicket((current) => current ? { ...current, messages: [...result.messages, ...(current.messages ?? [])] } : result.ticket);
      setSupportMessageNextCursor(result.pageInfo.nextCursor);
      setSupportHasOlderMessages(result.pageInfo.hasMore);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("supportTicketOpenFailed"));
    } finally {
      setSupportSaving(false);
    }
  }, [supportHasOlderMessages, supportMessageNextCursor, supportSaving, supportTicket, t]);

  const sendSupportReply = useCallback(async () => {
    if (!supportTicket || !supportReply.trim() || supportSaving) return;
    setSupportSaving(true);
    setSupportNotice(null);
    setError(null);
    try {
      const body = supportReply.trim();
      const operation = supportReplyOperation?.body === body
        ? supportReplyOperation
        : { body, id: createSupportOperationId("admin-reply") };
      setSupportReplyOperation(operation);
      await replyAdminSupportTicket(supportTicket.publicId || supportTicket.id, {
        message: body,
        clientMessageId: operation.id,
        internalNote: supportInternalNote,
      });
      setSupportReply("");
      setSupportReplyOperation(null);
      setSupportNotice(t("replySent"));
      await Promise.all([openSupportTicket(supportTicket.publicId || supportTicket.id), load("refresh")]);
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : t("replyFailed"));
    } finally {
      setSupportSaving(false);
    }
  }, [load, openSupportTicket, supportInternalNote, supportReply, supportReplyOperation, supportSaving, supportTicket, t]);

  const saveSupportStatus = useCallback(async () => {
    if (!supportTicket || supportStatus === supportTicket.status || supportSaving) return;
    setSupportSaving(true);
    setSupportNotice(null);
    setError(null);
    try {
      await updateAdminSupportTicketStatus(supportTicket.publicId || supportTicket.id, supportStatus);
      setSupportNotice(t("ticketStatusUpdated"));
      await Promise.all([openSupportTicket(supportTicket.publicId || supportTicket.id), load("refresh")]);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : t("ticketStatusUpdateFailed"));
    } finally {
      setSupportSaving(false);
    }
  }, [load, openSupportTicket, supportSaving, supportStatus, supportTicket, t]);

  const saveSupportPriority = useCallback(async () => {
    if (!supportTicket || supportPriority === supportTicket.priority || supportSaving) return;
    setSupportSaving(true);
    setSupportNotice(null);
    setError(null);
    try {
      await updateAdminSupportTicketPriority(supportTicket.publicId || supportTicket.id, supportPriority);
      setSupportNotice(t("ticketStatusUpdated"));
      await Promise.all([openSupportTicket(supportTicket.publicId || supportTicket.id), load("refresh")]);
    } catch (priorityError) {
      setError(priorityError instanceof Error ? priorityError.message : t("ticketStatusUpdateFailed"));
    } finally {
      setSupportSaving(false);
    }
  }, [load, openSupportTicket, supportPriority, supportSaving, supportTicket, t]);

  const loadMoreSupport = useCallback(async () => {
    if (!isSupportModule || !supportHasMore || !supportNextCursor || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const result = await getAdminSupportTickets({
        cursor: supportNextCursor,
        ...(supportSearch.trim() ? { search: supportSearch.trim() } : {}),
        status: supportStatusFilter,
        priority: supportPriorityFilter,
        unreadOnly: supportUnreadOnly,
      });
      setData((current) => ({
        ...(current ?? {}),
        ...result,
        tickets: [
          ...(Array.isArray(current?.tickets) ? current.tickets : []),
          ...result.tickets,
        ],
      }));
      setSupportNextCursor(result.pageInfo.nextCursor);
      setSupportHasMore(result.pageInfo.hasMore);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("dataUnavailable"));
    } finally {
      setRefreshing(false);
    }
  }, [isSupportModule, refreshing, supportHasMore, supportNextCursor, supportPriorityFilter, supportSearch, supportStatusFilter, supportUnreadOnly, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
      if (isSupportModule && params.ticketId) void openSupportTicket(params.ticketId);
    }, [isSupportModule, load, openSupportTicket, params.ticketId])
  );

  const stats = useMemo(() => extractStats(data), [data]);
  const rows = useMemo(() => extractRows(data, t), [data, t]);

  return (
    <Screen style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          eyebrow={params.eyebrow ?? t("adminSections")}
          title={params.title ?? t(moduleTranslation.title)}
          description={params.description ?? t(moduleTranslation.description)}
          right={<Badge label={definition.coverage === "live" ? t("liveApi") : t("summaryApi")} tone={definition.coverage === "live" ? "success" : "warning"} />}
        />

        {isSupportModule ? (
          <View style={styles.supportFilters}>
            <TextInput
              value={supportSearch}
              onChangeText={setSupportSearch}
              onSubmitEditing={() => void load("refresh")}
              placeholder={t("search")}
              placeholderTextColor={theme.muted}
              style={[styles.filterInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
              {["ALL", ...SUPPORT_ADMIN_STATUSES].map((item) => {
                const active = supportStatusFilter === item;
                return (
                  <Pressable key={item} onPress={() => setSupportStatusFilter(item)} style={[styles.statusChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.card }]}>
                    <Text style={[styles.statusChipText, { color: active ? theme.primaryText : theme.text }]}>{item === "ALL" ? t("all") : supportStatusLabel(item, t)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
              {["ALL", ...SUPPORT_ADMIN_PRIORITIES].map((item) => {
                const active = supportPriorityFilter === item;
                return (
                  <Pressable key={item} onPress={() => setSupportPriorityFilter(item)} style={[styles.statusChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.card }]}>
                    <Text style={[styles.statusChipText, { color: active ? theme.primaryText : theme.text }]}>{item === "ALL" ? t("all") : item}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => setSupportUnreadOnly((value) => !value)} style={[styles.statusChip, { alignSelf: "flex-start", borderColor: supportUnreadOnly ? theme.primary : theme.border, backgroundColor: supportUnreadOnly ? theme.primary : theme.card }]}>
              <Text style={[styles.statusChipText, { color: supportUnreadOnly ? theme.primaryText : theme.text }]}>{t("unreadReplies")}</Text>
            </Pressable>
          </View>
        ) : null}

        {loading && !data ? (
          <SurfaceCard style={styles.sourceCard}>
            <Text style={[styles.sourceTitle, { color: theme.text }]}>{t("dataPreparing")}</Text>
            <Text style={[styles.sourceText, { color: theme.muted }]}>{t("moduleLoadingDescription")}</Text>
          </SurfaceCard>
        ) : null}

        {stats.length ? (
          <View style={styles.statsGrid}>
            {stats.map((stat) => (
              <StatCard key={stat.label} icon="analytics-outline" label={stat.label} value={stat.value} />
            ))}
          </View>
        ) : null}

        <SurfaceCard style={styles.sourceCard}>
          <Text style={[styles.sourceTitle, { color: theme.text }]}>{t("dataSource")}</Text>
          <Text style={[styles.sourceText, { color: theme.muted }]}>
            {definition.endpoint ? definition.endpoint : t("endpointUnavailable")}
          </Text>
        </SurfaceCard>

        {error ? <ErrorState title={error} onRetry={() => void load()} /> : null}

        <SectionTitle title={t("records")} />
        {rows.length ? (
          <View style={styles.rows}>
            {rows.map((row) => (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                onPress={isSupportModule ? () => void openSupportTicket(row.id) : undefined}
                style={[styles.rowCard, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={2}>
                    {row.title}
                  </Text>
                  {row.subtitle ? (
                    <Text style={[styles.rowSubtitle, { color: theme.muted }]} numberOfLines={2}>
                      {row.subtitle}
                    </Text>
                  ) : null}
                </View>
                {row.meta ? <Badge label={row.meta} tone="default" /> : null}
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyState title={t("noRecords")} description={t("noModuleRecordsDescription")} />
        )}

        {isSupportModule && supportHasMore ? (
          <Pressable accessibilityRole="button" disabled={refreshing} onPress={() => void loadMoreSupport()} style={[styles.actionButton, { backgroundColor: theme.primary, opacity: refreshing ? 0.55 : 1 }]}>
            <Text style={[styles.actionButtonText, { color: theme.primaryText }]}>{t("loadMore")}</Text>
          </Pressable>
        ) : null}

        {isSupportModule && supportTicket ? (
          <SupportTicketAdminPanel
            ticket={supportTicket}
            status={supportStatus}
            priority={supportPriority}
            reply={supportReply}
            internalNote={supportInternalNote}
            saving={supportSaving}
            notice={supportNotice}
            hasOlderMessages={supportHasOlderMessages}
            onStatusChange={setSupportStatus}
            onPriorityChange={setSupportPriority}
            onReplyChange={(value) => {
              setSupportReply(value);
              if (supportReplyOperation?.body !== value.trim()) setSupportReplyOperation(null);
            }}
            onInternalNoteChange={setSupportInternalNote}
            onSendReply={() => void sendSupportReply()}
            onSaveStatus={() => void saveSupportStatus()}
            onSavePriority={() => void saveSupportPriority()}
            onLoadOlderMessages={() => void loadOlderSupportMessages()}
            locale={locale}
            t={t}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function SupportTicketAdminPanel({
  ticket,
  status,
  priority,
  reply,
  internalNote,
  saving,
  notice,
  hasOlderMessages,
  onStatusChange,
  onPriorityChange,
  onReplyChange,
  onInternalNoteChange,
  onSendReply,
  onSaveStatus,
  onSavePriority,
  onLoadOlderMessages,
  locale,
  t,
}: {
  ticket: AdminSupportTicket;
  status: string;
  priority: string;
  reply: string;
  internalNote: boolean;
  saving: boolean;
  notice: string | null;
  hasOlderMessages: boolean;
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
  onReplyChange: (reply: string) => void;
  onInternalNoteChange: (value: boolean) => void;
  onSendReply: () => void;
  onSaveStatus: () => void;
  onSavePriority: () => void;
  onLoadOlderMessages: () => void;
  locale: ReturnType<typeof useTranslation>["locale"];
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const theme = useTheme();
  return (
    <SurfaceCard style={styles.supportPanel}>
      <Text style={[styles.sourceTitle, { color: theme.text }]}>{ticket.title || ticket.subject}</Text>
      <Text style={[styles.sourceText, { color: theme.primary }]}>{ticket.publicId || ticket.id}</Text>
      <Text style={[styles.sourceText, { color: theme.muted }]}>
        {(ticket.createdBy?.email || "-") + " - " + (ticket.company?.name || "-")}
      </Text>
      {notice ? <Text style={[styles.notice, { color: theme.success, backgroundColor: theme.successSoft }]}>{notice}</Text> : null}

      <View style={styles.statusRow}>
        {SUPPORT_ADMIN_STATUSES.map((item) => {
          const active = status === item;
          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              onPress={() => onStatusChange(item)}
              style={[styles.statusChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.card }]}
            >
              <Text style={[styles.statusChipText, { color: active ? theme.primaryText : theme.text }]}>{supportStatusLabel(item, t)}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable accessibilityRole="button" disabled={saving || status === ticket.status} onPress={onSaveStatus} style={[styles.actionButton, { backgroundColor: theme.primary, opacity: saving || status === ticket.status ? 0.55 : 1 }]}>
        <Text style={[styles.actionButtonText, { color: theme.primaryText }]}>{t("updateStatus")}</Text>
      </Pressable>

      <Text style={[styles.messageRole, { color: theme.muted }]}>{t("priority")}</Text>
      <View style={styles.statusRow}>
        {SUPPORT_ADMIN_PRIORITIES.map((item) => {
          const active = priority === item;
          return (
            <Pressable key={item} accessibilityRole="button" onPress={() => onPriorityChange(item)} style={[styles.statusChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.card }]}>
              <Text style={[styles.statusChipText, { color: active ? theme.primaryText : theme.text }]}>{item}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable accessibilityRole="button" disabled={saving || priority === ticket.priority} onPress={onSavePriority} style={[styles.actionButton, { backgroundColor: theme.primary, opacity: saving || priority === ticket.priority ? 0.55 : 1 }]}>
        <Text style={[styles.actionButtonText, { color: theme.primaryText }]}>{t("updatePriority")}</Text>
      </Pressable>

      <View style={styles.thread}>
        {hasOlderMessages ? (
          <Pressable accessibilityRole="button" disabled={saving} onPress={onLoadOlderMessages} style={[styles.actionButton, { backgroundColor: theme.badge, opacity: saving ? 0.55 : 1 }]}>
            <Text style={[styles.actionButtonText, { color: theme.text }]}>{t("loadOlderMessages")}</Text>
          </Pressable>
        ) : null}
        {(ticket.messages || []).map((message) => (
          <View key={message.id} style={[styles.messageBubble, { borderColor: theme.border, backgroundColor: message.senderType === "ADMIN" ? theme.badge : theme.card }]}>
            <Text style={[styles.messageRole, { color: theme.muted }]}>{message.isInternal ? t("internalNote") : supportSenderLabel(message.senderType, t)}</Text>
            <Text style={[styles.messageBody, { color: theme.text }]}>{message.message}</Text>
            <Text style={[styles.messageDate, { color: theme.muted }]}>{formatDateTime(message.createdAt, locale)}</Text>
          </View>
        ))}
      </View>

      <TextInput
        value={reply}
        onChangeText={onReplyChange}
        multiline
        placeholder={t("writeReply")}
        placeholderTextColor={theme.muted}
        style={[styles.replyInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
      />
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: internalNote }} onPress={() => onInternalNoteChange(!internalNote)} style={[styles.internalNoteToggle, { borderColor: internalNote ? theme.primary : theme.border, backgroundColor: internalNote ? theme.badge : theme.card }]}>
        <Text style={[styles.statusChipText, { color: theme.text }]}>{t("internalNote")}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={saving || !reply.trim()} onPress={onSendReply} style={[styles.actionButton, { backgroundColor: theme.primary, opacity: saving || !reply.trim() ? 0.55 : 1 }]}>
        <Text style={[styles.actionButtonText, { color: theme.primaryText }]}>{t("sendReply")}</Text>
      </Pressable>
    </SurfaceCard>
  );
}

function extractStats(data: Record<string, unknown> | null): Stat[] {
  if (!data) return [];
  const metrics = isRecord(data.metrics) ? data.metrics : data;
  return Object.entries(metrics)
    .filter(([, value]) => typeof value === "number" || typeof value === "string")
    .slice(0, 8)
    .map(([key, value]) => ({ label: humanizeKey(key), value: String(value) }));
}

function extractRows(data: Record<string, unknown> | null, t: ReturnType<typeof useTranslation>["t"]): Row[] {
  if (!data) return [];
  const candidates = ["companies", "users", "subscriptions", "payments", "invoices", "tickets", "events", "activity", "securityEvents", "billingEvents"];
  for (const key of candidates) {
    const value = data[key];
    if (Array.isArray(value)) return value.slice(0, 30).map((item, index) => rowFromUnknown(item, `${key}-${index}`, t));
  }
  return [];
}

function rowFromUnknown(item: unknown, fallbackId: string, t: ReturnType<typeof useTranslation>["t"]): Row {
  if (!isRecord(item)) return { id: fallbackId, title: String(item) };
  const id = readString(item, "publicId") ?? readString(item, "id") ?? fallbackId;
  const title =
    readString(item, "name") ??
    readString(item, "title") ??
    readString(item, "subject") ??
    readString(item, "email") ??
    readString(item, "status") ??
    t("record");
  const supportSubtitle = [
    readNestedString(item, ["createdBy", "email"]),
    readNestedString(item, ["company", "name"]),
    readString(item, "category") ?? readString(item, "type")
  ].filter(Boolean).join(" - ");
  const subtitle =
    supportSubtitle ||
    (readString(item, "email") ??
      readString(item, "phone") ??
      readNestedString(item, ["company", "name"]) ??
      readNestedString(item, ["owner", "email"]) ??
      readString(item, "type"));
  const meta = readString(item, "status") ?? readString(item, "role") ?? readString(item, "severity");
  return {
    id,
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(meta ? { meta } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNestedString(record: Record<string, unknown>, path: string[]) {
  let current: unknown = record;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return typeof current === "string" && current.trim() ? current : undefined;
}

function humanizeKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function supportStatusLabel(status: string, t: ReturnType<typeof useTranslation>["t"]) {
  if (status === "OPEN") return t("supportOpen");
  if (status === "IN_PROGRESS") return t("supportInProgress");
  if (status === "WAITING_FOR_USER" || status === "ANSWERED") return t("supportWaitingForUser");
  if (status === "WAITING_FOR_ADMIN" || status === "PENDING") return t("supportWaitingForAdmin");
  if (status === "CLOSED") return t("supportClosed");
  if (status === "RESOLVED") return t("supportResolved");
  return status;
}

function supportSenderLabel(senderType: string, t: ReturnType<typeof useTranslation>["t"]) {
  if (senderType === "ADMIN") return t("adminReply");
  if (senderType === "USER" || senderType === "CUSTOMER") return t("userMessage");
  return t("systemMessage");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    })
  ]);
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
    paddingVertical: 16
  },
  content: {
    gap: 16,
    paddingBottom: 32
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  supportFilters: {
    gap: 10
  },
  filterInput: {
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 14
  },
  filterChips: {
    gap: 8
  },
  sourceCard: {
    gap: 6
  },
  sourceTitle: {
    fontSize: 15,
    fontWeight: "900"
  },
  sourceText: {
    fontSize: 13,
    lineHeight: 19
  },
  rows: {
    gap: 10
  },
  rowCard: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14
  },
  rowText: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "900"
  },
  rowSubtitle: {
    fontSize: 13,
    lineHeight: 18
  },
  supportPanel: {
    gap: 14
  },
  notice: {
    borderRadius: 8,
    fontSize: 13,
    fontWeight: "800",
    padding: 12
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  statusChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: "900"
  },
  actionButton: {
    alignItems: "center",
    borderRadius: 8,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "900"
  },
  thread: {
    gap: 10
  },
  messageBubble: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12
  },
  messageRole: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  messageBody: {
    fontSize: 14,
    lineHeight: 20
  },
  messageDate: {
    fontSize: 11,
    fontWeight: "700"
  },
  replyInput: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 110,
    padding: 14,
    textAlignVertical: "top"
  },
  internalNoteToggle: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 14
  }
});
