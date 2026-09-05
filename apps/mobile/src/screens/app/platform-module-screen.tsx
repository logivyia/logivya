import { Ionicons } from "@expo/vector-icons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AdminDetailSheet } from "./admin-detail-sheet";
import { adminMetricDestination, adminPresentationLabel, adminEventTitle, adminSettingsTitle, type AdminDestination } from "./admin-experience";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";

import { ApiRequestError } from "@/api/api-errors";
import {
  adminModuleDefinitions,
  getAdminModuleData,
  getAdminModuleDefinition,
  getAdminSupportTicket,
  getAdminSupportTickets,
  assignAdminSupportTicket,
  replyAdminSupportTicket,
  confirmAdminPayment,
  approveAdminSubscriptionRequest,
  activateAdminSubscriptionManually,
  getAdminCompanyOptions,
  getAdminSubscriptionRequests,
  reauthenticatePlatformAdmin,
  rejectAdminPayment,
  runAdminCompanyAction,
  runAdminSubscriptionAction,
  runAdminTrialDecision,
  runAdminUserAction,
  transitionAdminSubscriptionRequest,
  updateAdminSupportTicketPriority,
  updateAdminSupportTicketStatus,
  updateAdminSecurityEvent,
  updateAdminIncident,
  canManageAdminModule,
  canReadAdminModule,
  type AdminModuleItem,
  type AdminModuleKey,
  type AdminModuleViewData,
  type AdminCompanyOption,
  type AdminSubscriptionRequest,
  type ManualAdminSubscriptionInput,
  type AdminSupportTicket,
} from "@/api/mobileAdmin";
import { useAuthStore } from "@/auth/auth-store";
import { createSupportOperationId } from "@/api/mobileSupport";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import {
  Badge,
  PageHeader,
  SectionTitle,
  SurfaceCard,
} from "@/components/ui";
import { Screen } from "@/components/screen";
import { adminModuleTranslationKeys } from "@/i18n/admin-modules";
import {
  adminActionLabel as translatedAdminActionLabel,
  adminBillingPeriodLabel,
  adminBooleanLabel,
  adminPaymentMethodLabel as translatedAdminPaymentMethodLabel,
  adminPriorityLabel,
  adminStatusLabel as translatedAdminStatusLabel,
  adminValueLabel,
  adminEventTypeLabel,
} from "@/i18n/admin-labels";
import { formatDateTime, formatNumber } from "@/i18n/format";
import { translate } from "@/i18n/translations";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { MoreStackParamList } from "@/types/navigation";

type PlatformModuleRoute = RouteProp<MoreStackParamList, "PlatformModule">;
type Stat = { key: string; label: string; value: string | number };
const SUPPORT_ADMIN_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_ADMIN",
  "WAITING_FOR_USER",
  "RESOLVED",
  "CLOSED",
] as const;
const SUPPORT_ADMIN_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export function PlatformModuleScreen() {
  const { params, key } = useRoute<PlatformModuleRoute>();
  return <PlatformModuleContent key={key + params.moduleKey + (params.initialStatus ?? "") + (params.initialSearch ?? "")} />;
}

function PlatformModuleContent() {
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const { params } = useRoute<PlatformModuleRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const [modulePickerOpen, setModulePickerOpen] = useState(false);
  const [modulePickerSearch, setModulePickerSearch] = useState("");
  const [showAllStats, setShowAllStats] = useState(false);
  const [metricDetail, setMetricDetail] = useState<Stat | null>(null);
  const [subscriptionToolsOpen, setSubscriptionToolsOpen] = useState(params.initialSection === "requests");
  const recordsY = useRef(0);
  const definition = getAdminModuleDefinition(params.moduleKey);
  const moduleTranslation = adminModuleTranslationKeys[params.moduleKey];
  const isPlatformAdmin = useAuthStore((state) => state.isPlatformAdmin);
  const adminPermissions = useAuthStore((state) => state.adminPermissions);
  const scrollRef = useRef<ScrollView>(null);
  const canReadModule =
    isPlatformAdmin && canReadAdminModule(params.moduleKey, adminPermissions);
  const canManageModule = canManageAdminModule(
    params.moduleKey,
    adminPermissions,
  );
  const [data, setData] = useState<AdminModuleViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [moduleLoadError, setModuleLoadError] = useState<string | null>(null);
  const [supportLoadMoreError, setSupportLoadMoreError] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [supportTicket, setSupportTicket] = useState<AdminSupportTicket | null>(
    null,
  );
  const [supportReply, setSupportReply] = useState("");
  const [supportReplyOperation, setSupportReplyOperation] = useState<{
    body: string;
    id: string;
  } | null>(null);
  const [supportStatus, setSupportStatus] = useState("OPEN");
  const [supportPriority, setSupportPriority] = useState("NORMAL");
  const [supportSearch, setSupportSearch] = useState("");
  const [appliedSupportSearch, setAppliedSupportSearch] = useState("");
  const [supportStatusFilter, setSupportStatusFilter] = useState("ALL");
  const [supportPriorityFilter, setSupportPriorityFilter] = useState("ALL");
  const [supportUnreadOnly, setSupportUnreadOnly] = useState(false);
  const [supportAssignment, setSupportAssignment] = useState<
    "ALL" | "ME" | "UNASSIGNED"
  >("ALL");
  const [supportNextCursor, setSupportNextCursor] = useState<string | null>(
    null,
  );
  const [supportHasMore, setSupportHasMore] = useState(false);
  const [supportMessageNextCursor, setSupportMessageNextCursor] = useState<
    string | null
  >(null);
  const [supportHasOlderMessages, setSupportHasOlderMessages] = useState(false);
  const [supportInternalNote, setSupportInternalNote] = useState(false);
  const [supportSaving, setSupportSaving] = useState(false);
  const [supportNotice, setSupportNotice] = useState<string | null>(null);
  const [moduleSearch, setModuleSearch] = useState(params.initialSearch ?? "");
  const [moduleStatus, setModuleStatus] = useState(params.initialStatus ?? "ALL");
  const [appliedModuleSearch, setAppliedModuleSearch] = useState(params.initialSearch ?? "");
  const [appliedModuleStatus, setAppliedModuleStatus] = useState(params.initialStatus ?? "ALL");
  const [modulePage, setModulePage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<AdminModuleItem | null>(
    null,
  );
  const [actionReason, setActionReason] = useState("");
  const [actionSaving, setActionSaving] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminElevatedUntil, setAdminElevatedUntil] = useState<string | null>(
    null,
  );
  const [companyOptions, setCompanyOptions] = useState<AdminCompanyOption[]>(
    [],
  );
  const [manualSubscription, setManualSubscription] =
    useState<ManualAdminSubscriptionInput>(() => defaultManualSubscription());
  const [manualSubscriptionReviewOpen, setManualSubscriptionReviewOpen] =
    useState(false);
  const [manualSubscriptionConfirmation, setManualSubscriptionConfirmation] =
    useState("");
  const moduleRequestRef = useRef(0);
  const supportLoadMoreRequestRef = useRef(0);
  const isSupportModule = params.moduleKey === "support";
  const isAdminElevated = Boolean(
    adminElevatedUntil && Date.parse(adminElevatedUntil) > Date.now(),
  );

  useEffect(() => {
    if (!adminElevatedUntil) return;
    const remainingMs = Date.parse(adminElevatedUntil) - Date.now();
    if (remainingMs <= 0) {
      setAdminElevatedUntil(null);
      return;
    }
    const timeout = setTimeout(
      () => setAdminElevatedUntil(null),
      remainingMs + 50,
    );
    return () => clearTimeout(timeout);
  }, [adminElevatedUntil]);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!canReadModule) return;
      const requestId = ++moduleRequestRef.current;
      supportLoadMoreRequestRef.current += 1;
      if (mode === "initial") {
        setLoading(true);
        setRefreshing(false);
      }
      if (mode === "refresh") setRefreshing(true);
      setModuleLoadError(null);
      setSupportLoadMoreError(null);
      try {
        if (isSupportModule) {
          const result = await withTimeout(
            getAdminSupportTickets({
              ...(appliedSupportSearch
                ? { search: appliedSupportSearch }
                : {}),
              status: supportStatusFilter,
              priority: supportPriorityFilter,
              unreadOnly: supportUnreadOnly,
              assignment: supportAssignment,
            }),
            12000,
            t("requestTimedOut"),
          );
          if (requestId !== moduleRequestRef.current) return;
          setData(supportTicketsToViewData(result));
          setSupportNextCursor(result.pageInfo.nextCursor);
          setSupportHasMore(result.pageInfo.hasMore);
        } else {
          const resultPromise = getAdminModuleData(definition, {
            page: modulePage,
            ...(appliedModuleSearch ? { search: appliedModuleSearch } : {}),
            ...(appliedModuleStatus !== "ALL"
              ? { status: appliedModuleStatus }
              : {}),
          });
          const [result, options] = await withTimeout(
            Promise.all([
              resultPromise,
              params.moduleKey === "subscriptions"
                ? getAdminCompanyOptions()
                : Promise.resolve([] as AdminCompanyOption[]),
            ]),
            12000,
            t("requestTimedOut"),
          );
          if (requestId !== moduleRequestRef.current) return;
          setData(result);
          if (params.moduleKey === "subscriptions") {
            setCompanyOptions(options);
          }
          setSelectedItem((current) =>
            current
              ? (result.items.find((item) => item.id === current.id) ?? null)
              : null,
          );
        }
      } catch (loadError) {
        if (requestId !== moduleRequestRef.current) return;
        setModuleLoadError(
          loadError instanceof Error ? loadError.message : t("dataUnavailable"),
        );
      } finally {
        if (requestId !== moduleRequestRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      appliedModuleSearch,
      appliedModuleStatus,
      appliedSupportSearch,
      canReadModule,
      definition,
      isSupportModule,
      modulePage,
      params.moduleKey,
      supportAssignment,
      supportPriorityFilter,
      supportStatusFilter,
      supportUnreadOnly,
      t,
    ],
  );

  const applySupportSearch = useCallback(() => {
    const nextSearch = supportSearch.trim();
    if (nextSearch === appliedSupportSearch) {
      void load("refresh");
      return;
    }
    setAppliedSupportSearch(nextSearch);
  }, [appliedSupportSearch, load, supportSearch]);

  const openSupportTicket = useCallback(
    async (id: string) => {
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
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("supportTicketOpenFailed"),
        );
      } finally {
        setSupportSaving(false);
      }
    },
    [isSupportModule, t],
  );

  const loadOlderSupportMessages = useCallback(async () => {
    if (
      !supportTicket ||
      !supportMessageNextCursor ||
      !supportHasOlderMessages ||
      supportSaving
    )
      return;
    setSupportSaving(true);
    setError(null);
    try {
      const result = await getAdminSupportTicket(
        supportTicket.publicId || supportTicket.id,
        supportMessageNextCursor,
      );
      setSupportTicket((current) => {
        if (!current) return result.ticket;
        const seen = new Set<string>();
        const messages = [
          ...result.messages,
          ...(current.messages ?? []),
        ].filter((message) => {
          if (seen.has(message.id)) return false;
          seen.add(message.id);
          return true;
        });
        return { ...current, messages };
      });
      setSupportMessageNextCursor(result.pageInfo.nextCursor);
      setSupportHasOlderMessages(result.pageInfo.hasMore);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t("supportTicketOpenFailed"),
      );
    } finally {
      setSupportSaving(false);
    }
  }, [
    supportHasOlderMessages,
    supportMessageNextCursor,
    supportSaving,
    supportTicket,
    t,
  ]);

  const sendSupportReply = useCallback(async () => {
    if (
      !canManageModule ||
      !supportTicket ||
      !supportReply.trim() ||
      supportSaving
    )
      return;
    setSupportSaving(true);
    setSupportNotice(null);
    setError(null);
    try {
      const body = supportReply.trim();
      const operation =
        supportReplyOperation?.body === body
          ? supportReplyOperation
          : { body, id: createSupportOperationId("admin-reply") };
      setSupportReplyOperation(operation);
      await replyAdminSupportTicket(
        supportTicket.publicId || supportTicket.id,
        {
          message: body,
          clientMessageId: operation.id,
          internalNote: supportInternalNote,
        },
      );
      setSupportReply("");
      setSupportReplyOperation(null);
      setSupportNotice(t("replySent"));
      await Promise.all([
        openSupportTicket(supportTicket.publicId || supportTicket.id),
        load("refresh"),
      ]);
    } catch (replyError) {
      setError(
        replyError instanceof Error ? replyError.message : t("replyFailed"),
      );
    } finally {
      setSupportSaving(false);
    }
  }, [
    canManageModule,
    load,
    openSupportTicket,
    supportInternalNote,
    supportReply,
    supportReplyOperation,
    supportSaving,
    supportTicket,
    t,
  ]);

  const saveSupportStatus = useCallback(async () => {
    if (
      !canManageModule ||
      !supportTicket ||
      supportStatus === supportTicket.status ||
      supportSaving
    )
      return;
    setSupportSaving(true);
    setSupportNotice(null);
    setError(null);
    try {
      await updateAdminSupportTicketStatus(
        supportTicket.publicId || supportTicket.id,
        supportStatus,
      );
      setSupportNotice(t("ticketStatusUpdated"));
      await Promise.all([
        openSupportTicket(supportTicket.publicId || supportTicket.id),
        load("refresh"),
      ]);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : t("ticketStatusUpdateFailed"),
      );
    } finally {
      setSupportSaving(false);
    }
  }, [
    canManageModule,
    load,
    openSupportTicket,
    supportSaving,
    supportStatus,
    supportTicket,
    t,
  ]);

  const saveSupportPriority = useCallback(async () => {
    if (
      !canManageModule ||
      !supportTicket ||
      supportPriority === supportTicket.priority ||
      supportSaving
    )
      return;
    setSupportSaving(true);
    setSupportNotice(null);
    setError(null);
    try {
      await updateAdminSupportTicketPriority(
        supportTicket.publicId || supportTicket.id,
        supportPriority,
      );
      setSupportNotice(t("ticketStatusUpdated"));
      await Promise.all([
        openSupportTicket(supportTicket.publicId || supportTicket.id),
        load("refresh"),
      ]);
    } catch (priorityError) {
      setError(
        priorityError instanceof Error
          ? priorityError.message
          : t("ticketStatusUpdateFailed"),
      );
    } finally {
      setSupportSaving(false);
    }
  }, [
    canManageModule,
    load,
    openSupportTicket,
    supportPriority,
    supportSaving,
    supportTicket,
    t,
  ]);

  const saveSupportAssignment = useCallback(
    async (assigned: boolean) => {
      if (!canManageModule || !supportTicket || supportSaving) return;
      setSupportSaving(true);
      setSupportNotice(null);
      setError(null);
      try {
        await assignAdminSupportTicket(
          supportTicket.publicId || supportTicket.id,
          assigned,
        );
        setSupportNotice(t("adminSupport.statusUpdated"));
        await Promise.all([
          openSupportTicket(supportTicket.publicId || supportTicket.id),
          load("refresh"),
        ]);
      } catch (assignmentError) {
        setError(
          assignmentError instanceof Error
            ? assignmentError.message
            : t("ticketStatusUpdateFailed"),
        );
      } finally {
        setSupportSaving(false);
      }
    },
    [
      canManageModule,
      load,
      locale,
      openSupportTicket,
      supportSaving,
      supportTicket,
      t,
    ],
  );

  const loadMoreSupport = useCallback(async () => {
    if (!isSupportModule || !supportHasMore || !supportNextCursor || refreshing)
      return;
    const parentRequestId = moduleRequestRef.current;
    const requestId = ++supportLoadMoreRequestRef.current;
    setRefreshing(true);
    setSupportLoadMoreError(null);
    try {
      const result = await getAdminSupportTickets({
        cursor: supportNextCursor,
        ...(appliedSupportSearch ? { search: appliedSupportSearch } : {}),
        status: supportStatusFilter,
        priority: supportPriorityFilter,
        unreadOnly: supportUnreadOnly,
        assignment: supportAssignment,
      });
      if (
        requestId !== supportLoadMoreRequestRef.current ||
        parentRequestId !== moduleRequestRef.current
      )
        return;
      setData((current) => {
        const next = supportTicketsToViewData(result);
        if (!current) return next;
        const seen = new Set(current.items.map((item) => item.id));
        const appendedItems = next.items.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        const items = [...current.items, ...appendedItems];
        return {
          ...next,
          metrics: { ...current.metrics, ...next.metrics },
          items,
          pagination: { ...next.pagination, total: items.length },
        };
      });
      setSupportNextCursor(result.pageInfo.nextCursor);
      setSupportHasMore(result.pageInfo.hasMore);
    } catch (loadError) {
      if (
        requestId !== supportLoadMoreRequestRef.current ||
        parentRequestId !== moduleRequestRef.current
      )
        return;
      setSupportLoadMoreError(
        loadError instanceof Error ? loadError.message : t("dataUnavailable"),
      );
    } finally {
      if (requestId !== supportLoadMoreRequestRef.current) return;
      setRefreshing(false);
    }
  }, [
    appliedSupportSearch,
    isSupportModule,
    refreshing,
    supportAssignment,
    supportHasMore,
    supportNextCursor,
    supportPriorityFilter,
    supportStatusFilter,
    supportUnreadOnly,
    t,
  ]);

  const runModuleAction = useCallback(
    (action: string) => {
      if (!canManageModule || !selectedItem || actionSaving) return;
      if (!isAdminElevated) {
        setError(adminStepUpRequiredMessage(locale));
        return;
      }
      const reason = actionReason.trim();
      const minimumReasonLength = params.moduleKey === "trialRisk" ? 8 : 5;
      if (reason.length < minimumReasonLength) {
        setError(t("adminSubscriptions.validationError"));
        return;
      }
      Alert.alert(
        adminActionLabel(action, locale),
        t("adminSubscriptions.actionWarning"),
        [
          { text: t("cancel"), style: "cancel" },
          {
            text: t("confirm"),
            style:
              action === "SUSPEND" ||
              action === "CANCEL" ||
              action === "REJECT" ||
              action === "BLOCK"
                ? "destructive"
                : "default",
            onPress: () => {
              void (async () => {
                setActionSaving(true);
                setActionNotice(null);
                setError(null);
                try {
                  if (
                    params.moduleKey === "companies" &&
                    (action === "SUSPEND" || action === "REACTIVATE")
                  ) {
                    await runAdminCompanyAction(
                      selectedItem.id,
                      action === "SUSPEND" ? "suspend" : "reactivate",
                      reason,
                    );
                  } else if (
                    params.moduleKey === "users" &&
                    [
                      "SUSPEND",
                      "REACTIVATE",
                      "FORCE_LOGOUT",
                      "RESET_MFA",
                      "REQUIRE_MFA",
                    ].includes(action)
                  ) {
                    await runAdminUserAction(
                      selectedItem.id,
                      action as
                        | "SUSPEND"
                        | "REACTIVATE"
                        | "FORCE_LOGOUT"
                        | "RESET_MFA"
                        | "REQUIRE_MFA",
                      reason,
                    );
                  } else if (
                    params.moduleKey === "subscriptions" &&
                    ["ACTIVATE", "SUSPEND", "CANCEL"].includes(action)
                  ) {
                    await runAdminSubscriptionAction(
                      selectedItem.id,
                      action as "ACTIVATE" | "SUSPEND" | "CANCEL",
                      reason,
                    );
                  } else if (
                    params.moduleKey === "subscriptions" &&
                    action === "REACTIVATE"
                  ) {
                    await runAdminSubscriptionAction(
                      selectedItem.id,
                      "ACTIVATE",
                      reason,
                    );
                  } else if (
                    params.moduleKey === "payments" &&
                    action === "MARK_PAID"
                  ) {
                    await confirmAdminPayment(selectedItem.id, reason);
                  } else if (
                    params.moduleKey === "payments" &&
                    action === "REJECT"
                  ) {
                    await rejectAdminPayment(selectedItem.id, reason);
                  } else if (
                    params.moduleKey === "trialRisk" &&
                    (action === "APPROVE_REVIEW" || action === "BLOCK")
                  ) {
                    await runAdminTrialDecision(
                      selectedItem.id,
                      action,
                      reason,
                    );
                  } else if (
                    params.moduleKey === "security" &&
                    (action === "ACKNOWLEDGED" ||
                      action === "RESOLVED" ||
                      action === "DISMISSED")
                  ) {
                    await updateAdminSecurityEvent(
                      selectedItem.id,
                      action,
                      reason,
                    );
                  } else if (
                    params.moduleKey === "systemHealth" &&
                    [
                      "ACKNOWLEDGED",
                      "INVESTIGATING",
                      "MITIGATED",
                      "RESOLVED",
                    ].includes(action)
                  ) {
                    await updateAdminIncident(
                      selectedItem.id,
                      action as
                        | "ACKNOWLEDGED"
                        | "INVESTIGATING"
                        | "MITIGATED"
                        | "RESOLVED",
                      reason,
                    );
                  } else {
                    throw new Error(t("operationFailedError"));
                  }
                  setActionNotice(t("adminSubscriptions.actionCompleted"));
                  setActionReason("");
                  await load("refresh");
                } catch (actionError) {
                  if (isAdminStepUpError(actionError)) {
                    setAdminElevatedUntil(null);
                  }
                  setError(
                    isAdminStepUpError(actionError)
                      ? adminStepUpRequiredMessage(locale)
                      : actionError instanceof Error
                        ? actionError.message
                        : t("dataUnavailable"),
                  );
                } finally {
                  setActionSaving(false);
                }
              })();
            },
          },
        ],
      );
    },
    [
      actionReason,
      actionSaving,
      canManageModule,
      isAdminElevated,
      load,
      locale,
      params.moduleKey,
      selectedItem,
      t,
    ],
  );

  const reauthenticate = useCallback(async () => {
    if (!adminPassword || actionSaving) return;
    setActionSaving(true);
    setActionNotice(null);
    setError(null);
    try {
      const response = await reauthenticatePlatformAdmin(adminPassword);
      setAdminPassword("");
      setAdminElevatedUntil(response.expiresAt);
      setActionNotice(t("requestReceived"));
    } catch (reauthError) {
      setError(
        reauthError instanceof Error
          ? reauthError.message
          : t("dataUnavailable"),
      );
    } finally {
      setActionSaving(false);
    }
  }, [actionSaving, adminPassword, locale, t]);

  const reviewManualSubscription = useCallback(() => {
    if (!canManageModule || actionSaving) return;
    if (!isAdminElevated) {
      setError(adminStepUpRequiredMessage(locale));
      return;
    }
    const prepared = prepareManualSubscription(manualSubscription, locale);
    if (prepared.error) {
      setError(prepared.error);
      return;
    }
    setError(null);
    setActionNotice(null);
    setManualSubscriptionConfirmation("");
    setManualSubscriptionReviewOpen(true);
  }, [
    actionSaving,
    canManageModule,
    isAdminElevated,
    locale,
    manualSubscription,
  ]);

  const submitManualSubscription = useCallback(async () => {
    if (!canManageModule || actionSaving) return;
    if (!isAdminElevated) {
      setError(adminStepUpRequiredMessage(locale));
      return;
    }
    const prepared = prepareManualSubscription(manualSubscription, locale);
    if (prepared.error) {
      setError(prepared.error);
      return;
    }
    if (!manualSubscriptionReviewOpen) {
      setError(t("adminSubscriptions.actionWarning"));
      return;
    }
    if (
      manualSubscriptionConfirmation.trim() !==
      manualSubscriptionConfirmationPhrase(manualSubscription.companyId)
    ) {
      setError(t("notifications.admin.confirmationMismatch"));
      return;
    }
    setActionSaving(true);
    setActionNotice(null);
    setError(null);
    try {
      await activateAdminSubscriptionManually({
        ...manualSubscription,
        startsAt: prepared.startsAt.toISOString(),
        endsAt: prepared.endsAt.toISOString(),
        note: manualSubscription.note.trim(),
      });
      setActionNotice(t("adminSubscriptions.manualActivationCreated"));
      setManualSubscription((current) => ({
        ...defaultManualSubscription(),
        companyId: current.companyId,
      }));
      setManualSubscriptionReviewOpen(false);
      setManualSubscriptionConfirmation("");
      await load("refresh");
    } catch (activationError) {
      if (isAdminStepUpError(activationError)) {
        setAdminElevatedUntil(null);
      }
      setError(
        isAdminStepUpError(activationError)
          ? adminStepUpRequiredMessage(locale)
          : activationError instanceof Error
            ? activationError.message
            : t("dataUnavailable"),
      );
    } finally {
      setActionSaving(false);
    }
  }, [
    actionSaving,
    canManageModule,
    isAdminElevated,
    load,
    locale,
    manualSubscription,
    manualSubscriptionConfirmation,
    manualSubscriptionReviewOpen,
    t,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (adminElevatedUntil && Date.parse(adminElevatedUntil) <= Date.now()) {
        setAdminElevatedUntil(null);
      }
      void load();
      if (isSupportModule && params.ticketId)
        void openSupportTicket(params.ticketId);
      return () => {
        moduleRequestRef.current += 1;
        supportLoadMoreRequestRef.current += 1;
      };
    }, [
      adminElevatedUntil,
      isSupportModule,
      load,
      openSupportTicket,
      params.ticketId,
    ]),
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [params.moduleKey]);

  useEffect(() => {
    if (loading) return;
    if (modulePage > 1) scrollRef.current?.scrollTo({ y: recordsY.current, animated: true });
  }, [modulePage, loading]);

  const stats = useMemo(() => extractStats(data, locale), [data, locale]);
  const rows = data?.items ?? [];
  function openModule(destination: AdminDestination) {
    if (!canReadAdminModule(destination.moduleKey, adminPermissions)) return;
    setModulePickerOpen(false);
    if (destination.moduleKey === "notifications" || destination.moduleKey === "announcements") {
      navigation.push("AdminNotificationOperations", { initialTab: destination.moduleKey === "announcements" ? "announcements" : "dashboard" });
    } else if (destination.moduleKey === params.moduleKey) {
      setModuleStatus(destination.initialStatus ?? "ALL");
      setAppliedModuleStatus(destination.initialStatus ?? "ALL");
      setModuleSearch(destination.initialSearch ?? "");
      setAppliedModuleSearch(destination.initialSearch ?? "");
      setModulePage(1);
      scrollRef.current?.scrollTo({ y: recordsY.current, animated: true });
    } else navigation.push("PlatformModule", destination);
  }
  function openMetric(stat: Stat) {
    const destination = adminMetricDestination(params.moduleKey, stat.key);
    const validStatus = !destination?.initialStatus || destination.initialStatus === "ALL" || getAdminModuleDefinition(destination.moduleKey).statusOptions?.includes(destination.initialStatus);
    if (stat.key === "pendingSubscriptionRequests" && canReadAdminModule("subscriptions", adminPermissions)) { navigation.push("PlatformModule", { moduleKey: "subscriptions", initialSection: "requests" }); return; }
    if (destination && validStatus && canReadAdminModule(destination.moduleKey, adminPermissions)) openModule(destination);
    else setMetricDetail(stat);
  }
  const showModuleContent = !loading && !moduleLoadError;

  if (!canReadModule) {
    return (
      <Screen style={styles.screen}>
        <ErrorState
          title={t("operationForbiddenError")}
          onRetry={() => undefined}
        />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load("refresh")}
            tintColor={theme.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {navigation.canGoBack() ? <Pressable accessibilityRole="button" accessibilityLabel={locale === "tr" ? "Geri" : "Back"} onPress={() => navigation.goBack()} style={[styles.moduleButton, { borderColor: theme.border }]}><Ionicons name="arrow-back" size={20} color={theme.text} /></Pressable> : null}
          <Pressable accessibilityRole="button" onPress={() => setModulePickerOpen(true)} style={[styles.moduleButton, { flex: 1, borderColor: theme.border }]}><Ionicons name="grid-outline" size={18} color={theme.primary} /><Text style={{ color: theme.text, fontWeight: "700", flex: 1 }}>{locale === "tr" ? "Tüm yönetim bölümleri" : "All admin sections"}</Text><Ionicons name="chevron-down" size={18} color={theme.muted} /></Pressable>
        </View>
        <PageHeader
          eyebrow={params.eyebrow ?? t("adminSections")}
          title={params.title ?? t(moduleTranslation.title)}
          description={params.description ?? t(moduleTranslation.description)}
          right={
            <Badge
              label={
                definition.coverage === "live"
                  ? (locale === "tr" ? "Yönetim" : "Management")
                  : (locale === "tr" ? "Görüntüleme" : "View")
              }
              tone={definition.coverage === "live" ? "success" : "default"}
            />
          }
        />

        {isSupportModule ? (
          <View style={styles.supportFilters}>
            <TextInput
              value={supportSearch}
              onChangeText={setSupportSearch}
              onSubmitEditing={applySupportSearch}
              placeholder={t("search")}
              placeholderTextColor={theme.muted}
              style={[
                styles.filterInput,
                {
                  color: theme.text,
                  borderColor: theme.border,
                  backgroundColor: theme.card,
                },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              onPress={applySupportSearch}
              style={[styles.actionButton, { backgroundColor: theme.primary }]}
            >
              <Text
                style={[
                  styles.actionButtonText,
                  { color: theme.primaryText },
                ]}
              >
                {t("search")}
              </Text>
            </Pressable>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChips}
            >
              {["ALL", ...SUPPORT_ADMIN_STATUSES].map((item) => {
                const active = supportStatusFilter === item;
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSupportStatusFilter(item)}
                    style={[
                      styles.statusChip,
                      {
                        borderColor: active ? theme.primary : theme.border,
                        backgroundColor: active ? theme.primary : theme.card,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusChipText,
                        { color: active ? theme.primaryText : theme.text },
                      ]}
                    >
                      {item === "ALL" ? t("all") : supportStatusLabel(item, t)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChips}
            >
              {["ALL", ...SUPPORT_ADMIN_PRIORITIES].map((item) => {
                const active = supportPriorityFilter === item;
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSupportPriorityFilter(item)}
                    style={[
                      styles.statusChip,
                      {
                        borderColor: active ? theme.primary : theme.border,
                        backgroundColor: active ? theme.primary : theme.card,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusChipText,
                        { color: active ? theme.primaryText : theme.text },
                      ]}
                    >
                      {item === "ALL"
                        ? t("all")
                        : supportPriorityLabel(item, locale)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: supportUnreadOnly }}
              onPress={() => setSupportUnreadOnly((value) => !value)}
              style={[
                styles.statusChip,
                {
                  alignSelf: "flex-start",
                  borderColor: supportUnreadOnly ? theme.primary : theme.border,
                  backgroundColor: supportUnreadOnly
                    ? theme.primary
                    : theme.card,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusChipText,
                  { color: supportUnreadOnly ? theme.primaryText : theme.text },
                ]}
              >
                {t("unreadReplies")}
              </Text>
            </Pressable>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChips}
            >
              {(["ALL", "ME", "UNASSIGNED"] as const).map((item) => {
                const active = supportAssignment === item;
                const label =
                  item === "ALL"
                    ? t("all")
                    : item === "ME"
                      ? t("adminSupport.ticket")
                      : t("status.unknown");
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSupportAssignment(item)}
                    style={[
                      styles.statusChip,
                      {
                        borderColor: active ? theme.primary : theme.border,
                        backgroundColor: active ? theme.primary : theme.card,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusChipText,
                        { color: active ? theme.primaryText : theme.text },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {!isSupportModule &&
        (definition.searchable || definition.statusOptions?.length) ? (
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
                style={[
                  styles.filterInput,
                  {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: theme.card,
                  },
                ]}
              />
            ) : null}
            {definition.statusOptions?.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterChips}
              >
                {["ALL", ...definition.statusOptions].map((item) => {
                  const active = moduleStatus === item;
                  return (
                    <Pressable
                      key={item}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        setModuleStatus(item);
                        setAppliedModuleStatus(item);
                        setAppliedModuleSearch(moduleSearch.trim());
                        setModulePage(1);
                      }}
                      style={[
                        styles.statusChip,
                        {
                          borderColor: active ? theme.primary : theme.border,
                          backgroundColor: active ? theme.primary : theme.card,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusChipText,
                          { color: active ? theme.primaryText : theme.text },
                        ]}
                      >
                        {item === "ALL"
                          ? t("all")
                          : adminStatusLabel(item, locale)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setAppliedModuleSearch(moduleSearch.trim());
                setAppliedModuleStatus(moduleStatus);
                setModulePage(1);
              }}
              style={[styles.actionButton, { backgroundColor: theme.primary }]}
            >
              <Text
                style={[styles.actionButtonText, { color: theme.primaryText }]}
              >
                {t("adminSubscriptions.search")}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {params.moduleKey === "subscriptions" && showModuleContent ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: subscriptionToolsOpen }} onPress={() => setSubscriptionToolsOpen(value => !value)} style={[styles.moduleButton, { borderColor: theme.border }]}><Ionicons name="options-outline" size={20} color={theme.primary} /><Text style={{ color: theme.text, flex: 1, fontWeight: "700" }}>{locale === "tr" ? "Abonelik talepleri ve manuel işlemler" : "Subscription requests and manual actions"}</Text><Ionicons name={subscriptionToolsOpen ? "chevron-up" : "chevron-down"} size={20} color={theme.muted} /></Pressable> : null}
        {params.moduleKey === "subscriptions" && showModuleContent && subscriptionToolsOpen ? (
          <>
            <AdminSubscriptionRequestsPanel
              canManage={canManageModule}
              locale={locale}
              refreshToken={data?.generatedAt ?? "initial"}
            />
            {canManageModule ? (
              <ManualSubscriptionPanel
                companies={companyOptions}
                value={manualSubscription}
                password={adminPassword}
                saving={actionSaving}
                notice={actionNotice}
                elevated={isAdminElevated}
                locale={locale}
                reviewOpen={manualSubscriptionReviewOpen}
                confirmation={manualSubscriptionConfirmation}
                onChange={(nextValue) => {
                  setManualSubscription(nextValue);
                  setManualSubscriptionReviewOpen(false);
                  setManualSubscriptionConfirmation("");
                }}
                onPasswordChange={setAdminPassword}
                onReauthenticate={() => void reauthenticate()}
                onReview={reviewManualSubscription}
                onCancelReview={() => {
                  setManualSubscriptionReviewOpen(false);
                  setManualSubscriptionConfirmation("");
                }}
                onConfirmationChange={setManualSubscriptionConfirmation}
                onSubmit={() => void submitManualSubscription()}
              />
            ) : null}
          </>
        ) : null}

        {loading ? (
          <SurfaceCard style={styles.sourceCard}>
            <Text style={[styles.sourceTitle, { color: theme.text }]}>
              {t("dataPreparing")}
            </Text>
            <Text style={[styles.sourceText, { color: theme.muted }]}>
              {t("moduleLoadingDescription")}
            </Text>
          </SurfaceCard>
        ) : null}

        {showModuleContent && stats.length ? (
          <View style={styles.statsGrid}>
            {(showAllStats ? stats : stats.slice(0, 4)).map((stat) => (
              <Pressable key={stat.key} accessibilityRole="button" accessibilityLabel={stat.label + ": " + stat.value} onPress={() => openMetric(stat)} style={({ pressed }) => [styles.metricCard, { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Ionicons name="analytics-outline" size={18} color={theme.primary} /><Ionicons name="chevron-forward" size={16} color={theme.muted} /></View>
                <Text style={{ fontSize: 23, fontWeight: "800", color: theme.text }} adjustsFontSizeToFit numberOfLines={1}>{stat.value}</Text>
                <Text style={{ fontSize: 12, lineHeight: 17, color: theme.muted }}>{stat.label}</Text>
              </Pressable>
            ))}
            {stats.length > 4 ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAllStats }} onPress={() => setShowAllStats(value => !value)} style={[styles.moduleButton, { width: "100%", borderColor: theme.border }]}><Text style={{ color: theme.primary, fontWeight: "700" }}>{showAllStats ? (locale === "tr" ? "Özeti daralt" : "Collapse summary") : (locale === "tr" ? "Tüm göstergeler" : "All metrics") + " (" + stats.length + ")"}</Text><Ionicons name={showAllStats ? "chevron-up" : "chevron-down"} size={18} color={theme.primary} /></Pressable> : null}
          </View>
        ) : null}

        {showModuleContent && data?.generatedAt ? (
          <Text style={[styles.refreshStamp, { color: theme.muted }]}>
            {`${t("adminSupport.refresh")}: ${formatDateTime(data.generatedAt, locale)}`}
          </Text>
        ) : null}

        {showModuleContent && data?.capabilities.readOnlyReason ? (
          <SurfaceCard style={styles.sourceCard}>
            <Text style={[styles.sourceTitle, { color: theme.text }]}>
              {locale === "tr" ? "Görüntüleme yetkisi" : "View access"}
            </Text>
            <Text style={[styles.sourceText, { color: theme.muted }]}>
              {localizeReadOnlyReason(data.capabilities.readOnlyReason, locale)}
            </Text>
          </SurfaceCard>
        ) : null}

        {moduleLoadError ? (
          <ErrorState
            title={moduleLoadError}
            onRetry={() => void load("initial")}
          />
        ) : null}

        {error ? (
          <ErrorState title={error} onRetry={() => void load()} />
        ) : null}

        {showModuleContent ? <View onLayout={event => { recordsY.current = event.nativeEvent.layout.y; }}><SectionTitle title={t("records") + " · " + (data?.pagination.total ?? rows.length)} />{appliedModuleStatus !== "ALL" || appliedModuleSearch ? <Pressable accessibilityRole="button" onPress={() => openModule({ moduleKey: params.moduleKey })} style={styles.moduleButton}><Text style={{ color: theme.primary }}>{locale === "tr" ? "Filtreleri temizle" : "Clear filters"}</Text><Ionicons name="close-circle-outline" size={18} color={theme.primary} /></Pressable> : null}</View> : null}
        {showModuleContent && rows.length ? (
          <View style={styles.rows}>
            {rows.map((row) => (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                onPress={
                  isSupportModule
                    ? () => void openSupportTicket(row.id)
                    : () => {
                        setSelectedItem(row);
                        setActionNotice(null);
                        setActionReason("");
                      }
                }
                style={[
                  styles.rowCard,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <View style={styles.rowText}>
                  <Text
                    style={[styles.rowTitle, { color: theme.text }]}
                    numberOfLines={2}
                  >
                    {adminItemTitle(row, params.moduleKey, locale)}
                  </Text>
                  {row.subtitle ? (
                    <Text
                      style={[styles.rowSubtitle, { color: theme.muted }]}
                      numberOfLines={2}
                    >
                      {adminItemSubtitle(row, params.moduleKey, locale)}
                    </Text>
                  ) : null}
                </View>
                {row.status ? (
                  <Badge
                    label={adminStatusLabel(row.status, locale)}
                    tone={row.status === "ACTIVE" || row.status === "CONNECTED" || row.status === "COMPLETED" ? "success" : row.status === "FAILED" || row.status === "SUSPENDED" ? "danger" : "default"}
                  />
                ) : null}
                <Ionicons name="chevron-forward" size={18} color={theme.muted} />
              </Pressable>
            ))}
          </View>
        ) : showModuleContent ? (
          <EmptyState
            title={t("noRecords")}
            description={t("noModuleRecordsDescription")}
          />
        ) : null}

        {showModuleContent && supportLoadMoreError ? (
          <ErrorState
            title={supportLoadMoreError}
            onRetry={() => void loadMoreSupport()}
          />
        ) : null}

        {showModuleContent && isSupportModule && supportHasMore ? (
          <Pressable
            accessibilityRole="button"
            disabled={refreshing}
            onPress={() => void loadMoreSupport()}
            style={[
              styles.actionButton,
              {
                backgroundColor: theme.primary,
                opacity: refreshing ? 0.55 : 1,
              },
            ]}
          >
            <Text
              style={[styles.actionButtonText, { color: theme.primaryText }]}
            >
              {t("loadMore")}
            </Text>
          </Pressable>
        ) : null}

        {showModuleContent &&
        !isSupportModule &&
        data &&
        data.pagination.pages > 1 ? (
          <View style={styles.paginationRow}>
            <Pressable
              accessibilityRole="button"
              disabled={modulePage <= 1 || refreshing}
              onPress={() => setModulePage((page) => Math.max(1, page - 1))}
              style={[
                styles.pageButton,
                {
                  borderColor: theme.border,
                  opacity: modulePage <= 1 || refreshing ? 0.45 : 1,
                },
              ]}
            >
              <Text style={[styles.statusChipText, { color: theme.text }]}>
                {t("adminSupport.previous")}
              </Text>
            </Pressable>
            <Text
              style={[styles.pageLabel, { color: theme.muted }]}
            >{`${data.pagination.page} / ${data.pagination.pages}`}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={!data.pagination.nextPage || refreshing}
              onPress={() =>
                setModulePage(data.pagination.nextPage ?? modulePage)
              }
              style={[
                styles.pageButton,
                {
                  borderColor: theme.border,
                  opacity: !data.pagination.nextPage || refreshing ? 0.45 : 1,
                },
              ]}
            >
              <Text style={[styles.statusChipText, { color: theme.text }]}>
                {t("adminSupport.next")}
              </Text>
            </Pressable>
          </View>
        ) : null}

      </ScrollView>
        <AdminDetailSheet visible={Boolean(selectedItem)} title={locale === "tr" ? "Kayıt ayrıntıları" : "Record details"} onClose={() => { if (!actionSaving) { setSelectedItem(null); setAdminPassword(""); } }}>
        {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
        {selectedItem ? (
          <AdminModuleDetail
            item={selectedItem}
            moduleKey={params.moduleKey}
            actions={availableAdminActions(
              params.moduleKey,
              selectedItem,
              canManageModule
                ? (selectedItem.actions ?? data?.capabilities.actions ?? [])
                : [],
            )}
            actionReason={actionReason}
            adminPassword={adminPassword}
            saving={actionSaving}
            notice={actionNotice}
            elevated={isAdminElevated}
            locale={locale}
            onReasonChange={setActionReason}
            onPasswordChange={setAdminPassword}
            onReauthenticate={() => void reauthenticate()}
            onAction={runModuleAction}
          />
        ) : null}

        </AdminDetailSheet>
        <AdminDetailSheet visible={Boolean(supportTicket)} title={locale === "tr" ? "Destek talebi" : "Support ticket"} onClose={() => { if (!supportSaving) setSupportTicket(null); }}>
        {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
        {isSupportModule && supportTicket ? (
          <SupportTicketAdminPanel
            canManage={canManageModule}
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
              if (supportReplyOperation?.body !== value.trim())
                setSupportReplyOperation(null);
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
        </AdminDetailSheet>

      <AdminDetailSheet visible={modulePickerOpen} title={locale === "tr" ? "Yönetim bölümleri" : "Admin sections"} onClose={() => setModulePickerOpen(false)}>
        <TextInput accessibilityLabel={locale === "tr" ? "Bölüm ara" : "Find section"} placeholder={locale === "tr" ? "Bölüm ara…" : "Find section…"} placeholderTextColor={theme.muted} value={modulePickerSearch} onChangeText={setModulePickerSearch} style={[styles.filterInput, { color: theme.text, borderColor: theme.border }]} />
        {Object.values(adminModuleDefinitions).filter(item => item.key !== "settings" && canReadAdminModule(item.key, adminPermissions) && t(adminModuleTranslationKeys[item.key].title).toLocaleLowerCase(locale).includes(modulePickerSearch.toLocaleLowerCase(locale))).map(item => <Pressable key={item.key} accessibilityRole="button" onPress={() => openModule({ moduleKey: item.key })} style={[styles.moduleButton, { borderColor: theme.border, backgroundColor: item.key === params.moduleKey ? theme.cardMuted : theme.card }]}><Text style={{ color: theme.text, flex: 1, fontWeight: "600" }}>{t(adminModuleTranslationKeys[item.key].title)}</Text><Ionicons name="chevron-forward" size={18} color={theme.primary} /></Pressable>)}
      </AdminDetailSheet>
      <AdminDetailSheet visible={Boolean(metricDetail)} title={metricDetail?.label ?? ""} onClose={() => setMetricDetail(null)}>
        <Text style={{ fontSize: 32, fontWeight: "800", color: theme.text }}>{metricDetail?.value}</Text>
        <Text style={{ color: theme.muted }}>{locale === "tr" ? "Bu gösterge, yönetim bölümünün güncel özetidir. Kayıtlar bölümünden ilgili ayrıntıları inceleyebilirsiniz." : "This metric summarizes this section. Review its records for details."}</Text>
        <Pressable accessibilityRole="button" onPress={() => { setMetricDetail(null); scrollRef.current?.scrollTo({ y: recordsY.current, animated: true }); }} style={[styles.moduleButton, { borderColor: theme.border }]}><Text style={{ color: theme.primary }}>{locale === "tr" ? "Kayıtlara git" : "View records"}</Text></Pressable>
      </AdminDetailSheet>
    </Screen>
  );
}

function SupportTicketAdminPanel({
  canManage,
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
  canManage: boolean;
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
      <Text style={[styles.sourceTitle, { color: theme.text }]}>
        {ticket.title || ticket.subject}
      </Text>
      <Text style={[styles.sourceText, { color: theme.primary }]}>
        {ticket.publicId || ticket.id}
      </Text>
      <Text style={[styles.sourceText, { color: theme.muted }]}>
        {(ticket.createdBy?.email || "-") +
          " - " +
          (ticket.company?.name || "-")}
      </Text>
      <Text style={[styles.sourceText, { color: theme.muted }]}>
        {ticket.assignedToAdmin?.name ||
          ticket.assignedToAdmin?.email ||
          t("status.unknown")}
      </Text>
      {canManage ? (
        <View style={styles.actionGrid}>
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={onAssign}
            style={[
              styles.actionButton,
              { backgroundColor: theme.primary, opacity: saving ? 0.55 : 1 },
            ]}
          >
            <Text
              style={[styles.actionButtonText, { color: theme.primaryText }]}
            >
              {t("adminSupport.update")}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={saving || !ticket.assignedToAdmin}
            onPress={onUnassign}
            style={[
              styles.actionButton,
              {
                backgroundColor: theme.badge,
                opacity: saving || !ticket.assignedToAdmin ? 0.55 : 1,
              },
            ]}
          >
            <Text style={[styles.actionButtonText, { color: theme.text }]}>
              {t("cancel")}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {notice ? (
        <Text
          style={[
            styles.notice,
            { color: theme.success, backgroundColor: theme.successSoft },
          ]}
        >
          {notice}
        </Text>
      ) : null}

      {canManage ? (
        <View style={styles.statusRow}>
          {SUPPORT_ADMIN_STATUSES.map((item) => {
            const active = status === item;
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onStatusChange(item)}
                style={[
                  styles.statusChip,
                  {
                    borderColor: active ? theme.primary : theme.border,
                    backgroundColor: active ? theme.primary : theme.card,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    { color: active ? theme.primaryText : theme.text },
                  ]}
                >
                  {supportStatusLabel(item, t)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {canManage ? (
        <Pressable
          accessibilityRole="button"
          disabled={saving || status === ticket.status}
          onPress={onSaveStatus}
          style={[
            styles.actionButton,
            {
              backgroundColor: theme.primary,
              opacity: saving || status === ticket.status ? 0.55 : 1,
            },
          ]}
        >
          <Text style={[styles.actionButtonText, { color: theme.primaryText }]}>
            {t("updateStatus")}
          </Text>
        </Pressable>
      ) : null}

      {canManage ? (
        <Text style={[styles.messageRole, { color: theme.muted }]}>
          {t("priority")}
        </Text>
      ) : null}
      {canManage ? (
        <View style={styles.statusRow}>
          {SUPPORT_ADMIN_PRIORITIES.map((item) => {
            const active = priority === item;
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onPriorityChange(item)}
                style={[
                  styles.statusChip,
                  {
                    borderColor: active ? theme.primary : theme.border,
                    backgroundColor: active ? theme.primary : theme.card,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    { color: active ? theme.primaryText : theme.text },
                  ]}
                >
                  {supportPriorityLabel(item, locale)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {canManage ? (
        <Pressable
          accessibilityRole="button"
          disabled={saving || priority === ticket.priority}
          onPress={onSavePriority}
          style={[
            styles.actionButton,
            {
              backgroundColor: theme.primary,
              opacity: saving || priority === ticket.priority ? 0.55 : 1,
            },
          ]}
        >
          <Text style={[styles.actionButtonText, { color: theme.primaryText }]}>
            {t("updatePriority")}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.thread}>
        {hasOlderMessages ? (
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={onLoadOlderMessages}
            style={[
              styles.actionButton,
              { backgroundColor: theme.badge, opacity: saving ? 0.55 : 1 },
            ]}
          >
            <Text style={[styles.actionButtonText, { color: theme.text }]}>
              {t("loadOlderMessages")}
            </Text>
          </Pressable>
        ) : null}
        {(ticket.messages || []).map((message) => (
          <View
            key={message.id}
            style={[
              styles.messageBubble,
              {
                borderColor: theme.border,
                backgroundColor:
                  message.senderType === "ADMIN" ? theme.badge : theme.card,
              },
            ]}
          >
            <Text style={[styles.messageRole, { color: theme.muted }]}>
              {message.isInternal
                ? t("internalNote")
                : supportSenderLabel(message.senderType, t)}
            </Text>
            <Text style={[styles.messageBody, { color: theme.text }]}>
              {message.message}
            </Text>
            {message.attachmentUrl ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(message.attachmentUrl!)}
              >
                <Text style={[styles.sourceText, { color: theme.primary }]}>
                  {t("addAttachment")}
                </Text>
              </Pressable>
            ) : null}
            <Text style={[styles.messageDate, { color: theme.muted }]}>
              {formatDateTime(message.createdAt, locale)}
            </Text>
          </View>
        ))}
      </View>

      {canManage ? (
        <TextInput
          value={reply}
          onChangeText={onReplyChange}
          multiline
          placeholder={t("writeReply")}
          placeholderTextColor={theme.muted}
          style={[
            styles.replyInput,
            {
              color: theme.text,
              borderColor: theme.border,
              backgroundColor: theme.background,
            },
          ]}
        />
      ) : null}
      {canManage ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: internalNote }}
          onPress={() => onInternalNoteChange(!internalNote)}
          style={[
            styles.internalNoteToggle,
            {
              borderColor: internalNote ? theme.primary : theme.border,
              backgroundColor: internalNote ? theme.badge : theme.card,
            },
          ]}
        >
          <Text style={[styles.statusChipText, { color: theme.text }]}>
            {t("internalNote")}
          </Text>
        </Pressable>
      ) : null}
      {canManage ? (
        <Pressable
          accessibilityRole="button"
          disabled={saving || !reply.trim()}
          onPress={onSendReply}
          style={[
            styles.actionButton,
            {
              backgroundColor: theme.primary,
              opacity: saving || !reply.trim() ? 0.55 : 1,
            },
          ]}
        >
          <Text style={[styles.actionButtonText, { color: theme.primaryText }]}>
            {t("sendReply")}
          </Text>
        </Pressable>
      ) : null}
    </SurfaceCard>
  );
}

type SubscriptionRequestAction =
  | "APPROVE"
  | "UNDER_REVIEW"
  | "CLARIFICATION_REQUIRED"
  | "REJECTED"
  | "CANCELLED";

function AdminSubscriptionRequestsPanel({
  canManage,
  locale,
  refreshToken,
}: {
  canManage: boolean;
  locale: ReturnType<typeof useTranslation>["locale"];
  refreshToken: string;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [requests, setRequests] = useState<AdminSubscriptionRequest[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    request: AdminSubscriptionRequest;
    action: SubscriptionRequestAction;
  } | null>(null);
  const [note, setNote] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [bankChecked, setBankChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const subscriptionRequestRef = useRef(0);

  const loadRequests = useCallback(
    async (targetPage: number, status: string, search: string) => {
      const requestId = ++subscriptionRequestRef.current;
      setRequestsLoading(true);
      setRequestsError(null);
      try {
        const result = await getAdminSubscriptionRequests({
          page: targetPage,
          pageSize: 30,
          query: search,
          status,
        });
        if (requestId !== subscriptionRequestRef.current) return;
        setRequests(result.requests);
        setPage(result.pagination.page);
        setTotal(result.pagination.total);
        setTotalPages(result.pagination.totalPages);
      } catch (requestError) {
        if (requestId !== subscriptionRequestRef.current) return;
        setRequestsError(
          requestError instanceof Error
            ? requestError.message
            : t("adminSubscriptions.genericError"),
        );
      } finally {
        if (requestId !== subscriptionRequestRef.current) return;
        setRequestsLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadRequests(1, filter, appliedQuery);
    return () => {
      subscriptionRequestRef.current += 1;
    };
  }, [appliedQuery, filter, loadRequests, refreshToken]);

  const showSubscriptionRequestContent =
    !requestsLoading && !requestsError;

  const openAction = (
    request: AdminSubscriptionRequest,
    action: SubscriptionRequestAction,
  ) => {
    setSelected({ request, action });
    setNote("");
    setAdminPassword("");
    setBankChecked(false);
    setNotice(null);
    setPanelError(null);
  };

  const runAction = async () => {
    if (!selected || saving) return;
    const cleanNote = note.trim();
    if (cleanNote.length < 5) {
      setPanelError(t("adminSubscriptions.validationError"));
      return;
    }
    if (selected.action === "APPROVE" && !bankChecked) {
      setPanelError(t("adminSubscriptions.manual.bankChecked"));
      return;
    }
    if (!adminPassword) {
      setPanelError(t("passwordRequired"));
      return;
    }
    setSaving(true);
    setPanelError(null);
    try {
      await reauthenticatePlatformAdmin(adminPassword);
      if (selected.action === "APPROVE") {
        await approveAdminSubscriptionRequest(selected.request.id, cleanNote);
      } else {
        await transitionAdminSubscriptionRequest(selected.request.id, {
          action: selected.action,
          internalNote: cleanNote,
          ...(selected.action === "CLARIFICATION_REQUIRED" ||
          selected.action === "REJECTED"
            ? { customerNote: cleanNote }
            : {}),
        });
      }
      setNotice(t("adminSubscriptions.actionCompleted"));
      setSelected(null);
      setAdminPassword("");
      await loadRequests(page, filter, appliedQuery);
    } catch (actionError) {
      setPanelError(
        actionError instanceof Error
          ? actionError.message
          : t("adminSubscriptions.genericError"),
      );
    } finally {
      setSaving(false);
    }
  };

  const filters = [
    "ALL",
    "AWAITING_PAYMENT",
    "UNDER_REVIEW",
    "CLARIFICATION_REQUIRED",
    "APPROVED",
    "ACTIVATED",
    "REJECTED",
    "CANCELLED",
  ];

  return (
    <SurfaceCard style={styles.supportPanel}>
      <Text style={[styles.sourceTitle, { color: theme.text }]}>
        {t("adminSubscriptions.title")}
      </Text>
      <Text style={[styles.sourceText, { color: theme.muted }]}>
        {t("adminSubscriptions.description")}
      </Text>
      <View style={styles.subscriptionRequestSearchRow}>
        <TextInput
          accessibilityLabel={t("adminSubscriptions.search")}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => setAppliedQuery(query.trim())}
          placeholder={t("adminSubscriptions.searchPlaceholder")}
          placeholderTextColor={theme.muted}
          style={[
            styles.filterInput,
            styles.subscriptionRequestSearchInput,
            {
              color: theme.text,
              borderColor: theme.border,
              backgroundColor: theme.card,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => setAppliedQuery(query.trim())}
          style={[styles.actionButton, { backgroundColor: theme.primary }]}
        >
          <Text style={[styles.actionButtonText, { color: theme.primaryText }]}>
            {t("adminSubscriptions.search")}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChips}
      >
        {filters.map((status) => {
          const active = filter === status;
          return (
            <Pressable
              key={status}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(status)}
              style={[
                styles.statusChip,
                {
                  borderColor: active ? theme.primary : theme.border,
                  backgroundColor: active ? theme.primary : theme.card,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusChipText,
                  { color: active ? theme.primaryText : theme.text },
                ]}
              >
                {status === "ALL" ? t("all") : adminStatusLabel(status, locale)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {requestsLoading ? (
        <Text style={[styles.sourceText, { color: theme.muted }]}>
          {t("loading")}
        </Text>
      ) : null}
      {requestsError ? (
        <Text
          style={[
            styles.notice,
            { color: theme.danger, backgroundColor: theme.dangerSoft },
          ]}
        >
          {requestsError}
        </Text>
      ) : null}
      {showSubscriptionRequestContent && requests.length ? (
        requests.map((request) => {
          const workflowStatus = request.workflowStatus || request.status;
          return (
            <View
              key={request.id}
              style={[
                styles.messageBubble,
                { borderColor: theme.border, backgroundColor: theme.cardMuted },
              ]}
            >
              <View style={styles.rowCardHeader}>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>
                    {request.planName}
                  </Text>
                  <Text style={[styles.rowSubtitle, { color: theme.muted }]}>
                    {request.requestedBy?.name || "-"} ·{" "}
                    {request.requestedBy?.email || "-"}
                  </Text>
                  <Text style={[styles.rowSubtitle, { color: theme.muted }]}>
                    {request.company?.name || "-"}
                  </Text>
                  <Text
                    selectable
                    style={[styles.messageRole, { color: theme.text }]}
                  >
                    {`${t("adminSupport.ticket")}: ${request.publicId}`}
                  </Text>
                  <Text
                    selectable
                    style={[styles.messageRole, { color: theme.primary }]}
                  >
                    {`${t("billing.manual.paymentReference")}: ${request.paymentReference}`}
                  </Text>
                  <Text style={[styles.rowSubtitle, { color: theme.muted }]}>
                    {`${t("adminPayments.amount")}: ${request.amount} ${request.currency} · ${subscriptionBillingPeriodLabel(request.billingPeriod, locale)}`}
                  </Text>
                  <Text style={[styles.rowSubtitle, { color: theme.muted }]}>
                    {`${t("billing.manual.paymentReference")}: ${request.transferDescription}`}
                  </Text>
                </View>
                <Badge
                  label={adminStatusLabel(request.status, locale)}
                  tone={request.status === "APPROVED" ? "success" : "warning"}
                />
              </View>
              {request.adminCustomerNote ? (
                <Text style={[styles.sourceText, { color: theme.muted }]}>
                  {request.adminCustomerNote}
                </Text>
              ) : null}
              {canManage &&
              [
                "AWAITING_PAYMENT",
                "UNDER_REVIEW",
                "CLARIFICATION_REQUIRED",
              ].includes(workflowStatus) ? (
                <View style={styles.actionGrid}>
                  {workflowStatus !== "UNDER_REVIEW" ? (
                    <RequestActionButton
                      label={t("adminSubscriptions.manual.takeReview")}
                      onPress={() => openAction(request, "UNDER_REVIEW")}
                    />
                  ) : null}
                  <RequestActionButton
                    label={t("adminSubscriptions.manual.approvePayment")}
                    onPress={() => openAction(request, "APPROVE")}
                  />
                  <RequestActionButton
                    label={t("adminSubscriptions.manual.requestClarification")}
                    onPress={() =>
                      openAction(request, "CLARIFICATION_REQUIRED")
                    }
                  />
                  <RequestActionButton
                    label={t("adminSubscriptions.manual.rejectRequest")}
                    destructive
                    onPress={() => openAction(request, "REJECTED")}
                  />
                  <RequestActionButton
                    label={t("adminSubscriptions.action.cancel")}
                    destructive
                    onPress={() => openAction(request, "CANCELLED")}
                  />
                </View>
              ) : null}
            </View>
          );
        })
      ) : showSubscriptionRequestContent ? (
        <Text style={[styles.sourceText, { color: theme.muted }]}>
          {t("noModuleRecordsDescription")}
        </Text>
      ) : null}

      {showSubscriptionRequestContent && totalPages > 1 ? (
        <View style={styles.paginationRow}>
          <Pressable
            accessibilityRole="button"
            disabled={page <= 1}
            onPress={() => void loadRequests(page - 1, filter, appliedQuery)}
            style={[
              styles.pageButton,
              { borderColor: theme.border, opacity: page <= 1 ? 0.45 : 1 },
            ]}
          >
            <Text style={[styles.statusChipText, { color: theme.text }]}>
              {t("adminSupport.previous")}
            </Text>
          </Pressable>
          <Text style={[styles.pageLabel, { color: theme.muted }]}>
            {t("adminSupport.ticketCount", { count: total })} · {page} /{" "}
            {totalPages}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={page >= totalPages}
            onPress={() => void loadRequests(page + 1, filter, appliedQuery)}
            style={[
              styles.pageButton,
              {
                borderColor: theme.border,
                opacity: page >= totalPages ? 0.45 : 1,
              },
            ]}
          >
            <Text style={[styles.statusChipText, { color: theme.text }]}>
              {t("adminSupport.next")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <AdminDetailSheet visible={Boolean(selected)} title={locale === "tr" ? "Abonelik işlemi" : "Subscription action"} onClose={() => { if (!saving) { setSelected(null); setAdminPassword(""); } }}>
      {selected ? (
        <View
          style={[
            styles.messageBubble,
            { borderColor: theme.primary, backgroundColor: theme.card },
          ]}
        >
          <Text style={[styles.sourceTitle, { color: theme.text }]}>
            {subscriptionRequestActionLabel(selected.action, locale)}
          </Text>
          <Text style={[styles.sourceText, { color: theme.muted }]}>
            {selected.request.planName} · {selected.request.amount}{" "}
            {selected.request.currency} ·{" "}
            {subscriptionBillingPeriodLabel(
              selected.request.billingPeriod,
              locale,
            )}
          </Text>
          <Text
            selectable
            style={[styles.sourceText, { color: theme.primary }]}
          >
            {`${t("billing.manual.paymentReference")}: ${selected.request.paymentReference}`}
          </Text>
          {selected.action === "APPROVE" ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: bankChecked }}
              onPress={() => setBankChecked((value) => !value)}
              style={[
                styles.internalNoteToggle,
                {
                  borderColor: bankChecked ? theme.primary : theme.border,
                  backgroundColor: bankChecked ? theme.badge : theme.card,
                },
              ]}
            >
              <Text style={[styles.statusChipText, { color: theme.text }]}>
                {bankChecked ? "✓ " : ""}
                {t("adminSubscriptions.manual.bankChecked")}
              </Text>
            </Pressable>
          ) : null}
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            placeholder={t("adminSubscriptions.actionReasonPlaceholder")}
            placeholderTextColor={theme.muted}
            style={[
              styles.actionReasonInput,
              {
                color: theme.text,
                borderColor: theme.border,
                backgroundColor: theme.card,
              },
            ]}
          />
          <TextInput
            value={adminPassword}
            onChangeText={setAdminPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t("password")}
            placeholderTextColor={theme.muted}
            style={[
              styles.filterInput,
              {
                color: theme.text,
                borderColor: theme.border,
                backgroundColor: theme.card,
              },
            ]}
          />
          {panelError ? (
            <Text style={[styles.notice, { color: theme.danger }]}>
              {panelError}
            </Text>
          ) : null}
          <View style={styles.actionGrid}>
            <RequestActionButton
              label={t("adminSubscriptions.dismiss")}
              onPress={() => setSelected(null)}
            />
            <RequestActionButton
              label={saving ? "..." : t("adminSubscriptions.confirm")}
              onPress={() => void runAction()}
            />
          </View>
        </View>
      ) : null}
      </AdminDetailSheet>
      {notice ? (
        <Text style={[styles.notice, { color: theme.success }]}>{notice}</Text>
      ) : null}
    </SurfaceCard>
  );
}

function RequestActionButton({
  label,
  destructive = false,
  onPress,
}: {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.moduleActionButton, { borderColor: theme.border }]}
    >
      <Text
        style={[
          styles.statusChipText,
          { color: destructive ? theme.danger : theme.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function subscriptionRequestActionLabel(
  action: SubscriptionRequestAction,
  locale: ReturnType<typeof useTranslation>["locale"],
) {
  const keys = {
    APPROVE: "adminSubscriptions.manual.approvePayment",
    UNDER_REVIEW: "adminSubscriptions.manual.takeReview",
    CLARIFICATION_REQUIRED: "adminSubscriptions.manual.requestClarification",
    REJECTED: "adminSubscriptions.manual.rejectRequest",
    CANCELLED: "adminSubscriptions.action.cancel",
  } as const;
  return translate(locale, keys[action]);
}

function subscriptionBillingPeriodLabel(
  period: AdminSubscriptionRequest["billingPeriod"],
  locale: ReturnType<typeof useTranslation>["locale"],
) {
  return adminBillingPeriodLabel(period, locale);
}

function ManualSubscriptionPanel({
  companies,
  value,
  password,
  saving,
  notice,
  elevated,
  locale,
  reviewOpen,
  confirmation,
  onChange,
  onPasswordChange,
  onReauthenticate,
  onReview,
  onCancelReview,
  onConfirmationChange,
  onSubmit,
}: {
  companies: AdminCompanyOption[];
  value: ManualAdminSubscriptionInput;
  password: string;
  saving: boolean;
  notice: string | null;
  elevated: boolean;
  locale: ReturnType<typeof useTranslation>["locale"];
  reviewOpen: boolean;
  confirmation: string;
  onChange: (value: ManualAdminSubscriptionInput) => void;
  onPasswordChange: (value: string) => void;
  onReauthenticate: () => void;
  onReview: () => void;
  onCancelReview: () => void;
  onConfirmationChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const selectedCompany = companies.find(
    (company) => company.id === value.companyId,
  );
  const confirmationPhrase = manualSubscriptionConfirmationPhrase(
    value.companyId,
  );
  const planLabel =
    value.planSlug === "starter" ? "LOGIVYA Plus" : "LOGIVYA Pro";
  const billingPeriodLabel = adminBillingPeriodLabel(
    value.billingPeriod,
    locale,
  );
  return (
    <SurfaceCard style={styles.supportPanel}>
      <Text style={[styles.sourceTitle, { color: theme.text }]}>
        {t("adminSubscriptions.title")}
      </Text>
      <Text style={[styles.sourceText, { color: theme.muted }]}>
        {t("adminSubscriptions.description")}
      </Text>
      <Text style={[styles.detailLabel, { color: theme.muted }]}>
        {t("adminSubscriptions.selectCompany")}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChips}
      >
        {companies.map((company) => {
          const active = value.companyId === company.id;
          return (
            <Pressable
              key={company.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange({ ...value, companyId: company.id })}
              style={[
                styles.choiceChip,
                {
                  borderColor: active ? theme.primary : theme.border,
                  backgroundColor: active ? theme.primary : theme.card,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusChipText,
                  { color: active ? theme.primaryText : theme.text },
                ]}
                numberOfLines={1}
              >
                {company.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={[styles.detailLabel, { color: theme.muted }]}>
        {t("adminSubscriptions.plan")}
      </Text>
      <View style={styles.actionGrid}>
        {(["starter", "professional"] as const).map((planSlug) => (
          <ChoiceButton
            key={planSlug}
            active={value.planSlug === planSlug}
            label={planSlug === "starter" ? "LOGIVYA Plus" : "LOGIVYA Pro"}
            onPress={() => onChange({ ...value, planSlug })}
          />
        ))}
      </View>
      <Text style={[styles.detailLabel, { color: theme.muted }]}>
        {t("adminSubscriptions.billingPeriod")}
      </Text>
      <View style={styles.actionGrid}>
        {(["MONTHLY", "YEARLY"] as const).map((billingPeriod) => (
          <ChoiceButton
            key={billingPeriod}
            active={value.billingPeriod === billingPeriod}
            label={adminBillingPeriodLabel(billingPeriod, locale)}
            onPress={() => onChange({ ...value, billingPeriod })}
          />
        ))}
      </View>
      <View style={styles.dateRow}>
        <View style={styles.dateField}>
          <Text style={[styles.detailLabel, { color: theme.muted }]}>
            {t("adminSubscriptions.start")}
          </Text>
          <TextInput
            value={value.startsAt}
            onChangeText={(startsAt) => onChange({ ...value, startsAt })}
            placeholder="2026-07-13"
            placeholderTextColor={theme.muted}
            style={[
              styles.filterInput,
              {
                color: theme.text,
                borderColor: theme.border,
                backgroundColor: theme.background,
              },
            ]}
          />
        </View>
        <View style={styles.dateField}>
          <Text style={[styles.detailLabel, { color: theme.muted }]}>
            {t("adminSubscriptions.end")}
          </Text>
          <TextInput
            value={value.endsAt}
            onChangeText={(endsAt) => onChange({ ...value, endsAt })}
            placeholder="2026-08-13"
            placeholderTextColor={theme.muted}
            style={[
              styles.filterInput,
              {
                color: theme.text,
                borderColor: theme.border,
                backgroundColor: theme.background,
              },
            ]}
          />
        </View>
      </View>
      <Text style={[styles.detailLabel, { color: theme.muted }]}>
        {t("adminSubscriptions.paymentMethod")}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChips}
      >
        {(
          ["MANUAL_BANK_TRANSFER", "MANUAL", "FREE_PROMO", "OTHER"] as const
        ).map((paymentMethod) => {
          const active = value.paymentMethod === paymentMethod;
          return (
            <Pressable
              key={paymentMethod}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange({ ...value, paymentMethod })}
              style={[
                styles.choiceChip,
                {
                  borderColor: active ? theme.primary : theme.border,
                  backgroundColor: active ? theme.primary : theme.card,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusChipText,
                  { color: active ? theme.primaryText : theme.text },
                ]}
              >
                {adminPaymentMethodLabel(paymentMethod, locale)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <TextInput
        value={value.note}
        onChangeText={(note) => onChange({ ...value, note })}
        placeholder={t("adminSubscriptions.assignmentReasonPlaceholder")}
        placeholderTextColor={theme.muted}
        multiline
        style={[
          styles.actionReasonInput,
          {
            color: theme.text,
            borderColor: theme.border,
            backgroundColor: theme.background,
          },
        ]}
      />
      <TextInput
        value={password}
        onChangeText={onPasswordChange}
        placeholder={t("password")}
        placeholderTextColor={theme.muted}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.filterInput,
          {
            color: theme.text,
            borderColor: theme.border,
            backgroundColor: theme.background,
          },
        ]}
      />
      <Pressable
        accessibilityRole="button"
        disabled={saving || !password}
        onPress={onReauthenticate}
        style={[
          styles.actionButton,
          {
            backgroundColor: theme.badge,
            opacity: saving || !password ? 0.5 : 1,
          },
        ]}
      >
        <Text style={[styles.actionButtonText, { color: theme.text }]}>
          {t("confirm")}
        </Text>
      </Pressable>
      {notice ? (
        <Text
          style={[
            styles.notice,
            { color: theme.success, backgroundColor: theme.successSoft },
          ]}
        >
          {notice}
        </Text>
      ) : null}
      {!reviewOpen ? (
        <Pressable
          accessibilityRole="button"
          disabled={
            saving ||
            !elevated ||
            !value.companyId ||
            value.note.trim().length < 5
          }
          onPress={onReview}
          style={[
            styles.actionButton,
            {
              backgroundColor: theme.primary,
              opacity:
                saving ||
                !elevated ||
                !value.companyId ||
                value.note.trim().length < 5
                  ? 0.5
                  : 1,
            },
          ]}
        >
          <Text style={[styles.actionButtonText, { color: theme.primaryText }]}>
            {t("notifications.admin.previewAndPublish")}
          </Text>
        </Pressable>
      ) : (
        <View
          style={[
            styles.activationReview,
            { borderColor: theme.warning, backgroundColor: theme.warningSoft },
          ]}
        >
          <Text style={[styles.sourceTitle, { color: theme.text }]}>
            {t("notifications.admin.preview")}
          </Text>
          <Text style={[styles.sourceText, { color: theme.muted }]}>
            {t("adminSubscriptions.actionWarning")}
          </Text>
          <View style={styles.detailFields}>
            {[
              {
                label: t("adminSubscriptions.selectCompany"),
                value: `${selectedCompany?.name ?? value.companyId}${
                  selectedCompany?.email ? ` · ${selectedCompany.email}` : ""
                }`,
              },
              {
                label: t("adminSubscriptions.plan"),
                value: `${planLabel} · ${billingPeriodLabel}`,
              },
              {
                label: t("adminSubscriptions.billingPeriod"),
                value: `${value.startsAt} → ${value.endsAt}`,
              },
              {
                label: t("adminSubscriptions.paymentMethod"),
                value: adminPaymentMethodLabel(value.paymentMethod, locale),
              },
              {
                label: t("adminSubscriptions.actionReason"),
                value: value.note.trim(),
              },
            ].map((item) => (
              <View
                key={item.label}
                style={[styles.detailField, { borderBottomColor: theme.border }]}
              >
                <Text style={[styles.detailLabel, { color: theme.muted }]}>
                  {item.label}
                </Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
          <Text style={[styles.sourceText, { color: theme.text }]}>
            {`${t("notifications.admin.typeExactly")}: ${confirmationPhrase}`}
          </Text>
          <TextInput
            value={confirmation}
            onChangeText={onConfirmationChange}
            placeholder={confirmationPhrase}
            placeholderTextColor={theme.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.filterInput,
              {
                color: theme.text,
                borderColor: theme.border,
                backgroundColor: theme.background,
              },
            ]}
          />
          <View style={styles.actionGrid}>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={onCancelReview}
              style={[
                styles.moduleActionButton,
                { borderColor: theme.border, backgroundColor: theme.card },
              ]}
            >
              <Text style={[styles.actionButtonText, { color: theme.text }]}>
                {t("back")}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={
                saving ||
                !elevated ||
                confirmation.trim() !== confirmationPhrase
              }
              onPress={onSubmit}
              style={[
                styles.moduleActionButton,
                {
                  borderColor: theme.warning,
                  backgroundColor: theme.primary,
                  opacity:
                    saving ||
                    !elevated ||
                    confirmation.trim() !== confirmationPhrase
                      ? 0.5
                      : 1,
                },
              ]}
            >
              <Text
                style={[styles.actionButtonText, { color: theme.primaryText }]}
              >
                {t("adminSubscriptions.manualActivate")}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </SurfaceCard>
  );
}

function ChoiceButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.moduleActionButton,
        {
          borderColor: active ? theme.primary : theme.border,
          backgroundColor: active ? theme.primary : theme.card,
        },
      ]}
    >
      <Text
        style={[
          styles.actionButtonText,
          { color: active ? theme.primaryText : theme.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function AdminModuleDetail({
  item,
  moduleKey,
  actions,
  actionReason,
  adminPassword,
  saving,
  notice,
  elevated,
  locale,
  onReasonChange,
  onPasswordChange,
  onReauthenticate,
  onAction,
}: {
  item: AdminModuleItem;
  moduleKey: AdminModuleKey;
  actions: string[];
  actionReason: string;
  adminPassword: string;
  saving: boolean;
  notice: string | null;
  elevated: boolean;
  locale: ReturnType<typeof useTranslation>["locale"];
  onReasonChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onReauthenticate: () => void;
  onAction: (action: string) => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <SurfaceCard style={styles.supportPanel}>
      <Text style={[styles.sourceTitle, { color: theme.text }]}>
        {adminItemTitle(item, moduleKey, locale)}
      </Text>
      {item.subtitle ? (
        <Text style={[styles.sourceText, { color: theme.muted }]}>
          {adminItemSubtitle(item, moduleKey, locale)}
        </Text>
      ) : null}
      {item.status ? (
        <Badge label={adminStatusLabel(item.status, locale)} tone="default" />
      ) : null}
      <View style={styles.detailFields}>
        {Object.entries(item.fields).map(([key, value]) => (
          <View
            key={key}
            style={[styles.detailField, { borderBottomColor: theme.border }]}
          >
            <Text style={[styles.detailLabel, { color: theme.muted }]}>
              {adminFieldLabel(key, locale)}
            </Text>
            <Text
              style={[styles.detailValue, { color: theme.text }]}
              selectable
            >
              {formatAdminValue(value, locale)}
            </Text>
          </View>
        ))}
      </View>
      {notice ? (
        <Text
          style={[
            styles.notice,
            { color: theme.success, backgroundColor: theme.successSoft },
          ]}
        >
          {notice}
        </Text>
      ) : null}
      {actions.length ? (
        <>
          <Text style={[styles.detailLabel, { color: theme.muted }]}>
            {t("security")}
          </Text>
          <TextInput
            value={adminPassword}
            onChangeText={onPasswordChange}
            placeholder={t("password")}
            placeholderTextColor={theme.muted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.filterInput,
              {
                color: theme.text,
                borderColor: theme.border,
                backgroundColor: theme.background,
              },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            disabled={saving || !adminPassword}
            onPress={onReauthenticate}
            style={[
              styles.actionButton,
              {
                backgroundColor: theme.primary,
                opacity: saving || !adminPassword ? 0.5 : 1,
              },
            ]}
          >
            <Text
              style={[styles.actionButtonText, { color: theme.primaryText }]}
            >
              {t("confirm")}
            </Text>
          </Pressable>
          <TextInput
            value={actionReason}
            onChangeText={onReasonChange}
            placeholder={t("adminSubscriptions.actionReasonPlaceholder")}
            placeholderTextColor={theme.muted}
            multiline
            style={[
              styles.actionReasonInput,
              {
                color: theme.text,
                borderColor: theme.border,
                backgroundColor: theme.background,
              },
            ]}
          />
          <View style={styles.actionGrid}>
            {actions.map((action) => (
              <Pressable
                key={action}
                accessibilityRole="button"
                disabled={saving || !elevated}
                onPress={() => onAction(action)}
                style={[
                  styles.moduleActionButton,
                  {
                    borderColor: theme.border,
                    backgroundColor: destructiveAdminAction(action)
                      ? theme.dangerSoft
                      : theme.card,
                    opacity: saving || !elevated ? 0.5 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    {
                      color: destructiveAdminAction(action)
                        ? theme.danger
                        : theme.text,
                    },
                  ]}
                >
                  {adminActionLabel(action, locale)}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </SurfaceCard>
  );
}

function availableAdminActions(
  key: AdminModuleKey,
  item: AdminModuleItem,
  actions: string[],
) {
  const status = item.status?.toUpperCase() ?? "";
  if (key === "companies") {
    return actions.filter((action) =>
      status === "DISABLED" ? action === "REACTIVATE" : action === "SUSPEND",
    );
  }
  if (key === "users") {
    return actions.filter((action) =>
      status === "SUSPENDED" ? action !== "SUSPEND" : action !== "REACTIVATE",
    );
  }
  if (key === "subscriptions") {
    if (["ACTIVE", "TRIALING"].includes(status))
      return actions.filter((action) => ["SUSPEND", "CANCEL"].includes(action));
    if (status === "SUSPENDED")
      return actions.filter((action) =>
        ["REACTIVATE", "CANCEL"].includes(action),
      );
    return actions.filter((action) => action === "ACTIVATE");
  }
  if (key === "payments") {
    return status === "PENDING" ? actions : [];
  }
  if (key === "trialRisk") {
    return ["PENDING_IDENTITY", "INELIGIBLE", "BLOCKED"].includes(status)
      ? actions
      : [];
  }
  if (key === "security") {
    if (status === "OPEN") return actions;
    if (status === "ACKNOWLEDGED")
      return actions.filter((action) => action !== "ACKNOWLEDGED");
    return [];
  }
  if (key === "systemHealth" && status === "RESOLVED") {
    return [];
  }
  return actions;
}

function extractStats(
  data: AdminModuleViewData | null,
  locale: ReturnType<typeof useTranslation>["locale"],
): Stat[] {
  if (!data) return [];
  return Object.entries(data.metrics)
    .filter(
      ([, value]) =>
        typeof value === "number" ||
        typeof value === "string" ||
        typeof value === "boolean",
    )
    .map(([key, value]) => ({
      key,
      label: adminFieldLabel(key, locale),
      value: formatAdminValue(value, locale),
    }));
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
      subtitle: [
        maskEmailForSummary(ticket.createdBy?.email),
        ticket.company?.name,
        ticket.category || ticket.type,
      ]
        .filter(Boolean)
        .join(" · "),
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
    pagination: {
      page: 1,
      limit: 30,
      total: result.tickets.length,
      pages: result.pageInfo.hasMore ? 2 : 1,
      nextPage: result.pageInfo.hasMore ? 2 : null,
    },
    capabilities: {
      search: true,
      filters: ["status", "priority", "unread"],
      actions: ["REPLY", "STATUS", "PRIORITY"],
      readOnly: false,
    },
  };
}

const ADMIN_LOCALIZED_STATUS_VALUES = new Set([
  "ACTIVE",
  "INACTIVE",
  "ENABLED",
  "DISABLED",
  "CONNECTED",
  "CONNECTING",
  "DISCONNECTED",
  "RECONNECT_REQUIRED",
  "FAILED",
  "COMPLETED",
  "CANCELED",
  "CANCELLED",
  "SUSPENDED",
  "TRIALING",
  "EXPIRED",
  "PENDING",
  "PAID",
  "SUCCEEDED",
  "REFUNDED",
  "READ",
  "UNREAD",
  "REQUESTED",
  "VERIFYING",
  "PROCESSING",
  "REJECTED",
  "PENDING_PAYMENT",
  "PAYMENT_REVIEW",
  "AWAITING_PAYMENT",
  "UNDER_REVIEW",
  "APPROVED",
  "ACTIVATED",
  "CLARIFICATION_REQUIRED",
  "HEALTHY",
  "DEGRADED",
  "UNAVAILABLE",
  "UNKNOWN",
  "CONFIGURED",
  "RUNBOOK_ONLY",
  "DOCUMENTED",
  "ARCHIVED",
  "OPEN",
  "ACKNOWLEDGED",
  "INVESTIGATING",
  "MITIGATED",
  "RESOLVED",
  "MAINTENANCE",
  "UNDER_INVESTIGATION",
  "INVITED",
  "DRAFT",
  "ISSUED",
  "MANUAL_PENDING",
  "QUEUED",
  "SCHEDULED",
  "SENDING",
  "DISMISSED",
  "CONSUMED",
  "INELIGIBLE",
  "BLOCKED",
  "PAID_USAGE",
  "RECEIVED",
  "IDENTITY_VERIFICATION_REQUIRED",
  "IN_REVIEW",
  "WAITING_FOR_USER",
  "PARTIALLY_APPROVED",
  "CLOSED",
  "VALIDATING",
  "BUILT",
  "SUBMITTED",
  "ROLLING_OUT",
  "ROLLED_BACK",
  "CONFIGURED_UNVERIFIED",
  "INCOMPLETE",
  "NOT_CONFIGURED",
  "NOT_RECORDED",
  "SCRIPTED",
  "PASSED",
]);

function adminItemTitle(
  item: AdminModuleItem,
  moduleKey: AdminModuleKey,
  locale: ReturnType<typeof useTranslation>["locale"],
) {
  if (moduleKey === "settings") return adminSettingsTitle(item.id, item.title, locale);
  if (["dashboard", "security", "audit", "activity"].includes(moduleKey)) return adminEventTitle(item.title, locale);
  if (moduleKey === "notifications") return adminEventTypeLabel(item.title, locale);
  return item.title;
}

function adminItemSubtitle(
  item: AdminModuleItem,
  _moduleKey: AdminModuleKey,
  _locale: ReturnType<typeof useTranslation>["locale"],
) {
  return item.subtitle;
}

function adminFieldLabel(
  key: string,
  locale: ReturnType<typeof useTranslation>["locale"],
) {
  if (key.startsWith("status_")) {
    return adminStatusLabel(key.slice("status_".length), locale);
  }
  return adminPresentationLabel(key, locale);
}

function formatAdminValue(
  value: string | number | boolean | null,
  locale: ReturnType<typeof useTranslation>["locale"],
) {
  if (value === null || value === "") return "-";
  if (typeof value === "boolean") return adminBooleanLabel(value, locale);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value))
    return formatDateTime(value, locale);
  if (typeof value === "string" && ADMIN_LOCALIZED_STATUS_VALUES.has(value))
    return adminStatusLabel(value, locale);
  return typeof value === "string"
    ? adminValueLabel(value, locale)
    : formatNumber(value, locale, { maximumFractionDigits: 2 });
}

function maskEmailForSummary(value: string | null | undefined) {
  if (!value) return null;
  const separator = value.lastIndexOf("@");
  if (separator <= 0 || separator >= value.length - 1) return "•••";
  const local = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  const dot = domain.lastIndexOf(".");
  const domainName = dot > 0 ? domain.slice(0, dot) : domain;
  const suffix = dot > 0 ? domain.slice(dot) : "";
  return `${local.slice(0, 1)}•••@${domainName.slice(0, 1)}•••${suffix}`;
}

function adminStatusLabel(
  status: string,
  locale: ReturnType<typeof useTranslation>["locale"],
) {
  return translatedAdminStatusLabel(status, locale);
}

function adminActionLabel(
  action: string,
  locale: ReturnType<typeof useTranslation>["locale"],
) {
  return translatedAdminActionLabel(action, locale);
}

function destructiveAdminAction(action: string) {
  return [
    "SUSPEND",
    "CANCEL",
    "REJECT",
    "FORCE_LOGOUT",
    "RESET_MFA",
    "BLOCK",
  ].includes(action);
}

function localizeReadOnlyReason(
  reason: string,
  locale: ReturnType<typeof useTranslation>["locale"],
) {
  void reason;
  return locale === "tr" ? "Bu bölümde kayıtları ve ayrıntıları görüntüleyebilirsiniz. Düzenleme işlemleri ilgili yönetim bölümünden, yetkiniz kapsamında yapılır." : "You can view records and details here. Editing is available in the relevant management section according to your permissions.";
}

function adminPaymentMethodLabel(
  method: string,
  locale: ReturnType<typeof useTranslation>["locale"],
) {
  return translatedAdminPaymentMethodLabel(method, locale);
}

function manualSubscriptionConfirmationPhrase(companyId: string) {
  return `ACTIVATE ${companyId}`;
}

function prepareManualSubscription(
  value: ManualAdminSubscriptionInput,
  locale: ReturnType<typeof useTranslation>["locale"],
) {
  const startsAt = new Date(`${value.startsAt}T00:00:00.000Z`);
  const endsAt = new Date(`${value.endsAt}T23:59:59.999Z`);
  const invalid =
    !value.companyId ||
    value.note.trim().length < 5 ||
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt <= startsAt;
  return {
    startsAt,
    endsAt,
    error: invalid ? translate(locale, "adminSubscriptions.validationError") : null,
  };
}

function defaultManualSubscription(): ManualAdminSubscriptionInput {
  const startsAt = new Date();
  const endsAt = new Date(startsAt);
  const originalDay = endsAt.getUTCDate();
  endsAt.setUTCDate(1);
  endsAt.setUTCMonth(endsAt.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(endsAt.getUTCFullYear(), endsAt.getUTCMonth() + 1, 0),
  ).getUTCDate();
  endsAt.setUTCDate(Math.min(originalDay, lastDay));
  return {
    companyId: "",
    planSlug: "professional",
    billingPeriod: "MONTHLY",
    startsAt: startsAt.toISOString().slice(0, 10),
    endsAt: endsAt.toISOString().slice(0, 10),
    currency: "TRY",
    paymentMethod: "FREE_PROMO",
    note: "",
  };
}

function supportStatusLabel(
  status: string,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (status === "OPEN") return t("supportOpen");
  if (status === "IN_PROGRESS") return t("supportInProgress");
  if (status === "WAITING_FOR_USER" || status === "ANSWERED")
    return t("supportWaitingForUser");
  if (status === "WAITING_FOR_ADMIN" || status === "PENDING")
    return t("supportWaitingForAdmin");
  if (status === "CLOSED") return t("supportClosed");
  if (status === "RESOLVED") return t("supportResolved");
  return status;
}

function supportPriorityLabel(
  priority: string,
  locale: ReturnType<typeof useTranslation>["locale"],
) {
  return adminPriorityLabel(priority, locale);
}

function supportSenderLabel(
  senderType: string,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (senderType === "ADMIN") return t("adminReply");
  if (senderType === "USER" || senderType === "CUSTOMER")
    return t("userMessage");
  return t("systemMessage");
}

function isAdminStepUpError(error: unknown) {
  return (
    error instanceof ApiRequestError &&
    (error.status === 428 ||
      error.code === "ADMIN_RECENT_AUTH_REQUIRED" ||
      error.code === "RECENT_AUTHENTICATION_REQUIRED")
  );
}

function adminStepUpRequiredMessage(
  locale: ReturnType<typeof useTranslation>["locale"],
) {
  return translate(locale, "mfaChallengeExpiredError");
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    }),
  ]);
}

const styles = StyleSheet.create({
  moduleButton: { minHeight: 46, padding: 12, borderWidth: 1, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  metricCard: { flexBasis: "46%", flexGrow: 1, borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  screen: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  content: {
    gap: 16,
    paddingBottom: 32,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  supportFilters: {
    gap: 10,
  },
  subscriptionRequestSearchRow: {
    alignItems: "stretch",
    gap: 8,
  },
  subscriptionRequestSearchInput: {
    width: "100%",
  },
  filterInput: {
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  filterChips: {
    gap: 8,
  },
  choiceChip: {
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 220,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  sourceCard: {
    gap: 6,
  },
  sourceTitle: {
    fontSize: 15,
    fontWeight: "900",
  },
  sourceText: {
    fontSize: 13,
    lineHeight: 19,
  },
  refreshStamp: {
    fontSize: 12,
    fontWeight: "700",
  },
  rows: {
    gap: 10,
  },
  rowCard: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  rowCardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  rowText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "900",
  },
  rowSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  supportPanel: {
    gap: 14,
  },
  activationReview: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  paginationRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  pageButton: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  pageLabel: {
    fontSize: 13,
    fontWeight: "800",
  },
  detailFields: {
    gap: 2,
  },
  detailField: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingVertical: 10,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  detailValue: {
    fontSize: 14,
    lineHeight: 20,
  },
  actionReasonInput: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    minHeight: 84,
    padding: 12,
    textAlignVertical: "top",
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  dateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  dateField: {
    flexGrow: 1,
    flexBasis: 140,
    gap: 6,
  },
  moduleActionButton: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 46,
    minWidth: 132,
    paddingHorizontal: 12,
  },
  notice: {
    borderRadius: 8,
    fontSize: 13,
    fontWeight: "800",
    padding: 12,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: "900",
  },
  actionButton: {
    alignItems: "center",
    borderRadius: 8,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "900",
  },
  thread: {
    gap: 10,
  },
  messageBubble: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  messageRole: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  messageBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageDate: {
    fontSize: 11,
    fontWeight: "700",
  },
  replyInput: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 110,
    padding: 14,
    textAlignVertical: "top",
  },
  internalNoteToggle: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
});
