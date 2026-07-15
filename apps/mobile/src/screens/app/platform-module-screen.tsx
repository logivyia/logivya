import { useCallback, useMemo, useState } from "react";
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";

import {
  getAdminModuleData,
  getAdminModuleDefinition,
  getAdminSupportTicket,
  getAdminSupportTickets,
  assignAdminSupportTicket,
  replyAdminSupportTicket,
  confirmAdminPayment,
  activateAdminSubscriptionManually,
  getAdminCompanyOptions,
  reactivateAdminSubscription,
  reauthenticatePlatformAdmin,
  rejectAdminPayment,
  runAdminCompanyAction,
  runAdminSubscriptionAction,
  runAdminTrialDecision,
  runAdminUserAction,
  updateAdminSupportTicketPriority,
  updateAdminSupportTicketStatus,
  updateAdminSecurityEvent,
  type AdminModuleItem,
  type AdminModuleViewData,
  type AdminCompanyOption,
  type ManualAdminSubscriptionInput,
  type AdminSupportTicket
} from "@/api/mobileAdmin";
import { useAuthStore } from "@/auth/auth-store";
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
type Stat = { label: string; value: string | number };
const SUPPORT_ADMIN_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_FOR_ADMIN", "WAITING_FOR_USER", "RESOLVED", "CLOSED"] as const;
const SUPPORT_ADMIN_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export function PlatformModuleScreen() {
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const { params } = useRoute<PlatformModuleRoute>();
  const definition = getAdminModuleDefinition(params.moduleKey);
  const moduleTranslation = adminModuleTranslationKeys[params.moduleKey];
  const isPlatformAdmin = useAuthStore((state) => state.isPlatformAdmin);
  const [data, setData] = useState<AdminModuleViewData | null>(null);
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
  const [supportAssignment, setSupportAssignment] = useState<"ALL" | "ME" | "UNASSIGNED">("ALL");
  const [supportNextCursor, setSupportNextCursor] = useState<string | null>(null);
  const [supportHasMore, setSupportHasMore] = useState(false);
  const [supportMessageNextCursor, setSupportMessageNextCursor] = useState<string | null>(null);
  const [supportHasOlderMessages, setSupportHasOlderMessages] = useState(false);
  const [supportInternalNote, setSupportInternalNote] = useState(false);
  const [supportSaving, setSupportSaving] = useState(false);
  const [supportNotice, setSupportNotice] = useState<string | null>(null);
  const [moduleSearch, setModuleSearch] = useState("");
  const [moduleStatus, setModuleStatus] = useState("ALL");
  const [appliedModuleSearch, setAppliedModuleSearch] = useState("");
  const [appliedModuleStatus, setAppliedModuleStatus] = useState("ALL");
  const [modulePage, setModulePage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<AdminModuleItem | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionSaving, setActionSaving] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [companyOptions, setCompanyOptions] = useState<AdminCompanyOption[]>([]);
  const [manualSubscription, setManualSubscription] = useState<ManualAdminSubscriptionInput>(() => defaultManualSubscription());
  const isSupportModule = params.moduleKey === "support";

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!isPlatformAdmin) return;
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    setError(null);
    try {
      if (isSupportModule) {
        const result = await withTimeout(getAdminSupportTickets({
          ...(supportSearch.trim() ? { search: supportSearch.trim() } : {}),
          status: supportStatusFilter,
          priority: supportPriorityFilter,
          unreadOnly: supportUnreadOnly,
          assignment: supportAssignment,
        }), 12000, t("requestTimedOut"));
        setData(supportTicketsToViewData(result));
        setSupportNextCursor(result.pageInfo.nextCursor);
        setSupportHasMore(result.pageInfo.hasMore);
      } else {
        const resultPromise = getAdminModuleData(definition, {
          page: modulePage,
          ...(appliedModuleSearch ? { search: appliedModuleSearch } : {}),
          ...(appliedModuleStatus !== "ALL" ? { status: appliedModuleStatus } : {}),
        });
        const [result, options] = await withTimeout(Promise.all([
          resultPromise,
          params.moduleKey === "subscriptions" ? getAdminCompanyOptions() : Promise.resolve([] as AdminCompanyOption[]),
        ]), 12000, t("requestTimedOut"));
        setData(result);
        if (params.moduleKey === "subscriptions") setCompanyOptions(options);
        setSelectedItem((current) => current ? result.items.find((item) => item.id === current.id) ?? null : null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("dataUnavailable"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [appliedModuleSearch, appliedModuleStatus, definition, isPlatformAdmin, isSupportModule, modulePage, params.moduleKey, supportAssignment, supportPriorityFilter, supportSearch, supportStatusFilter, supportUnreadOnly, t]);

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

  const saveSupportAssignment = useCallback(async (assigned: boolean) => {
    if (!supportTicket || supportSaving) return;
    setSupportSaving(true);
    setSupportNotice(null);
    setError(null);
    try {
      await assignAdminSupportTicket(supportTicket.publicId || supportTicket.id, assigned);
      setSupportNotice(locale === "tr" ? (assigned ? "Talep size atandı." : "Talep ataması kaldırıldı.") : (assigned ? "Ticket assigned to you." : "Ticket unassigned."));
      await Promise.all([openSupportTicket(supportTicket.publicId || supportTicket.id), load("refresh")]);
    } catch (assignmentError) {
      setError(assignmentError instanceof Error ? assignmentError.message : t("ticketStatusUpdateFailed"));
    } finally {
      setSupportSaving(false);
    }
  }, [load, locale, openSupportTicket, supportSaving, supportTicket, t]);

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
        assignment: supportAssignment,
      });
      setData((current) => {
        const next = supportTicketsToViewData(result);
        return current ? {
          ...next,
          metrics: { ...current.metrics, ...next.metrics },
          items: [...current.items, ...next.items],
          pagination: { ...next.pagination, total: current.items.length + next.items.length },
        } : next;
      });
      setSupportNextCursor(result.pageInfo.nextCursor);
      setSupportHasMore(result.pageInfo.hasMore);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("dataUnavailable"));
    } finally {
      setRefreshing(false);
    }
  }, [isSupportModule, refreshing, supportAssignment, supportHasMore, supportNextCursor, supportPriorityFilter, supportSearch, supportStatusFilter, supportUnreadOnly, t]);

  const runModuleAction = useCallback((action: string) => {
    if (!selectedItem || actionSaving) return;
    const reason = actionReason.trim();
    const minimumReasonLength = params.moduleKey === "trialRisk" ? 8 : 5;
    if (action !== "REACTIVATE" && reason.length < minimumReasonLength) {
      setError(locale === "tr" ? `İşlem nedeni en az ${minimumReasonLength} karakter olmalıdır.` : `The operation reason must contain at least ${minimumReasonLength} characters.`);
      return;
    }
    Alert.alert(
      adminActionLabel(action, locale),
      locale === "tr" ? "Bu yönetici işlemini onaylıyor musunuz?" : "Do you confirm this administrator action?",
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("confirm"),
          style: action === "SUSPEND" || action === "CANCEL" || action === "REJECT" || action === "BLOCK" ? "destructive" : "default",
          onPress: () => {
            void (async () => {
              setActionSaving(true);
              setActionNotice(null);
              setError(null);
              try {
                if (params.moduleKey === "companies" && (action === "SUSPEND" || action === "REACTIVATE")) {
                  await runAdminCompanyAction(selectedItem.id, action === "SUSPEND" ? "suspend" : "reactivate", reason);
                } else if (params.moduleKey === "users" && ["SUSPEND", "REACTIVATE", "FORCE_LOGOUT", "RESET_MFA", "REQUIRE_MFA"].includes(action)) {
                  await runAdminUserAction(selectedItem.id, action as "SUSPEND" | "REACTIVATE" | "FORCE_LOGOUT" | "RESET_MFA" | "REQUIRE_MFA", reason);
                } else if (params.moduleKey === "subscriptions" && ["ACTIVATE", "SUSPEND", "CANCEL"].includes(action)) {
                  await runAdminSubscriptionAction(selectedItem.id, action as "ACTIVATE" | "SUSPEND" | "CANCEL", reason);
                } else if (params.moduleKey === "subscriptions" && action === "REACTIVATE") {
                  await reactivateAdminSubscription(selectedItem.id);
                } else if (params.moduleKey === "payments" && action === "MARK_PAID") {
                  await confirmAdminPayment(selectedItem.id, reason);
                } else if (params.moduleKey === "payments" && action === "REJECT") {
                  await rejectAdminPayment(selectedItem.id, reason);
                } else if (params.moduleKey === "trialRisk" && (action === "APPROVE_REVIEW" || action === "BLOCK")) {
                  await runAdminTrialDecision(selectedItem.id, action, reason);
                } else if (params.moduleKey === "security" && (action === "ACKNOWLEDGED" || action === "RESOLVED" || action === "DISMISSED")) {
                  await updateAdminSecurityEvent(selectedItem.id, action, reason);
                } else {
                  throw new Error(locale === "tr" ? "Bu işlem desteklenmiyor." : "This action is not supported.");
                }
                setActionNotice(locale === "tr" ? "İşlem başarıyla tamamlandı." : "The operation completed successfully.");
                setActionReason("");
                await load("refresh");
              } catch (actionError) {
                setError(actionError instanceof Error ? actionError.message : t("dataUnavailable"));
              } finally {
                setActionSaving(false);
              }
            })();
          },
        },
      ],
    );
  }, [actionReason, actionSaving, load, locale, params.moduleKey, selectedItem, t]);

  const reauthenticate = useCallback(async () => {
    if (!adminPassword || actionSaving) return;
    setActionSaving(true);
    setActionNotice(null);
    setError(null);
    try {
      await reauthenticatePlatformAdmin(adminPassword);
      setAdminPassword("");
      setActionNotice(locale === "tr" ? "Yönetici doğrulaması tamamlandı. Kritik işlemler kısa süreliğine açıldı." : "Administrator verification completed. Critical actions are temporarily enabled.");
    } catch (reauthError) {
      setError(reauthError instanceof Error ? reauthError.message : t("dataUnavailable"));
    } finally {
      setActionSaving(false);
    }
  }, [actionSaving, adminPassword, locale, t]);

  const submitManualSubscription = useCallback(async () => {
    if (actionSaving) return;
    const startsAt = new Date(`${manualSubscription.startsAt}T00:00:00.000Z`);
    const endsAt = new Date(`${manualSubscription.endsAt}T23:59:59.999Z`);
    if (!manualSubscription.companyId || manualSubscription.note.trim().length < 5 || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      setError(locale === "tr" ? "Şirket, geçerli tarih aralığı ve en az 5 karakterlik neden gereklidir." : "Company, a valid date range and a reason of at least 5 characters are required.");
      return;
    }
    setActionSaving(true);
    setActionNotice(null);
    setError(null);
    try {
      await activateAdminSubscriptionManually({ ...manualSubscription, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), note: manualSubscription.note.trim() });
      setActionNotice(locale === "tr" ? "Abonelik şirket için etkinleştirildi." : "The subscription was activated for the company.");
      setManualSubscription((current) => ({ ...defaultManualSubscription(), companyId: current.companyId }));
      await load("refresh");
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : t("dataUnavailable"));
    } finally {
      setActionSaving(false);
    }
  }, [actionSaving, load, locale, manualSubscription, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
      if (isSupportModule && params.ticketId) void openSupportTicket(params.ticketId);
    }, [isSupportModule, load, openSupportTicket, params.ticketId])
  );

  const stats = useMemo(() => extractStats(data, locale), [data, locale]);
  const rows = data?.items ?? [];

  if (!isPlatformAdmin) {
    return (
      <Screen style={styles.screen}>
        <ErrorState title={locale === "tr" ? "Bu bölüm yalnızca platform yöneticisine açıktır." : "This section is available only to the platform administrator."} onRetry={() => undefined} />
      </Screen>
    );
  }

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
          right={<Badge label={definition.coverage === "live" ? t("liveApi") : (locale === "tr" ? "Salt okunur" : "Read-only")} tone={definition.coverage === "live" ? "success" : "default"} />}
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
              {(["ALL", "ME", "UNASSIGNED"] as const).map((item) => {
                const active = supportAssignment === item;
                const label = item === "ALL" ? t("all") : item === "ME" ? (locale === "tr" ? "Bana atanan" : "Assigned to me") : (locale === "tr" ? "Atanmamış" : "Unassigned");
                return <Pressable key={item} onPress={() => setSupportAssignment(item)} style={[styles.statusChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.card }]}><Text style={[styles.statusChipText, { color: active ? theme.primaryText : theme.text }]}>{label}</Text></Pressable>;
              })}
            </ScrollView>
          </View>
        ) : null}

        {!isSupportModule && (definition.searchable || definition.statusOptions?.length) ? (
          <View style={styles.supportFilters}>
            {definition.searchable ? (
              <TextInput
                value={moduleSearch}
                onChangeText={setModuleSearch}
                onSubmitEditing={() => {
                  setAppliedModuleSearch(moduleSearch.trim());
                  setAppliedModuleStatus(moduleStatus);
                  setModulePage(1);
                }}
                placeholder={t("search")}
                placeholderTextColor={theme.muted}
                style={[styles.filterInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
              />
            ) : null}
            {definition.statusOptions?.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
                {["ALL", ...definition.statusOptions].map((item) => {
                  const active = moduleStatus === item;
                  return (
                    <Pressable key={item} onPress={() => { setModuleStatus(item); setModulePage(1); }} style={[styles.statusChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.card }]}>
                      <Text style={[styles.statusChipText, { color: active ? theme.primaryText : theme.text }]}>{item === "ALL" ? t("all") : adminStatusLabel(item, locale)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => { setAppliedModuleSearch(moduleSearch.trim()); setAppliedModuleStatus(moduleStatus); setModulePage(1); }} style={[styles.actionButton, { backgroundColor: theme.primary }]}>
              <Text style={[styles.actionButtonText, { color: theme.primaryText }]}>{locale === "tr" ? "Filtreleri uygula" : "Apply filters"}</Text>
            </Pressable>
          </View>
        ) : null}

        {params.moduleKey === "subscriptions" ? (
          <ManualSubscriptionPanel
            companies={companyOptions}
            value={manualSubscription}
            password={adminPassword}
            saving={actionSaving}
            notice={actionNotice}
            locale={locale}
            onChange={setManualSubscription}
            onPasswordChange={setAdminPassword}
            onReauthenticate={() => void reauthenticate()}
            onSubmit={() => void submitManualSubscription()}
          />
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

        {data?.generatedAt ? (
          <Text style={[styles.refreshStamp, { color: theme.muted }]}>
            {(locale === "tr" ? "Son yenileme: " : "Last refreshed: ") + formatDateTime(data.generatedAt, locale)}
          </Text>
        ) : null}

        {data?.capabilities.readOnlyReason ? (
          <SurfaceCard style={styles.sourceCard}>
            <Text style={[styles.sourceTitle, { color: theme.text }]}>{locale === "tr" ? "Güvenli salt okunur görünüm" : "Safe read-only view"}</Text>
            <Text style={[styles.sourceText, { color: theme.muted }]}>{localizeReadOnlyReason(data.capabilities.readOnlyReason, locale)}</Text>
          </SurfaceCard>
        ) : null}

        {error ? <ErrorState title={error} onRetry={() => void load()} /> : null}

        <SectionTitle title={t("records")} />
        {rows.length ? (
          <View style={styles.rows}>
            {rows.map((row) => (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                onPress={isSupportModule ? () => void openSupportTicket(row.id) : () => { setSelectedItem(row); setActionNotice(null); setActionReason(""); }}
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
                {row.status ? <Badge label={adminStatusLabel(row.status, locale)} tone="default" /> : null}
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

        {!isSupportModule && data && data.pagination.pages > 1 ? (
          <View style={styles.paginationRow}>
            <Pressable accessibilityRole="button" disabled={modulePage <= 1 || refreshing} onPress={() => setModulePage((page) => Math.max(1, page - 1))} style={[styles.pageButton, { borderColor: theme.border, opacity: modulePage <= 1 || refreshing ? 0.45 : 1 }]}>
              <Text style={[styles.statusChipText, { color: theme.text }]}>{locale === "tr" ? "Önceki" : "Previous"}</Text>
            </Pressable>
            <Text style={[styles.pageLabel, { color: theme.muted }]}>{`${data.pagination.page} / ${data.pagination.pages}`}</Text>
            <Pressable accessibilityRole="button" disabled={!data.pagination.nextPage || refreshing} onPress={() => setModulePage(data.pagination.nextPage ?? modulePage)} style={[styles.pageButton, { borderColor: theme.border, opacity: !data.pagination.nextPage || refreshing ? 0.45 : 1 }]}>
              <Text style={[styles.statusChipText, { color: theme.text }]}>{locale === "tr" ? "Sonraki" : "Next"}</Text>
            </Pressable>
          </View>
        ) : null}

        {!isSupportModule && selectedItem ? (
          <AdminModuleDetail
            item={selectedItem}
            actions={data?.capabilities.actions ?? []}
            actionReason={actionReason}
            adminPassword={adminPassword}
            saving={actionSaving}
            notice={actionNotice}
            locale={locale}
            onReasonChange={setActionReason}
            onPasswordChange={setAdminPassword}
            onReauthenticate={() => void reauthenticate()}
            onAction={runModuleAction}
          />
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
            onAssign={() => void saveSupportAssignment(true)}
            onUnassign={() => void saveSupportAssignment(false)}
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
  onAssign,
  onUnassign,
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
  onAssign: () => void;
  onUnassign: () => void;
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
      <Text style={[styles.sourceText, { color: theme.muted }]}>
        {(locale === "tr" ? "Atanan: " : "Assignee: ") + (ticket.assignedToAdmin?.name || ticket.assignedToAdmin?.email || (locale === "tr" ? "Atanmamış" : "Unassigned"))}
      </Text>
      <View style={styles.actionGrid}>
        <Pressable accessibilityRole="button" disabled={saving} onPress={onAssign} style={[styles.actionButton, { backgroundColor: theme.primary, opacity: saving ? 0.55 : 1 }]}><Text style={[styles.actionButtonText, { color: theme.primaryText }]}>{locale === "tr" ? "Bana ata" : "Assign to me"}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={saving || !ticket.assignedToAdmin} onPress={onUnassign} style={[styles.actionButton, { backgroundColor: theme.badge, opacity: saving || !ticket.assignedToAdmin ? 0.55 : 1 }]}><Text style={[styles.actionButtonText, { color: theme.text }]}>{locale === "tr" ? "Atamayı kaldır" : "Unassign"}</Text></Pressable>
      </View>
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
            {message.attachmentUrl ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(message.attachmentUrl!)}><Text style={[styles.sourceText, { color: theme.primary }]}>{locale === "tr" ? "Eki aç" : "Open attachment"}</Text></Pressable> : null}
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

function ManualSubscriptionPanel({ companies, value, password, saving, notice, locale, onChange, onPasswordChange, onReauthenticate, onSubmit }: {
  companies: AdminCompanyOption[];
  value: ManualAdminSubscriptionInput;
  password: string;
  saving: boolean;
  notice: string | null;
  locale: ReturnType<typeof useTranslation>["locale"];
  onChange: (value: ManualAdminSubscriptionInput) => void;
  onPasswordChange: (value: string) => void;
  onReauthenticate: () => void;
  onSubmit: () => void;
}) {
  const theme = useTheme();
  return (
    <SurfaceCard style={styles.supportPanel}>
      <Text style={[styles.sourceTitle, { color: theme.text }]}>{locale === "tr" ? "Manuel abonelik etkinleştirme" : "Manual subscription activation"}</Text>
      <Text style={[styles.sourceText, { color: theme.muted }]}>{locale === "tr" ? "Şirket düzeyindeki plan ve ekip haklarını backend üzerinden birlikte günceller." : "Updates company-level plan and team entitlements together through the backend."}</Text>
      <Text style={[styles.detailLabel, { color: theme.muted }]}>{locale === "tr" ? "Şirket" : "Company"}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
        {companies.map((company) => {
          const active = value.companyId === company.id;
          return (
            <Pressable key={company.id} accessibilityRole="button" onPress={() => onChange({ ...value, companyId: company.id })} style={[styles.choiceChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.card }]}>
              <Text style={[styles.statusChipText, { color: active ? theme.primaryText : theme.text }]} numberOfLines={1}>{company.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={[styles.detailLabel, { color: theme.muted }]}>{locale === "tr" ? "Plan" : "Plan"}</Text>
      <View style={styles.actionGrid}>
        {(["starter", "professional"] as const).map((planSlug) => <ChoiceButton key={planSlug} active={value.planSlug === planSlug} label={planSlug === "starter" ? (locale === "tr" ? "Başlangıç" : "Starter") : (locale === "tr" ? "Profesyonel" : "Professional")} onPress={() => onChange({ ...value, planSlug })} />)}
      </View>
      <Text style={[styles.detailLabel, { color: theme.muted }]}>{locale === "tr" ? "Fatura dönemi" : "Billing period"}</Text>
      <View style={styles.actionGrid}>
        {(["MONTHLY", "YEARLY"] as const).map((billingPeriod) => <ChoiceButton key={billingPeriod} active={value.billingPeriod === billingPeriod} label={billingPeriod === "MONTHLY" ? (locale === "tr" ? "Aylık" : "Monthly") : (locale === "tr" ? "Yıllık" : "Yearly")} onPress={() => onChange({ ...value, billingPeriod })} />)}
      </View>
      <View style={styles.dateRow}>
        <View style={styles.dateField}>
          <Text style={[styles.detailLabel, { color: theme.muted }]}>{locale === "tr" ? "Başlangıç" : "Start"}</Text>
          <TextInput value={value.startsAt} onChangeText={(startsAt) => onChange({ ...value, startsAt })} placeholder="2026-07-13" placeholderTextColor={theme.muted} style={[styles.filterInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]} />
        </View>
        <View style={styles.dateField}>
          <Text style={[styles.detailLabel, { color: theme.muted }]}>{locale === "tr" ? "Bitiş" : "End"}</Text>
          <TextInput value={value.endsAt} onChangeText={(endsAt) => onChange({ ...value, endsAt })} placeholder="2026-08-13" placeholderTextColor={theme.muted} style={[styles.filterInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]} />
        </View>
      </View>
      <Text style={[styles.detailLabel, { color: theme.muted }]}>{locale === "tr" ? "Ödeme yöntemi" : "Payment method"}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
        {(["MANUAL_BANK_TRANSFER", "MANUAL", "FREE_PROMO", "OTHER"] as const).map((paymentMethod) => {
          const active = value.paymentMethod === paymentMethod;
          return <Pressable key={paymentMethod} onPress={() => onChange({ ...value, paymentMethod })} style={[styles.choiceChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.card }]}><Text style={[styles.statusChipText, { color: active ? theme.primaryText : theme.text }]}>{paymentMethod.replace(/_/g, " ")}</Text></Pressable>;
        })}
      </ScrollView>
      <TextInput value={value.note} onChangeText={(note) => onChange({ ...value, note })} placeholder={locale === "tr" ? "Atama nedeni ve iç not" : "Assignment reason and internal note"} placeholderTextColor={theme.muted} multiline style={[styles.actionReasonInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]} />
      <TextInput value={password} onChangeText={onPasswordChange} placeholder={locale === "tr" ? "Yönetici parolası" : "Administrator password"} placeholderTextColor={theme.muted} secureTextEntry autoCapitalize="none" autoCorrect={false} style={[styles.filterInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]} />
      <Pressable accessibilityRole="button" disabled={saving || !password} onPress={onReauthenticate} style={[styles.actionButton, { backgroundColor: theme.badge, opacity: saving || !password ? 0.5 : 1 }]}><Text style={[styles.actionButtonText, { color: theme.text }]}>{locale === "tr" ? "Yöneticiyi doğrula" : "Verify administrator"}</Text></Pressable>
      {notice ? <Text style={[styles.notice, { color: theme.success, backgroundColor: theme.successSoft }]}>{notice}</Text> : null}
      <Pressable accessibilityRole="button" disabled={saving || !value.companyId || value.note.trim().length < 5} onPress={onSubmit} style={[styles.actionButton, { backgroundColor: theme.primary, opacity: saving || !value.companyId || value.note.trim().length < 5 ? 0.5 : 1 }]}><Text style={[styles.actionButtonText, { color: theme.primaryText }]}>{locale === "tr" ? "Aboneliği etkinleştir" : "Activate subscription"}</Text></Pressable>
    </SurfaceCard>
  );
}

function ChoiceButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.moduleActionButton, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.card }]}><Text style={[styles.actionButtonText, { color: active ? theme.primaryText : theme.text }]}>{label}</Text></Pressable>;
}

function AdminModuleDetail({ item, actions, actionReason, adminPassword, saving, notice, locale, onReasonChange, onPasswordChange, onReauthenticate, onAction }: {
  item: AdminModuleItem;
  actions: string[];
  actionReason: string;
  adminPassword: string;
  saving: boolean;
  notice: string | null;
  locale: ReturnType<typeof useTranslation>["locale"];
  onReasonChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onReauthenticate: () => void;
  onAction: (action: string) => void;
}) {
  const theme = useTheme();
  return (
    <SurfaceCard style={styles.supportPanel}>
      <Text style={[styles.sourceTitle, { color: theme.text }]}>{item.title}</Text>
      {item.subtitle ? <Text style={[styles.sourceText, { color: theme.muted }]}>{item.subtitle}</Text> : null}
      {item.status ? <Badge label={adminStatusLabel(item.status, locale)} tone="default" /> : null}
      <View style={styles.detailFields}>
        {Object.entries(item.fields).map(([key, value]) => (
          <View key={key} style={[styles.detailField, { borderBottomColor: theme.border }]}>
            <Text style={[styles.detailLabel, { color: theme.muted }]}>{adminFieldLabel(key, locale)}</Text>
            <Text style={[styles.detailValue, { color: theme.text }]} selectable>{formatAdminValue(value, locale)}</Text>
          </View>
        ))}
      </View>
      {notice ? <Text style={[styles.notice, { color: theme.success, backgroundColor: theme.successSoft }]}>{notice}</Text> : null}
      {actions.length ? (
        <>
          <Text style={[styles.detailLabel, { color: theme.muted }]}>{locale === "tr" ? "Kritik işlem doğrulaması" : "Critical action verification"}</Text>
          <TextInput
            value={adminPassword}
            onChangeText={onPasswordChange}
            placeholder={locale === "tr" ? "Yönetici parolası" : "Administrator password"}
            placeholderTextColor={theme.muted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.filterInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          />
          <Pressable accessibilityRole="button" disabled={saving || !adminPassword} onPress={onReauthenticate} style={[styles.actionButton, { backgroundColor: theme.primary, opacity: saving || !adminPassword ? 0.5 : 1 }]}>
            <Text style={[styles.actionButtonText, { color: theme.primaryText }]}>{locale === "tr" ? "Yöneticiyi doğrula" : "Verify administrator"}</Text>
          </Pressable>
          <TextInput
            value={actionReason}
            onChangeText={onReasonChange}
            placeholder={locale === "tr" ? "İşlem nedeni veya iç not" : "Operation reason or internal note"}
            placeholderTextColor={theme.muted}
            multiline
            style={[styles.actionReasonInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          />
          <View style={styles.actionGrid}>
            {actions.map((action) => (
              <Pressable key={action} accessibilityRole="button" disabled={saving} onPress={() => onAction(action)} style={[styles.moduleActionButton, { borderColor: theme.border, backgroundColor: destructiveAdminAction(action) ? theme.dangerSoft : theme.card, opacity: saving ? 0.5 : 1 }]}>
                <Text style={[styles.actionButtonText, { color: destructiveAdminAction(action) ? theme.danger : theme.text }]}>{adminActionLabel(action, locale)}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </SurfaceCard>
  );
}

function extractStats(data: AdminModuleViewData | null, locale: ReturnType<typeof useTranslation>["locale"]): Stat[] {
  if (!data) return [];
  return Object.entries(data.metrics)
    .filter(([, value]) => typeof value === "number" || typeof value === "string" || typeof value === "boolean")
    .slice(0, 8)
    .map(([key, value]) => ({ label: adminFieldLabel(key, locale), value: formatAdminValue(value, locale) }));
}

function supportTicketsToViewData(result: {
  tickets: AdminSupportTicket[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
  metrics?: Record<string, number>;
}): AdminModuleViewData {
  return {
    generatedAt: new Date().toISOString(),
    metrics: result.metrics ?? { tickets: result.tickets.length },
    items: result.tickets.map((ticket) => ({
      id: ticket.publicId || ticket.id,
      title: ticket.title || ticket.subject,
      subtitle: [ticket.createdBy?.email, ticket.company?.name, ticket.category || ticket.type].filter(Boolean).join(" · "),
      status: ticket.status,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      fields: {
        priority: ticket.priority ?? null,
        company: ticket.company?.name ?? null,
        user: ticket.createdBy?.email ?? null,
        lastMessageAt: ticket.lastMessageAt ?? null,
        unreadReplies: ticket.adminUnreadCount ?? ticket.unreadReplyCount ?? 0,
      },
    })),
    pagination: { page: 1, limit: 30, total: result.tickets.length, pages: result.pageInfo.hasMore ? 2 : 1, nextPage: result.pageInfo.hasMore ? 2 : null },
    capabilities: { search: true, filters: ["status", "priority", "unread"], actions: ["REPLY", "STATUS", "PRIORITY"], readOnly: false },
  };
}

const ADMIN_FIELD_LABELS_TR: Record<string, string> = {
  companies: "Şirketler", users: "Kullanıcılar", activeSubscriptions: "Aktif abonelikler", trialSubscriptions: "Deneme abonelikleri",
  subscriptions: "Abonelikler", invoices: "Faturalar", payments: "Ödemeler", total: "Toplam", unread: "Okunmamış",
  auditEvents: "Denetim kayıtları", adminAccess: "Yönetici erişimleri", sensitiveAccess: "Hassas erişimler", consents: "Onay kayıtları",
  dataRequests: "Veri talepleri", pendingRequests: "Bekleyen talepler", deletionRequests: "Silme talepleri", pending: "Bekleyen",
  completed: "Tamamlanan", deletions: "Silme talepleri", enabled: "Etkin", disabled: "Devre dışı", active: "Aktif", inactive: "Pasif",
  requests: "İstekler", errors: "Hatalar", averageLatencyMs: "Ortalama gecikme", activeKeys: "Aktif API anahtarları",
  endpoints: "Endpointler", failedDeliveries: "Başarısız teslimatlar", deadLetterDeliveries: "Kalıcı hatalar", providerConfigured: "Sağlayıcı yapılandırması",
  restoreWorkflowAvailable: "Geri yükleme iş akışı", rpoHours: "RPO (saat)", rtoHours: "RTO (saat)", dailyRetentionDays: "Günlük saklama (gün)",
  monthlyRetentionMonths: "Aylık saklama (ay)", supportedLocales: "Desteklenen diller", maintenanceMode: "Bakım modu", plans: "Planlar",
  supportedCurrencies: "Desteklenen para birimleri", publicRegistration: "Genel kayıt", app: "API", database: "Veritabanı", databaseLatencyMs: "Veritabanı gecikmesi",
  queue: "Kuyruk", worker: "Worker", storage: "Depolama", email: "E-posta", owner: "Sahip", ownerEmail: "Sahip e-postası", phone: "Telefon",
  plan: "Plan", planSlug: "Plan kodu", subscriptionStatus: "Abonelik durumu", seatsUsed: "Kullanılan koltuk", seatLimit: "Koltuk limiti",
  seatsAvailable: "Boş koltuk", members: "Üyeler", campaigns: "Kampanyalar", supportTickets: "Destek talepleri", lastActivityAt: "Son aktivite",
  whatsappAccountLimit: "WhatsApp hesap limiti", createdBy: "Oluşturan", company: "Şirket", companyId: "Şirket kimliği", companyEmail: "Şirket e-postası", role: "Rol",
  membershipStatus: "Üyelik durumu", adminRole: "Yönetici rolü", locale: "Dil", timezone: "Saat dilimi", lastActiveAt: "Son etkinlik",
  activeSessions: "Aktif oturumlar", trustedDevices: "Güvenilen cihazlar", billingPeriod: "Fatura dönemi", source: "Kaynak", provider: "Sağlayıcı",
  startsAt: "Başlangıç", endsAt: "Bitiş", currentPeriodEndsAt: "Dönem bitişi", cancelAtPeriodEnd: "Dönem sonunda iptal",
  historyEvents: "Geçmiş olayı", amount: "Tutar", subtotal: "Ara toplam", tax: "Vergi", currency: "Para birimi", issuedAt: "Düzenlenme",
  dueAt: "Son ödeme", paidAt: "Ödeme tarihi", failedAt: "Hata tarihi", paymentMethod: "Ödeme yöntemi", invoiceNumber: "Fatura numarası",
  failureReason: "Hata nedeni", healthScore: "Sağlık puanı", reconnectAttempts: "Yeniden bağlanma denemesi", groups: "Gruplar", contacts: "Kişiler",
  deliveries: "Teslimatlar", lastConnectedAt: "Son bağlantı", lastSyncedAt: "Son senkronizasyon", lastGroupSyncAt: "Grup senkronizasyonu",
  lastContactSyncAt: "Kişi senkronizasyonu", lastHeartbeatAt: "Son heartbeat", sessionRestoredAt: "Oturum geri yükleme", snapshotAvailable: "Snapshot mevcut",
  archived: "Arşivlenmiş", type: "Tür", scheduleType: "Zamanlama", scheduledAt: "Planlanan tarih", targets: "Hedefler", sent: "Gönderilen",
  failed: "Başarısız", canceled: "İptal edilen", deleteForEveryoneStatus: "Herkesten silme", actor: "İşlemi yapan", targetType: "Hedef türü",
  targetId: "Hedef kimliği", version: "Sürüm", granted: "Onaylandı", user: "Kullanıcı", completedAt: "Tamamlanma", key: "Anahtar",
  rolloutPercentage: "Yayın yüzdesi", eventCount: "Olay sayısı", lastDelivery: "Son teslimat", lastResponseStatus: "Son yanıt kodu",
  lastDeliveredAt: "Son teslim tarihi", providerConfiguredStatus: "Sağlayıcı", runbook: "Runbook", verification: "Doğrulama", result: "Sonuç",
  reason: "Neden", teamSeats: "Ekip koltuğu", whatsappAccounts: "WhatsApp hesabı", trialDays: "Deneme günü", documentAvailable: "Belge mevcut",
  priority: "Öncelik", lastMessageAt: "Son mesaj", unreadReplies: "Okunmamış yanıtlar", createdAt: "Oluşturulma", updatedAt: "Güncellenme",
};

const ADMIN_FIELD_LABELS_EN: Record<string, string> = {
  activeSubscriptions: "Active subscriptions", trialSubscriptions: "Trial subscriptions", pendingRequests: "Pending requests", deletionRequests: "Deletion requests",
  auditEvents: "Audit events", adminAccess: "Administrator access", sensitiveAccess: "Sensitive access", averageLatencyMs: "Average latency",
  activeKeys: "Active API keys", failedDeliveries: "Failed deliveries", deadLetterDeliveries: "Dead-letter deliveries", providerConfigured: "Provider configured",
  restoreWorkflowAvailable: "Restore workflow", rpoHours: "RPO (hours)", rtoHours: "RTO (hours)", dailyRetentionDays: "Daily retention (days)",
  monthlyRetentionMonths: "Monthly retention (months)", supportedLocales: "Supported locales", maintenanceMode: "Maintenance mode", supportedCurrencies: "Supported currencies",
  publicRegistration: "Public registration", databaseLatencyMs: "Database latency", ownerEmail: "Owner email", subscriptionStatus: "Subscription status",
  seatsUsed: "Seats used", seatLimit: "Seat limit", seatsAvailable: "Seats available", companyId: "Company ID", companyEmail: "Company email",
  membershipStatus: "Membership status", adminRole: "Administrator role", lastActiveAt: "Last active", activeSessions: "Active sessions",
  trustedDevices: "Trusted devices", billingPeriod: "Billing period", startsAt: "Starts at", endsAt: "Ends at", currentPeriodEndsAt: "Period ends at",
  cancelAtPeriodEnd: "Cancel at period end", historyEvents: "History events", paymentMethod: "Payment method", invoiceNumber: "Invoice number",
  healthScore: "Health score", reconnectAttempts: "Reconnect attempts", lastConnectedAt: "Last connected", lastSyncedAt: "Last synchronized",
  lastGroupSyncAt: "Group synchronization", lastContactSyncAt: "Contact synchronization", lastHeartbeatAt: "Last heartbeat", sessionRestoredAt: "Session restored",
  snapshotAvailable: "Snapshot available", scheduleType: "Schedule type", scheduledAt: "Scheduled at", deleteForEveryoneStatus: "Delete for Everyone",
  targetType: "Target type", targetId: "Target ID", rolloutPercentage: "Rollout percentage", eventCount: "Event count", lastDelivery: "Last delivery",
  lastResponseStatus: "Last response status", lastDeliveredAt: "Last delivered", teamSeats: "Team seats", whatsappAccounts: "WhatsApp accounts",
  trialDays: "Trial days", documentAvailable: "Document available", lastMessageAt: "Last message", unreadReplies: "Unread replies",
};

function adminFieldLabel(key: string, locale: ReturnType<typeof useTranslation>["locale"]) {
  const dictionary = locale === "tr" ? ADMIN_FIELD_LABELS_TR : ADMIN_FIELD_LABELS_EN;
  return dictionary[key] ?? key.replace(/^status_/, "").replace(/^revenue_/, locale === "tr" ? "Gelir " : "Revenue ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAdminValue(value: string | number | boolean | null, locale: ReturnType<typeof useTranslation>["locale"]) {
  if (value === null || value === "") return "-";
  if (typeof value === "boolean") return value ? (locale === "tr" ? "Evet" : "Yes") : (locale === "tr" ? "Hayır" : "No");
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value, locale);
  return String(value);
}

function adminStatusLabel(status: string, locale: ReturnType<typeof useTranslation>["locale"]) {
  const tr: Record<string, string> = {
    ACTIVE: "Aktif", INACTIVE: "Pasif", ENABLED: "Etkin", DISABLED: "Devre dışı", CONNECTED: "Bağlı", CONNECTING: "Bağlanıyor",
    DISCONNECTED: "Bağlantı kesildi", RECONNECT_REQUIRED: "Yeniden bağlantı gerekli", FAILED: "Başarısız", COMPLETED: "Tamamlandı", CANCELED: "İptal edildi",
    CANCELLED: "İptal edildi", SUSPENDED: "Askıya alındı", TRIALING: "Deneme", EXPIRED: "Süresi doldu", PENDING: "Bekliyor", PAID: "Ödendi",
    SUCCEEDED: "Başarılı", REFUNDED: "İade edildi", READ: "Okundu", UNREAD: "Okunmadı", REQUESTED: "Talep edildi", VERIFYING: "Doğrulanıyor",
    PROCESSING: "İşleniyor", REJECTED: "Reddedildi", HEALTHY: "Sağlıklı", DEGRADED: "Düşük performans", UNAVAILABLE: "Kullanılamıyor", UNKNOWN: "Bilinmiyor",
    CONFIGURED: "Yapılandırıldı", RUNBOOK_ONLY: "Yalnızca runbook", DOCUMENTED: "Belgelendi", ARCHIVED: "Arşivlendi", OPEN: "Açık",
  };
  return locale === "tr" ? (tr[status] ?? status.replace(/_/g, " ")) : status.replace(/_/g, " ");
}

function adminActionLabel(action: string, locale: ReturnType<typeof useTranslation>["locale"]) {
  const tr: Record<string, string> = { SUSPEND: "Askıya al", REACTIVATE: "Yeniden etkinleştir", FORCE_LOGOUT: "Oturumları kapat", RESET_MFA: "MFA sıfırla", REQUIRE_MFA: "MFA zorunlu kıl", ACTIVATE: "Etkinleştir", CANCEL: "İptal et", MARK_PAID: "Ödendi olarak işaretle", REJECT: "Reddet", APPROVE_REVIEW: "İncelemeyi onayla", BLOCK: "Engelle", ACKNOWLEDGED: "İncelemeye al", RESOLVED: "Çözüldü", DISMISSED: "Geçersiz sinyal" };
  const en: Record<string, string> = { SUSPEND: "Suspend", REACTIVATE: "Reactivate", FORCE_LOGOUT: "Revoke sessions", RESET_MFA: "Reset MFA", REQUIRE_MFA: "Require MFA", ACTIVATE: "Activate", CANCEL: "Cancel", MARK_PAID: "Mark paid", REJECT: "Reject", APPROVE_REVIEW: "Approve review", BLOCK: "Block", ACKNOWLEDGED: "Acknowledge", RESOLVED: "Resolve", DISMISSED: "Dismiss signal" };
  return (locale === "tr" ? tr : en)[action] ?? action.replace(/_/g, " ");
}

function destructiveAdminAction(action: string) {
  return ["SUSPEND", "CANCEL", "REJECT", "FORCE_LOGOUT", "RESET_MFA", "BLOCK"].includes(action);
}

function localizeReadOnlyReason(reason: string, locale: ReturnType<typeof useTranslation>["locale"]) {
  if (locale !== "tr") return reason;
  if (reason.includes("immutable")) return "Bu kayıtlar değiştirilemez veya silinemez.";
  if (reason.includes("environment-managed")) return "Bu ayarlar mevcut dağıtımda güvenli ortam yapılandırmasıyla yönetilir.";
  if (reason.includes("not available") || reason.includes("not implemented") || reason.includes("No ")) return "Bu işlem için güvenli ve denetlenebilir backend akışı henüz mevcut değil.";
  return "Bu modül mevcut backend yeteneklerine göre salt okunur çalışır.";
}

function defaultManualSubscription(): ManualAdminSubscriptionInput {
  const startsAt = new Date();
  const endsAt = new Date(startsAt);
  endsAt.setUTCDate(endsAt.getUTCDate() + 30);
  return {
    companyId: "",
    planSlug: "professional",
    billingPeriod: "MONTHLY",
    startsAt: startsAt.toISOString().slice(0, 10),
    endsAt: endsAt.toISOString().slice(0, 10),
    currency: "TRY",
    paymentMethod: "MANUAL",
    note: "",
  };
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
  choiceChip: {
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 220,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 12
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
  refreshStamp: {
    fontSize: 12,
    fontWeight: "700"
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
  paginationRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  pageButton: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12
  },
  pageLabel: {
    fontSize: 13,
    fontWeight: "800"
  },
  detailFields: {
    gap: 2
  },
  detailField: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingVertical: 10
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  detailValue: {
    fontSize: 14,
    lineHeight: 20
  },
  actionReasonInput: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    minHeight: 84,
    padding: 12,
    textAlignVertical: "top"
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  dateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  dateField: {
    flexGrow: 1,
    flexBasis: 140,
    gap: 6
  },
  moduleActionButton: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 46,
    minWidth: 132,
    paddingHorizontal: 12
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
