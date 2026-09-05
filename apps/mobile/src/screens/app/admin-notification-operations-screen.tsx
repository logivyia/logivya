import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";

import { ApiRequestError } from "@/api/api-errors";
import {
  cancelAdminNotificationAnnouncement,
  createAdminNotificationAnnouncement,
  getAdminNotificationAnnouncements,
  getAdminNotificationDeadLetters,
  getAdminNotificationDeliveries,
  getAdminNotificationEvents,
  getAdminNotificationProviders,
  getAdminNotificationTemplates,
  previewAdminNotificationAnnouncement,
  publishAdminNotificationAnnouncement,
  retryAdminNotificationDeadLetter,
  testAdminNotificationTemplate,
  type AdminNotificationAnnouncement,
  type AdminNotificationDeadLetter,
  type AdminNotificationDelivery,
  type AdminNotificationEvent,
  type AdminNotificationPageInfo,
  type AdminNotificationProviderResponse,
  type AdminNotificationTemplate,
  type NotificationAdminTab,
} from "@/api/mobileNotificationAdmin";
import {
  canManageAdminModule,
  canReadAdminModule,
  reauthenticatePlatformAdmin,
} from "@/api/mobileAdmin";
import { useAuthStore } from "@/auth/auth-store";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import {
  Badge,
  Chip,
  PageHeader,
  SectionTitle,
  StatCard,
  SurfaceCard,
} from "@/components/ui";
import { formatDateTime } from "@/i18n/format";
import {
  adminAudienceLabel,
  adminCategoryLabel,
  adminChannelLabel,
  adminEventTypeLabel,
  adminStatusLabel,
} from "@/i18n/admin-labels";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { MoreStackParamList } from "@/types/navigation";

type ScreenRoute = RouteProp<
  MoreStackParamList,
  "AdminNotificationOperations"
>;
type AnnouncementPreview = Awaited<
  ReturnType<typeof previewAdminNotificationAnnouncement>
>;
type Channel = "IN_APP" | "EMAIL" | "ANDROID_PUSH" | "WEB_PUSH";
type PaginatedNotificationTab = "events" | "deliveries" | "deadLetters";

const tabs: NotificationAdminTab[] = [
  "dashboard",
  "events",
  "deliveries",
  "deadLetters",
  "templates",
  "announcements",
  "providers",
];
const channels: Channel[] = ["IN_APP", "EMAIL", "ANDROID_PUSH", "WEB_PUSH"];

export function AdminNotificationOperationsScreen() {
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const { params } = useRoute<ScreenRoute>();
  const isPlatformAdmin = useAuthStore((state) => state.isPlatformAdmin);
  const adminPermissions = useAuthStore((state) => state.adminPermissions);
  const canRead =
    isPlatformAdmin && canReadAdminModule("notifications", adminPermissions);
  const canManage =
    isPlatformAdmin && canManageAdminModule("notifications", adminPermissions);
  const copy = useMemo(() => labels(t), [t]);
  const [tab, setTab] = useState<NotificationAdminTab>(
    params?.initialTab ?? "dashboard",
  );
  const [events, setEvents] = useState<AdminNotificationEvent[]>([]);
  const [deliveries, setDeliveries] = useState<AdminNotificationDelivery[]>([]);
  const [deadLetters, setDeadLetters] = useState<AdminNotificationDeadLetter[]>(
    [],
  );
  const [eventPageInfo, setEventPageInfo] = useState<AdminNotificationPageInfo>(
    { hasMore: false, nextCursor: null },
  );
  const [deliveryPageInfo, setDeliveryPageInfo] =
    useState<AdminNotificationPageInfo>({ hasMore: false, nextCursor: null });
  const [deadLetterPageInfo, setDeadLetterPageInfo] =
    useState<AdminNotificationPageInfo>({ hasMore: false, nextCursor: null });
  const [templates, setTemplates] = useState<AdminNotificationTemplate[]>([]);
  const [announcements, setAnnouncements] = useState<
    AdminNotificationAnnouncement[]
  >([]);
  const [providers, setProviders] =
    useState<AdminNotificationProviderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingMoreTab, setLoadingMoreTab] =
    useState<PaginatedNotificationTab | null>(null);
  const [notificationLoadError, setNotificationLoadError] = useState<
    string | null
  >(null);
  const [notificationLoadMoreError, setNotificationLoadMoreError] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>([
    "IN_APP",
    "ANDROID_PUSH",
  ]);
  const [draft, setDraft] = useState<AdminNotificationAnnouncement | null>(
    null,
  );
  const [preview, setPreview] = useState<AnnouncementPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [secondConfirmation, setSecondConfirmation] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [cancelTarget, setCancelTarget] =
    useState<AdminNotificationAnnouncement | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelConfirmation, setCancelConfirmation] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [elevatedUntil, setElevatedUntil] = useState<string | null>(null);
  const notificationLoadRequestRef = useRef(0);
  const notificationLoadMoreRequestRef = useRef(0);
  const elevated = Boolean(
    elevatedUntil && Date.parse(elevatedUntil) > Date.now(),
  );
  const canMutate = canManage && elevated;

  useEffect(() => {
    if (!elevatedUntil) return;
    const remainingMs = Date.parse(elevatedUntil) - Date.now();
    if (remainingMs <= 0) {
      setElevatedUntil(null);
      return;
    }
    const timeout = setTimeout(() => setElevatedUntil(null), remainingMs + 50);
    return () => clearTimeout(timeout);
  }, [elevatedUntil]);

  useEffect(() => {
    if (params?.initialTab) setTab(params.initialTab);
  }, [params?.initialTab]);

  const load = useCallback(
    async (refresh = false) => {
      if (!canRead) return;
      const requestId = ++notificationLoadRequestRef.current;
      notificationLoadMoreRequestRef.current += 1;
      setLoadingMoreTab(null);
      if (refresh) setRefreshing(true);
      else {
        setLoading(true);
        setRefreshing(false);
      }
      setNotificationLoadError(null);
      setNotificationLoadMoreError(null);
      try {
        if (tab === "events") {
          const response = await getAdminNotificationEvents();
          if (requestId !== notificationLoadRequestRef.current) return;
          setEvents(response.events);
          setEventPageInfo(response.pageInfo);
        } else if (tab === "deliveries") {
          const response = await getAdminNotificationDeliveries();
          if (requestId !== notificationLoadRequestRef.current) return;
          setDeliveries(response.deliveries);
          setDeliveryPageInfo(response.pageInfo);
        } else if (tab === "deadLetters") {
          const response = await getAdminNotificationDeadLetters();
          if (requestId !== notificationLoadRequestRef.current) return;
          setDeadLetters(response.deadLetters);
          setDeadLetterPageInfo(response.pageInfo);
        } else if (tab === "templates") {
          const response = await getAdminNotificationTemplates();
          if (requestId !== notificationLoadRequestRef.current) return;
          setTemplates(response.templates);
        } else if (tab === "announcements") {
          const response = await getAdminNotificationAnnouncements();
          if (requestId !== notificationLoadRequestRef.current) return;
          setAnnouncements(response.announcements);
        } else if (tab === "providers") {
          const response = await getAdminNotificationProviders();
          if (requestId !== notificationLoadRequestRef.current) return;
          setProviders(response);
        } else {
          const [
            eventResponse,
            deliveryResponse,
            deadLetterResponse,
            providerResponse,
          ] = await Promise.all([
            getAdminNotificationEvents(),
            getAdminNotificationDeliveries(),
            getAdminNotificationDeadLetters(),
            getAdminNotificationProviders(),
          ]);
          if (requestId !== notificationLoadRequestRef.current) return;
          setEvents(eventResponse.events);
          setEventPageInfo(eventResponse.pageInfo);
          setDeliveries(deliveryResponse.deliveries);
          setDeliveryPageInfo(deliveryResponse.pageInfo);
          setDeadLetters(deadLetterResponse.deadLetters);
          setDeadLetterPageInfo(deadLetterResponse.pageInfo);
          setProviders(providerResponse);
        }
      } catch {
        if (requestId !== notificationLoadRequestRef.current) return;
        setNotificationLoadError(copy.loadFailed);
      } finally {
        if (requestId !== notificationLoadRequestRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canRead, copy.loadFailed, tab],
  );

  const reauthenticate = async () => {
    if (!adminPassword || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await reauthenticatePlatformAdmin(adminPassword);
      setAdminPassword("");
      setElevatedUntil(response.expiresAt);
    } catch {
      setError(copy.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (elevatedUntil && Date.parse(elevatedUntil) <= Date.now()) {
        setElevatedUntil(null);
      }
      void load();
      return () => {
        notificationLoadRequestRef.current += 1;
        notificationLoadMoreRequestRef.current += 1;
      };
    }, [elevatedUntil, load]),
  );

  const loadMore = useCallback(
    async (target: PaginatedNotificationTab) => {
      if (!canRead || loadingMoreTab) return;
      const pageInfo =
        target === "events"
          ? eventPageInfo
          : target === "deliveries"
            ? deliveryPageInfo
            : deadLetterPageInfo;
      if (!pageInfo.hasMore || !pageInfo.nextCursor) return;

      const cursor = pageInfo.nextCursor;
      const parentRequestId = notificationLoadRequestRef.current;
      const requestId = ++notificationLoadMoreRequestRef.current;
      setLoadingMoreTab(target);
      setNotificationLoadMoreError(null);
      try {
        if (target === "events") {
          const response = await getAdminNotificationEvents(cursor);
          if (
            requestId !== notificationLoadMoreRequestRef.current ||
            parentRequestId !== notificationLoadRequestRef.current
          )
            return;
          setEvents((current) => appendUniqueById(current, response.events));
          setEventPageInfo(response.pageInfo);
        } else if (target === "deliveries") {
          const response = await getAdminNotificationDeliveries(
            undefined,
            cursor,
          );
          if (
            requestId !== notificationLoadMoreRequestRef.current ||
            parentRequestId !== notificationLoadRequestRef.current
          )
            return;
          setDeliveries((current) =>
            appendUniqueById(current, response.deliveries),
          );
          setDeliveryPageInfo(response.pageInfo);
        } else {
          const response = await getAdminNotificationDeadLetters(cursor);
          if (
            requestId !== notificationLoadMoreRequestRef.current ||
            parentRequestId !== notificationLoadRequestRef.current
          )
            return;
          setDeadLetters((current) =>
            appendUniqueById(current, response.deadLetters),
          );
          setDeadLetterPageInfo(response.pageInfo);
        }
      } catch {
        if (
          requestId !== notificationLoadMoreRequestRef.current ||
          parentRequestId !== notificationLoadRequestRef.current
        )
          return;
        setNotificationLoadMoreError(copy.loadMoreFailed);
      } finally {
        if (requestId !== notificationLoadMoreRequestRef.current) return;
        setLoadingMoreTab((current) => (current === target ? null : current));
      }
    },
    [
      canRead,
      copy.loadMoreFailed,
      deadLetterPageInfo,
      deliveryPageInfo,
      eventPageInfo,
      loadingMoreTab,
    ],
  );

  const handleMutationError = (caught: unknown, fallback: string) => {
    if (isAdminStepUpError(caught)) {
      setElevatedUntil(null);
      setError(copy.unlockExpired);
      return;
    }
    setError(fallback);
  };

  const retryDeadLetter = async (item: AdminNotificationDeadLetter) => {
    if (!canMutate) return;
    setSaving(true);
    setError(null);
    try {
      await retryAdminNotificationDeadLetter(
        item.id,
        "Authorized mobile administrator retry",
      );
      Alert.alert(copy.success, copy.retryQueued);
      await load(true);
    } catch (caught) {
      handleMutationError(caught, copy.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  const testTemplate = async (item: AdminNotificationTemplate) => {
    if (!canMutate) return;
    setSaving(true);
    setError(null);
    try {
      await testAdminNotificationTemplate(
        item.id,
        "Controlled self-test requested by an authenticated administrator",
      );
      Alert.alert(copy.success, copy.testSent);
    } catch (caught) {
      handleMutationError(caught, copy.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  const createDraft = async () => {
    if (!canMutate) return;
    if (!title.trim() || !body.trim() || selectedChannels.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const response = await createAdminNotificationAnnouncement({
        title: title.trim(),
        body: body.trim(),
        audience: "PLATFORM_ALL_USERS",
        locale,
        channels: selectedChannels,
        priority: "NORMAL",
      });
      setDraft(response.announcement);
      setPreview(null);
      setConfirmation("");
      setSecondConfirmation("");
      setActionReason("");
      Alert.alert(copy.success, copy.draftCreated);
      setAnnouncements(
        (await getAdminNotificationAnnouncements()).announcements,
      );
    } catch (caught) {
      handleMutationError(caught, copy.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  const previewDraft = async (item: AdminNotificationAnnouncement) => {
    if (!canMutate) return;
    setSaving(true);
    setError(null);
    try {
      setDraft(item);
      setPreview(await previewAdminNotificationAnnouncement(item.id));
      setConfirmation("");
      setSecondConfirmation("");
      setActionReason("");
    } catch (caught) {
      handleMutationError(caught, copy.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  const publishDraft = async () => {
    if (!canMutate) return;
    if (!draft || !preview) return;
    if (actionReason.trim().length < 5) {
      setError(copy.reasonRequired);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await publishAdminNotificationAnnouncement(draft.id, {
        previewHash: preview.previewHash,
        confirmation: confirmation.trim(),
        ...(preview.requiresSecondConfirmation
          ? { secondConfirmation: secondConfirmation.trim() }
          : {}),
        reason: actionReason.trim(),
      });
      Alert.alert(copy.success, copy.published);
      resetComposer();
      await load(true);
    } catch (caught) {
      handleMutationError(caught, copy.confirmationFailed);
    } finally {
      setSaving(false);
    }
  };

  const beginCancelAnnouncement = (item: AdminNotificationAnnouncement) => {
    if (!canMutate) return;
    setError(null);
    setCancelTarget(item);
    setCancelReason("");
    setCancelConfirmation("");
  };

  const cancelAnnouncement = async () => {
    if (!canMutate) return;
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 5) {
      setError(copy.reasonRequired);
      return;
    }
    if (cancelConfirmation.trim() !== `CANCEL ${cancelTarget.id}`) {
      setError(copy.cancelConfirmationFailed);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await cancelAdminNotificationAnnouncement(
        cancelTarget.id,
        cancelReason.trim(),
      );
      Alert.alert(copy.success, copy.canceled);
      if (draft?.id === cancelTarget.id) resetComposer();
      resetCancellation();
      await load(true);
    } catch (caught) {
      handleMutationError(caught, copy.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  function resetComposer() {
    setTitle("");
    setBody("");
    setDraft(null);
    setPreview(null);
    setConfirmation("");
    setSecondConfirmation("");
    setActionReason("");
  }

  function resetCancellation() {
    setCancelTarget(null);
    setCancelReason("");
    setCancelConfirmation("");
  }

  const showNotificationContent = !loading && !notificationLoadError;

  if (!canRead)
    return (
      <Screen>
        <ErrorState title={copy.forbidden} onRetry={() => undefined} />
      </Screen>
    );

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={theme.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          eyebrow={copy.admin}
          title={copy.title}
          description={copy.description}
        />
        {canManage && !elevated ? (
          <SurfaceCard style={styles.card}>
            <DetailText strong>{copy.unlockTitle}</DetailText>
            <DetailText muted>{copy.unlockDescription}</DetailText>
            <TextInput
              value={adminPassword}
              onChangeText={setAdminPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={copy.password}
              placeholderTextColor={theme.muted}
              style={[
                styles.input,
                { borderColor: theme.border, color: theme.text },
              ]}
            />
            <PrimaryButton
              title={copy.unlock}
              loading={saving}
              disabled={!adminPassword}
              onPress={() => void reauthenticate()}
            />
          </SurfaceCard>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {tabs.map((item) => (
            <Chip
              key={item}
              label={copy.tabs[item]}
              active={tab === item}
              onPress={() => setTab(item)}
            />
          ))}
        </ScrollView>

        {notificationLoadError ? (
          <ErrorState
            title={notificationLoadError}
            onRetry={() => void load()}
          />
        ) : null}
        {error ? (
          <ErrorState title={error} onRetry={() => void load()} />
        ) : null}
        {loading ? (
          <Text style={[styles.muted, { color: theme.muted }]}>
            {copy.loading}
          </Text>
        ) : null}
        {showNotificationContent && notificationLoadMoreError ? (
          <ErrorState
            title={notificationLoadMoreError}
            onRetry={() => {
              if (
                tab === "events" ||
                tab === "deliveries" ||
                tab === "deadLetters"
              )
                void loadMore(tab);
            }}
          />
        ) : null}
        {showNotificationContent && tab === "dashboard" ? (
          <Dashboard
            copy={copy}
            events={events}
            deliveries={deliveries}
            deadLetters={deadLetters}
            providers={providers}
          />
        ) : null}
        {showNotificationContent && tab === "events" ? (
          <EventList
            copy={copy}
            locale={locale}
            items={events}
            hasMore={eventPageInfo.hasMore && Boolean(eventPageInfo.nextCursor)}
            loadingMore={loadingMoreTab === "events"}
            onLoadMore={() => void loadMore("events")}
          />
        ) : null}
        {showNotificationContent && tab === "deliveries" ? (
          <DeliveryList
            copy={copy}
            locale={locale}
            items={deliveries}
            hasMore={
              deliveryPageInfo.hasMore && Boolean(deliveryPageInfo.nextCursor)
            }
            loadingMore={loadingMoreTab === "deliveries"}
            onLoadMore={() => void loadMore("deliveries")}
          />
        ) : null}
        {showNotificationContent && tab === "deadLetters" ? (
          <DeadLetterList
            canManage={canMutate}
            copy={copy}
            locale={locale}
            items={deadLetters}
            hasMore={
              deadLetterPageInfo.hasMore &&
              Boolean(deadLetterPageInfo.nextCursor)
            }
            loadingMore={loadingMoreTab === "deadLetters"}
            saving={saving}
            onLoadMore={() => void loadMore("deadLetters")}
            onRetry={retryDeadLetter}
          />
        ) : null}
        {showNotificationContent && tab === "templates" ? (
          <TemplateList
            canManage={canMutate}
            copy={copy}
            locale={locale}
            items={templates}
            saving={saving}
            onTest={testTemplate}
          />
        ) : null}
        {showNotificationContent && tab === "announcements" ? (
          <AnnouncementPanel
            canManage={canMutate}
            copy={copy}
            locale={locale}
            items={announcements}
            title={title}
            body={body}
            channels={selectedChannels}
            draft={draft}
            preview={preview}
            confirmation={confirmation}
            secondConfirmation={secondConfirmation}
            actionReason={actionReason}
            cancelTarget={cancelTarget}
            cancelReason={cancelReason}
            cancelConfirmation={cancelConfirmation}
            saving={saving}
            onTitle={setTitle}
            onBody={setBody}
            onToggleChannel={(channel) =>
              setSelectedChannels((current) =>
                current.includes(channel)
                  ? current.filter((item) => item !== channel)
                  : [...current, channel],
              )
            }
            onCreate={createDraft}
            onPreview={previewDraft}
            onConfirmation={setConfirmation}
            onSecondConfirmation={setSecondConfirmation}
            onActionReason={setActionReason}
            onCancelReason={setCancelReason}
            onCancelConfirmation={setCancelConfirmation}
            onPublish={publishDraft}
            onRequestCancel={beginCancelAnnouncement}
            onDismissCancel={resetCancellation}
            onConfirmCancel={cancelAnnouncement}
          />
        ) : null}
        {showNotificationContent && tab === "providers" ? (
          <ProviderList copy={copy} providers={providers} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Dashboard({
  copy,
  events,
  deliveries,
  deadLetters,
  providers,
}: {
  copy: Copy;
  events: AdminNotificationEvent[];
  deliveries: AdminNotificationDelivery[];
  deadLetters: AdminNotificationDeadLetter[];
  providers: AdminNotificationProviderResponse | null;
}) {
  const recentEvents = events.slice(0, 50);
  const recentDeliveries = deliveries.slice(0, 50);
  const recentDeadLetters = deadLetters.slice(0, 50);
  const delivered = recentDeliveries.filter(
    (item) => item.status === "DELIVERED",
  ).length;
  const failed = recentDeliveries.filter((item) =>
    ["FAILED", "DEAD_LETTERED"].includes(item.status),
  ).length;
  const activeDevices = Object.values(providers?.providers ?? {}).reduce(
    (sum, provider) =>
      sum +
      (typeof provider.activeDevices === "number" ? provider.activeDevices : 0),
    0,
  );
  return (
    <View style={styles.grid}>
      <DetailText muted>{copy.dashboardWindow}</DetailText>
      <StatCard
        label={copy.eventCount}
        value={recentEvents.length}
        icon="flash-outline"
      />
      <StatCard
        label={copy.deliveryRate}
        value={
          recentDeliveries.length
            ? `${Math.round((delivered / recentDeliveries.length) * 100)}%`
            : "-"
        }
        icon="checkmark-circle-outline"
        tone="success"
      />
      <StatCard
        label={copy.failures}
        value={failed}
        icon="warning-outline"
        tone={failed ? "danger" : "success"}
      />
      <StatCard
        label={copy.deadLetters}
        value={recentDeadLetters.length}
        icon="archive-outline"
        tone={recentDeadLetters.length ? "warning" : "success"}
      />
      <StatCard
        label={copy.activeDevices}
        value={activeDevices}
        icon="phone-portrait-outline"
      />
    </View>
  );
}

function EventList({
  copy,
  locale,
  items,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  copy: Copy;
  locale: Locale;
  items: AdminNotificationEvent[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (!items.length)
    return <EmptyState title={copy.empty} description={copy.noEvents} />;
  return (
    <View style={styles.list}>
      {items.map((item) => (
        <SurfaceCard key={item.id} style={styles.card}>
          <View style={styles.row}>
            <DetailText strong style={styles.flex}>
              {adminEventTypeLabel(item.type, locale)}
            </DetailText>
            <Badge
              label={adminStatusLabel(item.status, locale)}
              tone={item.status === "PROCESSED" ? "success" : "default"}
            />
          </View>
          <DetailText>{adminCategoryLabel(item.category, locale)}</DetailText>
          <DetailText muted>
            {item.company?.name ?? copy.platform} ·{" "}
            {item.actor?.email ?? copy.system}
          </DetailText>
          <DetailText muted>
            {copy.recipients}: {item._count.notifications} · {copy.deliveries}:{" "}
            {item._count.deliveries}
          </DetailText>
          <DetailText muted>
            {formatDateTime(item.occurredAt, locale)}
          </DetailText>
        </SurfaceCard>
      ))}
      {hasMore ? (
        <PrimaryButton
          title={copy.loadMore}
          loading={loadingMore}
          onPress={onLoadMore}
        />
      ) : null}
    </View>
  );
}

function DeliveryList({
  copy,
  locale,
  items,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  copy: Copy;
  locale: Locale;
  items: AdminNotificationDelivery[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (!items.length)
    return <EmptyState title={copy.empty} description={copy.noDeliveries} />;
  return (
    <View style={styles.list}>
      {items.map((item) => (
        <SurfaceCard key={item.id} style={styles.card}>
          <View style={styles.row}>
            <DetailText strong style={styles.flex}>
              {adminEventTypeLabel(item.event.type, locale)}
            </DetailText>
            <Badge
              label={adminStatusLabel(item.status, locale)}
              tone={
                item.status === "DELIVERED"
                  ? "success"
                  : item.status === "FAILED"
                    ? "danger"
                    : "warning"
              }
            />
          </View>
          <DetailText>
            {adminChannelLabel(item.channel, locale)} ·{" "}
            {item.provider ?? copy.providerPending}
          </DetailText>
          <DetailText muted>
            {item.company?.name ?? copy.platform} · {item.user?.email ?? "-"}
          </DetailText>
          <DetailText muted>
            {copy.attempts}: {item.attemptCount} /{" "}
            {formatDateTime(item.createdAt, locale)}
          </DetailText>
        </SurfaceCard>
      ))}
      {hasMore ? (
        <PrimaryButton
          title={copy.loadMore}
          loading={loadingMore}
          onPress={onLoadMore}
        />
      ) : null}
    </View>
  );
}

function DeadLetterList({
  canManage,
  copy,
  locale,
  items,
  hasMore,
  loadingMore,
  saving,
  onLoadMore,
  onRetry,
}: {
  canManage: boolean;
  copy: Copy;
  locale: Locale;
  items: AdminNotificationDeadLetter[];
  hasMore: boolean;
  loadingMore: boolean;
  saving: boolean;
  onLoadMore: () => void;
  onRetry: (item: AdminNotificationDeadLetter) => void;
}) {
  if (!items.length)
    return <EmptyState title={copy.empty} description={copy.noDeadLetters} />;
  return (
    <View style={styles.list}>
      {items.map((item) => (
        <SurfaceCard key={item.id} style={styles.card}>
          <View style={styles.row}>
            <DetailText strong style={styles.flex}>
              {adminEventTypeLabel(item.event.type, locale)}
            </DetailText>
            <Badge
              label={adminChannelLabel(item.channel, locale)}
              tone="danger"
            />
          </View>
          <DetailText>
            {copy.safeFailure}: {item.errorCode}
          </DetailText>
          <DetailText muted>
            {copy.attempts}: {item.attemptCount} ·{" "}
            {formatDateTime(item.deadLetteredAt, locale)}
          </DetailText>
          {canManage ? (
            <SmallButton
              label={copy.retry}
              disabled={saving}
              onPress={() => onRetry(item)}
            />
          ) : null}
        </SurfaceCard>
      ))}
      {hasMore ? (
        <PrimaryButton
          title={copy.loadMore}
          loading={loadingMore}
          onPress={onLoadMore}
        />
      ) : null}
    </View>
  );
}

function TemplateList({
  canManage,
  copy,
  locale,
  items,
  saving,
  onTest,
}: {
  canManage: boolean;
  copy: Copy;
  locale: Locale;
  items: AdminNotificationTemplate[];
  saving: boolean;
  onTest: (item: AdminNotificationTemplate) => void;
}) {
  if (!items.length)
    return <EmptyState title={copy.empty} description={copy.noTemplates} />;
  return (
    <View style={styles.list}>
      {items.map((item) => (
        <SurfaceCard key={item.id} style={styles.card}>
          <View style={styles.row}>
            <DetailText strong style={styles.flex}>
              {item.name}
            </DetailText>
            <Badge
              label={
                item.isActive ? copy.active : adminStatusLabel(item.status, locale)
              }
              tone={item.isActive ? "success" : "default"}
            />
          </View>
          <DetailText>{adminEventTypeLabel(item.eventType, locale)}</DetailText>
          <DetailText muted>
            {adminChannelLabel(item.channel, locale)} / {item.locale} /{" "}
            {copy.version} {item.version}
          </DetailText>
          {canManage ? (
            <SmallButton
              label={copy.testSelf}
              disabled={saving}
              onPress={() => onTest(item)}
            />
          ) : null}
        </SurfaceCard>
      ))}
    </View>
  );
}

function AnnouncementPanel(props: {
  canManage: boolean;
  copy: Copy;
  locale: Locale;
  items: AdminNotificationAnnouncement[];
  title: string;
  body: string;
  channels: Channel[];
  draft: AdminNotificationAnnouncement | null;
  preview: AnnouncementPreview | null;
  confirmation: string;
  secondConfirmation: string;
  actionReason: string;
  cancelTarget: AdminNotificationAnnouncement | null;
  cancelReason: string;
  cancelConfirmation: string;
  saving: boolean;
  onTitle: (value: string) => void;
  onBody: (value: string) => void;
  onToggleChannel: (value: Channel) => void;
  onCreate: () => void;
  onPreview: (item: AdminNotificationAnnouncement) => void;
  onConfirmation: (value: string) => void;
  onSecondConfirmation: (value: string) => void;
  onActionReason: (value: string) => void;
  onCancelReason: (value: string) => void;
  onCancelConfirmation: (value: string) => void;
  onPublish: () => void;
  onRequestCancel: (item: AdminNotificationAnnouncement) => void;
  onDismissCancel: () => void;
  onConfirmCancel: () => void;
}) {
  const theme = useTheme();
  const { copy } = props;
  return (
    <View style={styles.list}>
      {props.canManage ? (
        <SurfaceCard style={styles.card}>
          <SectionTitle title={copy.newAnnouncement} />
          <TextInput
            value={props.title}
            onChangeText={props.onTitle}
            placeholder={copy.announcementTitle}
            placeholderTextColor={theme.muted}
            style={[
              styles.input,
              { borderColor: theme.border, color: theme.text },
            ]}
          />
          <TextInput
            value={props.body}
            onChangeText={props.onBody}
            placeholder={copy.announcementBody}
            placeholderTextColor={theme.muted}
            multiline
            style={[
              styles.input,
              styles.bodyInput,
              { borderColor: theme.border, color: theme.text },
            ]}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabs}
          >
            {channels.map((channel) => (
              <Chip
                key={channel}
                label={adminChannelLabel(channel, props.locale)}
                active={props.channels.includes(channel)}
                onPress={() => props.onToggleChannel(channel)}
              />
            ))}
          </ScrollView>
          <PrimaryButton
            title={copy.createDraft}
            loading={props.saving}
            disabled={
              !props.title.trim() ||
              !props.body.trim() ||
              !props.channels.length
            }
            onPress={props.onCreate}
          />
        </SurfaceCard>
      ) : null}

      {props.canManage && props.preview && props.draft ? (
        <SurfaceCard style={styles.card}>
          <SectionTitle title={copy.preview} />
          <DetailText strong>{props.draft.title}</DetailText>
          <DetailText>{props.draft.body}</DetailText>
          <DetailText>
            {copy.recipients}: {props.preview.preview.recipientCount}
          </DetailText>
          <DetailText>
            {copy.channels}:{" "}
            {props.preview.preview.channels
              .map((channel) => adminChannelLabel(channel, props.locale))
              .join(", ")}
          </DetailText>
          <Text style={{ color: theme.muted }}>
            {copy.typeConfirmation.replace(
              "{value}",
              `PUBLISH ${props.preview.preview.recipientCount}`,
            )}
          </Text>
          <TextInput
            value={props.confirmation}
            onChangeText={props.onConfirmation}
            autoCapitalize="characters"
            style={[
              styles.input,
              { borderColor: theme.border, color: theme.text },
            ]}
          />
          {props.preview.requiresSecondConfirmation ? (
            <>
              <Text style={{ color: theme.muted }}>
                {copy.typeConfirmation.replace(
                  "{value}",
                  `CONFIRM ${props.draft.id}`,
                )}
              </Text>
              <TextInput
                value={props.secondConfirmation}
                onChangeText={props.onSecondConfirmation}
                autoCapitalize="characters"
                style={[
                  styles.input,
                  { borderColor: theme.border, color: theme.text },
                ]}
              />
            </>
          ) : null}
          <TextInput
            value={props.actionReason}
            onChangeText={props.onActionReason}
            placeholder={copy.operationReason}
            placeholderTextColor={theme.muted}
            multiline
            style={[
              styles.input,
              styles.reasonInput,
              { borderColor: theme.border, color: theme.text },
            ]}
          />
          <PrimaryButton
            title={copy.publish}
            loading={props.saving}
            disabled={
              props.confirmation !==
                `PUBLISH ${props.preview.preview.recipientCount}` ||
              props.actionReason.trim().length < 5 ||
              (props.preview.requiresSecondConfirmation &&
                props.secondConfirmation !== `CONFIRM ${props.draft.id}`)
            }
            onPress={props.onPublish}
          />
        </SurfaceCard>
      ) : null}

      {props.canManage && props.cancelTarget ? (
        <SurfaceCard style={styles.card}>
          <SectionTitle title={copy.cancelConfirmationTitle} />
          <View style={styles.row}>
            <DetailText strong style={styles.flex}>
              {props.cancelTarget.title}
            </DetailText>
            <Badge
              label={adminStatusLabel(props.cancelTarget.status, props.locale)}
              tone="warning"
            />
          </View>
          <DetailText numberOfLines={3}>{props.cancelTarget.body}</DetailText>
          <DetailText muted>
            {copy.cancelTarget}:{" "}
            {adminAudienceLabel(props.cancelTarget.audience, props.locale)} ·{" "}
            {props.cancelTarget.channels
              .map((channel) => adminChannelLabel(channel, props.locale))
              .join(", ")}
          </DetailText>
          <DetailText muted>
            {formatDateTime(props.cancelTarget.startsAt, props.locale)} ·{" "}
            {copy.identifier}: {props.cancelTarget.id}
          </DetailText>
          <Text style={{ color: theme.muted }}>{copy.cancelReasonHelp}</Text>
          <TextInput
            value={props.cancelReason}
            onChangeText={props.onCancelReason}
            placeholder={copy.cancelReason}
            placeholderTextColor={theme.muted}
            multiline
            style={[
              styles.input,
              styles.reasonInput,
              { borderColor: theme.border, color: theme.text },
            ]}
          />
          <Text style={{ color: theme.muted }}>
            {copy.typeConfirmation.replace(
              "{value}",
              `CANCEL ${props.cancelTarget.id}`,
            )}
          </Text>
          <TextInput
            value={props.cancelConfirmation}
            onChangeText={props.onCancelConfirmation}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[
              styles.input,
              { borderColor: theme.border, color: theme.text },
            ]}
          />
          <View style={styles.row}>
            <SmallButton
              label={copy.keepAnnouncement}
              disabled={props.saving}
              onPress={props.onDismissCancel}
            />
            <SmallButton
              label={copy.confirmCancellation}
              disabled={
                props.saving ||
                props.cancelReason.trim().length < 5 ||
                props.cancelConfirmation.trim() !==
                  `CANCEL ${props.cancelTarget.id}`
              }
              danger
              onPress={props.onConfirmCancel}
            />
          </View>
        </SurfaceCard>
      ) : null}

      <SectionTitle title={copy.announcements} />
      {!props.items.length ? (
        <EmptyState title={copy.empty} description={copy.noAnnouncements} />
      ) : (
        props.items.map((item) => (
          <SurfaceCard key={item.id} style={styles.card}>
            <View style={styles.row}>
              <DetailText strong style={styles.flex}>
                {item.title}
              </DetailText>
              <Badge
                label={adminStatusLabel(item.status, props.locale)}
                tone={
                  item.status === "PUBLISHED"
                    ? "success"
                    : item.status === "CANCELED"
                      ? "danger"
                      : "warning"
                }
              />
            </View>
            <DetailText numberOfLines={3}>{item.body}</DetailText>
            <DetailText muted>
              {adminAudienceLabel(item.audience, props.locale)} ·{" "}
              {item.channels
                .map((channel) => adminChannelLabel(channel, props.locale))
                .join(", ")}
            </DetailText>
            <DetailText muted>
              {formatDateTime(item.startsAt, props.locale)}
            </DetailText>
            {props.canManage && item.status === "DRAFT" ? (
              <SmallButton
                label={copy.previewAndConfirm}
                disabled={props.saving}
                onPress={() => props.onPreview(item)}
              />
            ) : null}
            {props.canManage &&
            !(["COMPLETED", "CANCELED", "ARCHIVED"] as string[]).includes(
              item.status,
            ) ? (
              <SmallButton
                label={copy.cancel}
                disabled={props.saving}
                danger
                onPress={() => props.onRequestCancel(item)}
              />
            ) : null}
          </SurfaceCard>
        ))
      )}
    </View>
  );
}

function ProviderList({
  copy,
  providers,
}: {
  copy: Copy;
  providers: AdminNotificationProviderResponse | null;
}) {
  if (!providers)
    return <EmptyState title={copy.empty} description={copy.noProviders} />;
  return (
    <View style={styles.list}>
      {Object.entries(providers.providers).map(([name, value]) => {
        const configured = value.configured === true;
        return (
          <SurfaceCard key={name} style={styles.card}>
            <View style={styles.row}>
              <DetailText strong style={styles.flex}>
                {name}
              </DetailText>
              <Badge
                label={
                  configured ? copy.configured : copy.configurationRequired
                }
                tone={configured ? "success" : "warning"}
              />
            </View>
            {typeof value.provider === "string" ? (
              <DetailText>
                {copy.provider}: {value.provider}
              </DetailText>
            ) : null}
            {typeof value.activeDevices === "number" ? (
              <DetailText>
                {copy.activeDevices}: {value.activeDevices}
              </DetailText>
            ) : null}
          </SurfaceCard>
        );
      })}
      <DetailText>
        {copy.recentWebhooks}: {providers.recentWebhooks}
      </DetailText>
    </View>
  );
}

function DetailText({
  children,
  strong = false,
  muted = false,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  strong?: boolean;
  muted?: boolean;
  style?: object;
  numberOfLines?: number;
}) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        styles.detailText,
        strong ? styles.detailStrong : null,
        { color: muted ? theme.muted : theme.text },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

function SmallButton({
  label,
  onPress,
  disabled,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.smallButton,
        {
          borderColor: danger ? theme.danger : theme.primary,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: danger ? theme.danger : theme.primary,
          fontWeight: "800",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function appendUniqueById<T extends { id: string }>(
  current: T[],
  incoming: T[],
) {
  const seen = new Set(current.map((item) => item.id));
  const uniqueIncoming = incoming.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return [...current, ...uniqueIncoming];
}

function isAdminStepUpError(error: unknown) {
  return (
    error instanceof ApiRequestError &&
    (error.status === 428 ||
      error.code === "ADMIN_RECENT_AUTH_REQUIRED" ||
      error.code === "RECENT_AUTHENTICATION_REQUIRED")
  );
}

type Translate = ReturnType<typeof useTranslation>["t"];

function labels(t: Translate) {
  return {
    admin: t("adminDashboardModule"),
    title: t("adminNotificationsModule"),
    description: t("adminNotificationsDescription"),
    tabs: {
      dashboard: t("overview"),
      events: t("notifications.admin.event"),
      deliveries: t("ticketMessageDelivery"),
      deadLetters: t("notifications.admin.unresolvedDeadLetters"),
      templates: t("notifications.admin.versionedTemplates"),
      announcements: t("adminAnnouncementsModule"),
      providers: t("notifications.admin.providerReadiness"),
    } as Record<NotificationAdminTab, string>,
    loading: t("loading"),
    loadFailed: t("notificationsLoadFailed"),
    loadMoreFailed: t("notificationsLoadMoreFailed"),
    actionFailed: t("operationFailedError"),
    forbidden: t("operationForbiddenError"),
    success: t("requestReceived"),
    retryQueued: t("notifications.admin.retryQueued"),
    testSent: t("notifications.admin.testCompleted"),
    draftCreated: t("notifications.admin.draftCreated"),
    published: t("notifications.admin.announcementQueued"),
    canceled: t("notifications.admin.announcementCanceled"),
    confirmationFailed: t("notifications.admin.confirmationMismatch"),
    cancelConfirmationFailed: t("notifications.admin.confirmationMismatch"),
    reasonRequired: t("notifications.admin.cancelReason"),
    eventCount: t("notifications.admin.event"),
    deliveryRate: t("ticketMessageDelivery"),
    failures: t("status.failed"),
    deadLetters: t("notifications.admin.unresolvedDeadLetters"),
    activeDevices: t("notifications"),
    dashboardWindow: t("notifications.admin.providerReadinessDescription"),
    empty: t("noRecords"),
    noEvents: t("noNotifications"),
    noDeliveries: t("noNotifications"),
    noDeadLetters: t("notifications.admin.noDeadLetters"),
    noTemplates: t("notifications.admin.noTemplates"),
    noAnnouncements: t("notifications.admin.noAnnouncements"),
    noProviders: t("groups.unavailable"),
    platform: t("adminDashboardModule"),
    system: t("system"),
    recipients: t("notifications.admin.audience"),
    deliveries: t("ticketMessageDelivery"),
    attempts: t("notifications.admin.attempts"),
    version: t("appVersion"),
    identifier: t("adminSupport.ticket"),
    providerPending: t("notifications.admin.providerReadiness"),
    safeFailure: t("notifications.admin.error"),
    loadMore: t("loadMore"),
    retry: t("notifications.admin.retry"),
    active: t("notifications.admin.active"),
    testSelf: t("notifications.admin.testSelf"),
    newAnnouncement: t("notifications.admin.platformAnnouncement"),
    announcementTitle: t("notifications.admin.title"),
    announcementBody: t("notifications.admin.message"),
    createDraft: t("notifications.admin.createDraft"),
    preview: t("notifications.admin.preview"),
    channels: t("notifications.admin.channels"),
    typeConfirmation: `${t("notifications.admin.typeExactly")}: {value}`,
    operationReason: t("adminSubscriptions.actionReasonPlaceholder"),
    publish: t("notifications.admin.previewAndPublish"),
    announcements: t("adminAnnouncementsModule"),
    previewAndConfirm: t("notifications.admin.previewAndPublish"),
    cancel: t("notifications.admin.cancel"),
    cancelConfirmationTitle: t("notifications.admin.cancel"),
    cancelTarget: t("notifications.admin.audience"),
    cancelReason: t("notifications.admin.cancelReason"),
    cancelReasonHelp: t("notifications.admin.deadLetterDescription"),
    keepAnnouncement: t("cancel"),
    confirmCancellation: t("confirm"),
    configured: t("adminPlatform.configured"),
    configurationRequired: t("adminSubscriptions.configurationRequired"),
    provider: t("notifications.admin.providerReadiness"),
    recentWebhooks: t("adminWebhooksModule"),
    unlockTitle: t("security"),
    unlockDescription: t("mfaPolicyActionRequired"),
    password: t("password"),
    unlock: t("confirm"),
    unlockExpired: t("mfaChallengeExpiredError"),
  };
}

type Copy = ReturnType<typeof labels>;

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 40 },
  tabs: { gap: 8, paddingVertical: 2 },
  list: { gap: 12 },
  grid: { gap: 12 },
  card: { gap: 10 },
  row: { alignItems: "center", flexDirection: "row", gap: 10 },
  flex: { flex: 1 },
  muted: { fontSize: 14 },
  detailText: { fontSize: 14, lineHeight: 20 },
  detailStrong: { fontWeight: "800" },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bodyInput: { minHeight: 110, textAlignVertical: "top" },
  reasonInput: { minHeight: 76, textAlignVertical: "top" },
  smallButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
});
