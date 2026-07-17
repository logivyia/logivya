import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";

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
  type AdminNotificationProviderResponse,
  type AdminNotificationTemplate,
  type NotificationAdminTab
} from "@/api/mobileNotificationAdmin";
import { useAuthStore } from "@/auth/auth-store";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { Badge, Chip, PageHeader, SectionTitle, StatCard, SurfaceCard } from "@/components/ui";
import { formatDateTime } from "@/i18n/format";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { ProfileStackParamList } from "@/types/navigation";

type ScreenRoute = RouteProp<ProfileStackParamList, "AdminNotificationOperations">;
type AnnouncementPreview = Awaited<ReturnType<typeof previewAdminNotificationAnnouncement>>;
type Channel = "IN_APP" | "EMAIL" | "ANDROID_PUSH" | "WEB_PUSH";

const tabs: NotificationAdminTab[] = ["dashboard", "events", "deliveries", "deadLetters", "templates", "announcements", "providers"];
const channels: Channel[] = ["IN_APP", "EMAIL", "ANDROID_PUSH", "WEB_PUSH"];

export function AdminNotificationOperationsScreen() {
  const theme = useTheme();
  const { locale } = useTranslation();
  const { params } = useRoute<ScreenRoute>();
  const isPlatformAdmin = useAuthStore((state) => state.isPlatformAdmin);
  const copy = useMemo(() => labels(locale), [locale]);
  const [tab, setTab] = useState<NotificationAdminTab>(params?.initialTab ?? "dashboard");
  const [events, setEvents] = useState<AdminNotificationEvent[]>([]);
  const [deliveries, setDeliveries] = useState<AdminNotificationDelivery[]>([]);
  const [deadLetters, setDeadLetters] = useState<AdminNotificationDeadLetter[]>([]);
  const [templates, setTemplates] = useState<AdminNotificationTemplate[]>([]);
  const [announcements, setAnnouncements] = useState<AdminNotificationAnnouncement[]>([]);
  const [providers, setProviders] = useState<AdminNotificationProviderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(["IN_APP", "ANDROID_PUSH"]);
  const [draft, setDraft] = useState<AdminNotificationAnnouncement | null>(null);
  const [preview, setPreview] = useState<AnnouncementPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [secondConfirmation, setSecondConfirmation] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (!isPlatformAdmin) return;
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      if (tab === "events") setEvents((await getAdminNotificationEvents()).events);
      else if (tab === "deliveries") setDeliveries((await getAdminNotificationDeliveries()).deliveries);
      else if (tab === "deadLetters") setDeadLetters((await getAdminNotificationDeadLetters()).deadLetters);
      else if (tab === "templates") setTemplates((await getAdminNotificationTemplates()).templates);
      else if (tab === "announcements") setAnnouncements((await getAdminNotificationAnnouncements()).announcements);
      else if (tab === "providers") setProviders(await getAdminNotificationProviders());
      else {
        const [eventResponse, deliveryResponse, deadLetterResponse, providerResponse] = await Promise.all([
          getAdminNotificationEvents(),
          getAdminNotificationDeliveries(),
          getAdminNotificationDeadLetters(),
          getAdminNotificationProviders()
        ]);
        setEvents(eventResponse.events);
        setDeliveries(deliveryResponse.deliveries);
        setDeadLetters(deadLetterResponse.deadLetters);
        setProviders(providerResponse);
      }
    } catch {
      setError(copy.loadFailed);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [copy.loadFailed, isPlatformAdmin, tab]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const retryDeadLetter = async (item: AdminNotificationDeadLetter) => {
    setSaving(true);
    setError(null);
    try {
      await retryAdminNotificationDeadLetter(item.id, "Authorized mobile administrator retry");
      Alert.alert(copy.success, copy.retryQueued);
      await load(true);
    } catch {
      setError(copy.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  const testTemplate = async (item: AdminNotificationTemplate) => {
    setSaving(true);
    setError(null);
    try {
      await testAdminNotificationTemplate(item.id);
      Alert.alert(copy.success, copy.testSent);
    } catch {
      setError(copy.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  const createDraft = async () => {
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
        priority: "NORMAL"
      });
      setDraft(response.announcement);
      setPreview(null);
      setConfirmation("");
      setSecondConfirmation("");
      Alert.alert(copy.success, copy.draftCreated);
      setAnnouncements((await getAdminNotificationAnnouncements()).announcements);
    } catch {
      setError(copy.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  const previewDraft = async (item: AdminNotificationAnnouncement) => {
    setSaving(true);
    setError(null);
    try {
      setDraft(item);
      setPreview(await previewAdminNotificationAnnouncement(item.id));
      setConfirmation("");
      setSecondConfirmation("");
    } catch {
      setError(copy.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  const publishDraft = async () => {
    if (!draft || !preview) return;
    setSaving(true);
    setError(null);
    try {
      await publishAdminNotificationAnnouncement(draft.id, {
        previewHash: preview.previewHash,
        confirmation: confirmation.trim(),
        ...(preview.requiresSecondConfirmation ? { secondConfirmation: secondConfirmation.trim() } : {})
      });
      Alert.alert(copy.success, copy.published);
      resetComposer();
      await load(true);
    } catch {
      setError(copy.confirmationFailed);
    } finally {
      setSaving(false);
    }
  };

  const cancelAnnouncement = async (item: AdminNotificationAnnouncement) => {
    setSaving(true);
    setError(null);
    try {
      await cancelAdminNotificationAnnouncement(item.id, "Canceled by authorized mobile administrator");
      Alert.alert(copy.success, copy.canceled);
      if (draft?.id === item.id) resetComposer();
      await load(true);
    } catch {
      setError(copy.actionFailed);
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
  }

  if (!isPlatformAdmin) return <Screen><ErrorState title={copy.forbidden} onRetry={() => undefined} /></Screen>;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader eyebrow={copy.admin} title={copy.title} description={copy.description} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {tabs.map((item) => <Chip key={item} label={copy.tabs[item]} active={tab === item} onPress={() => setTab(item)} />)}
        </ScrollView>

        {error ? <ErrorState title={error} onRetry={() => void load()} /> : null}
        {loading ? <Text style={[styles.muted, { color: theme.muted }]}>{copy.loading}</Text> : null}
        {!loading && tab === "dashboard" ? <Dashboard copy={copy} events={events} deliveries={deliveries} deadLetters={deadLetters} providers={providers} /> : null}
        {!loading && tab === "events" ? <EventList copy={copy} locale={locale} items={events} /> : null}
        {!loading && tab === "deliveries" ? <DeliveryList copy={copy} locale={locale} items={deliveries} /> : null}
        {!loading && tab === "deadLetters" ? <DeadLetterList copy={copy} locale={locale} items={deadLetters} saving={saving} onRetry={retryDeadLetter} /> : null}
        {!loading && tab === "templates" ? <TemplateList copy={copy} items={templates} saving={saving} onTest={testTemplate} /> : null}
        {!loading && tab === "announcements" ? (
          <AnnouncementPanel
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
            saving={saving}
            onTitle={setTitle}
            onBody={setBody}
            onToggleChannel={(channel) => setSelectedChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel])}
            onCreate={createDraft}
            onPreview={previewDraft}
            onConfirmation={setConfirmation}
            onSecondConfirmation={setSecondConfirmation}
            onPublish={publishDraft}
            onCancel={cancelAnnouncement}
          />
        ) : null}
        {!loading && tab === "providers" ? <ProviderList copy={copy} providers={providers} /> : null}
      </ScrollView>
    </Screen>
  );
}

function Dashboard({ copy, events, deliveries, deadLetters, providers }: { copy: Copy; events: AdminNotificationEvent[]; deliveries: AdminNotificationDelivery[]; deadLetters: AdminNotificationDeadLetter[]; providers: AdminNotificationProviderResponse | null }) {
  const delivered = deliveries.filter((item) => item.status === "DELIVERED").length;
  const failed = deliveries.filter((item) => ["FAILED", "DEAD_LETTERED"].includes(item.status)).length;
  const activeDevices = Object.values(providers?.providers ?? {}).reduce((sum, provider) => sum + (typeof provider.activeDevices === "number" ? provider.activeDevices : 0), 0);
  return <View style={styles.grid}>
    <StatCard label={copy.eventCount} value={events.length} icon="flash-outline" />
    <StatCard label={copy.deliveryRate} value={deliveries.length ? `${Math.round(delivered / deliveries.length * 100)}%` : "-"} icon="checkmark-circle-outline" tone="success" />
    <StatCard label={copy.failures} value={failed} icon="warning-outline" tone={failed ? "danger" : "success"} />
    <StatCard label={copy.deadLetters} value={deadLetters.length} icon="archive-outline" tone={deadLetters.length ? "warning" : "success"} />
    <StatCard label={copy.activeDevices} value={activeDevices} icon="phone-portrait-outline" />
  </View>;
}

function EventList({ copy, locale, items }: { copy: Copy; locale: string; items: AdminNotificationEvent[] }) {
  if (!items.length) return <EmptyState title={copy.empty} description={copy.noEvents} />;
  return <View style={styles.list}>{items.map((item) => <SurfaceCard key={item.id} style={styles.card}>
    <View style={styles.row}><DetailText strong style={styles.flex}>{item.type}</DetailText><Badge label={item.status} tone={item.status === "PROCESSED" ? "success" : "default"} /></View>
    <DetailText>{item.category}</DetailText><DetailText muted>{item.company?.name ?? copy.platform} · {item.actor?.email ?? copy.system}</DetailText>
    <DetailText muted>{copy.recipients}: {item._count.notifications} · {copy.deliveries}: {item._count.deliveries}</DetailText>
    <DetailText muted>{formatDateTime(item.occurredAt, locale)}</DetailText>
  </SurfaceCard>)}</View>;
}

function DeliveryList({ copy, locale, items }: { copy: Copy; locale: string; items: AdminNotificationDelivery[] }) {
  if (!items.length) return <EmptyState title={copy.empty} description={copy.noDeliveries} />;
  return <View style={styles.list}>{items.map((item) => <SurfaceCard key={item.id} style={styles.card}>
    <View style={styles.row}><DetailText strong style={styles.flex}>{item.event.type}</DetailText><Badge label={item.status} tone={item.status === "DELIVERED" ? "success" : item.status === "FAILED" ? "danger" : "warning"} /></View>
    <DetailText>{item.channel} · {item.provider ?? copy.providerPending}</DetailText>
    <DetailText muted>{item.company?.name ?? copy.platform} · {item.user?.email ?? "-"}</DetailText>
    <DetailText muted>{copy.attempts}: {item.attemptCount} / {formatDateTime(item.createdAt, locale)}</DetailText>
  </SurfaceCard>)}</View>;
}

function DeadLetterList({ copy, locale, items, saving, onRetry }: { copy: Copy; locale: string; items: AdminNotificationDeadLetter[]; saving: boolean; onRetry: (item: AdminNotificationDeadLetter) => void }) {
  if (!items.length) return <EmptyState title={copy.empty} description={copy.noDeadLetters} />;
  return <View style={styles.list}>{items.map((item) => <SurfaceCard key={item.id} style={styles.card}>
    <View style={styles.row}><DetailText strong style={styles.flex}>{item.event.type}</DetailText><Badge label={item.channel} tone="danger" /></View>
    <DetailText>{copy.safeFailure}: {item.errorCode}</DetailText><DetailText muted>{copy.attempts}: {item.attemptCount} · {formatDateTime(item.deadLetteredAt, locale)}</DetailText>
    <SmallButton label={copy.retry} disabled={saving} onPress={() => onRetry(item)} />
  </SurfaceCard>)}</View>;
}

function TemplateList({ copy, items, saving, onTest }: { copy: Copy; items: AdminNotificationTemplate[]; saving: boolean; onTest: (item: AdminNotificationTemplate) => void }) {
  if (!items.length) return <EmptyState title={copy.empty} description={copy.noTemplates} />;
  return <View style={styles.list}>{items.map((item) => <SurfaceCard key={item.id} style={styles.card}>
    <View style={styles.row}><DetailText strong style={styles.flex}>{item.name}</DetailText><Badge label={item.isActive ? copy.active : item.status} tone={item.isActive ? "success" : "default"} /></View>
    <DetailText>{item.eventType}</DetailText><DetailText muted>{item.channel} / {item.locale} / {copy.version} {item.version}</DetailText>
    <SmallButton label={copy.testSelf} disabled={saving} onPress={() => onTest(item)} />
  </SurfaceCard>)}</View>;
}

function AnnouncementPanel(props: {
  copy: Copy; locale: string; items: AdminNotificationAnnouncement[]; title: string; body: string; channels: Channel[];
  draft: AdminNotificationAnnouncement | null; preview: AnnouncementPreview | null; confirmation: string; secondConfirmation: string; saving: boolean;
  onTitle: (value: string) => void; onBody: (value: string) => void; onToggleChannel: (value: Channel) => void; onCreate: () => void;
  onPreview: (item: AdminNotificationAnnouncement) => void; onConfirmation: (value: string) => void; onSecondConfirmation: (value: string) => void;
  onPublish: () => void; onCancel: (item: AdminNotificationAnnouncement) => void;
}) {
  const theme = useTheme();
  const { copy } = props;
  return <View style={styles.list}>
    <SurfaceCard style={styles.card}>
      <SectionTitle title={copy.newAnnouncement} />
      <TextInput value={props.title} onChangeText={props.onTitle} placeholder={copy.announcementTitle} placeholderTextColor={theme.muted} style={[styles.input, { borderColor: theme.border, color: theme.text }]} />
      <TextInput value={props.body} onChangeText={props.onBody} placeholder={copy.announcementBody} placeholderTextColor={theme.muted} multiline style={[styles.input, styles.bodyInput, { borderColor: theme.border, color: theme.text }]} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{channels.map((channel) => <Chip key={channel} label={channel} active={props.channels.includes(channel)} onPress={() => props.onToggleChannel(channel)} />)}</ScrollView>
      <PrimaryButton title={copy.createDraft} loading={props.saving} disabled={!props.title.trim() || !props.body.trim() || !props.channels.length} onPress={props.onCreate} />
    </SurfaceCard>

    {props.preview && props.draft ? <SurfaceCard style={styles.card}>
      <SectionTitle title={copy.preview} />
      <DetailText strong>{props.draft.title}</DetailText><DetailText>{props.draft.body}</DetailText>
      <DetailText>{copy.recipients}: {props.preview.preview.recipientCount}</DetailText><DetailText>{copy.channels}: {props.preview.preview.channels.join(", ")}</DetailText>
      <Text style={{ color: theme.muted }}>{copy.typeConfirmation.replace("{value}", `PUBLISH ${props.preview.preview.recipientCount}`)}</Text>
      <TextInput value={props.confirmation} onChangeText={props.onConfirmation} autoCapitalize="characters" style={[styles.input, { borderColor: theme.border, color: theme.text }]} />
      {props.preview.requiresSecondConfirmation ? <>
        <Text style={{ color: theme.muted }}>{copy.typeConfirmation.replace("{value}", `CONFIRM ${props.draft.id}`)}</Text>
        <TextInput value={props.secondConfirmation} onChangeText={props.onSecondConfirmation} autoCapitalize="characters" style={[styles.input, { borderColor: theme.border, color: theme.text }]} />
      </> : null}
      <PrimaryButton title={copy.publish} loading={props.saving} disabled={props.confirmation !== `PUBLISH ${props.preview.preview.recipientCount}` || (props.preview.requiresSecondConfirmation && props.secondConfirmation !== `CONFIRM ${props.draft.id}`)} onPress={props.onPublish} />
    </SurfaceCard> : null}

    <SectionTitle title={copy.announcements} />
    {!props.items.length ? <EmptyState title={copy.empty} description={copy.noAnnouncements} /> : props.items.map((item) => <SurfaceCard key={item.id} style={styles.card}>
      <View style={styles.row}><DetailText strong style={styles.flex}>{item.title}</DetailText><Badge label={item.status} tone={item.status === "PUBLISHED" ? "success" : item.status === "CANCELED" ? "danger" : "warning"} /></View>
      <DetailText numberOfLines={3}>{item.body}</DetailText><DetailText muted>{item.audience} · {item.channels.join(", ")}</DetailText><DetailText muted>{formatDateTime(item.startsAt, props.locale)}</DetailText>
      {item.status === "DRAFT" ? <SmallButton label={copy.previewAndConfirm} disabled={props.saving} onPress={() => props.onPreview(item)} /> : null}
      {!(["COMPLETED", "CANCELED", "ARCHIVED"] as string[]).includes(item.status) ? <SmallButton label={copy.cancel} disabled={props.saving} danger onPress={() => props.onCancel(item)} /> : null}
    </SurfaceCard>)}
  </View>;
}

function ProviderList({ copy, providers }: { copy: Copy; providers: AdminNotificationProviderResponse | null }) {
  if (!providers) return <EmptyState title={copy.empty} description={copy.noProviders} />;
  return <View style={styles.list}>{Object.entries(providers.providers).map(([name, value]) => {
    const configured = value.configured === true;
    return <SurfaceCard key={name} style={styles.card}><View style={styles.row}><DetailText strong style={styles.flex}>{name}</DetailText><Badge label={configured ? copy.configured : copy.configurationRequired} tone={configured ? "success" : "warning"} /></View>
      {typeof value.provider === "string" ? <DetailText>{copy.provider}: {value.provider}</DetailText> : null}
      {typeof value.activeDevices === "number" ? <DetailText>{copy.activeDevices}: {value.activeDevices}</DetailText> : null}
    </SurfaceCard>;
  })}<DetailText>{copy.recentWebhooks}: {providers.recentWebhooks}</DetailText></View>;
}

function DetailText({ children, strong = false, muted = false, style, numberOfLines }: { children: ReactNode; strong?: boolean; muted?: boolean; style?: object; numberOfLines?: number }) {
  const theme = useTheme();
  return <Text numberOfLines={numberOfLines} style={[styles.detailText, strong ? styles.detailStrong : null, { color: muted ? theme.muted : theme.text }, style]}>{children}</Text>;
}

function SmallButton({ label, onPress, disabled, danger = false }: { label: string; onPress: () => void; disabled: boolean; danger?: boolean }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.smallButton, { borderColor: danger ? theme.danger : theme.primary, opacity: disabled ? 0.5 : 1 }]}><Text style={{ color: danger ? theme.danger : theme.primary, fontWeight: "800" }}>{label}</Text></Pressable>;
}

function labels(locale: string) {
  const tr = locale === "tr";
  return {
    admin: tr ? "Yönetici" : "Administrator", title: tr ? "Bildirim Operasyonları" : "Notification Operations", description: tr ? "Teslimat, şablon, duyuru ve sağlayıcı durumlarını yönetin." : "Manage deliveries, templates, announcements and provider health.",
    tabs: { dashboard: tr ? "Özet" : "Overview", events: tr ? "Olaylar" : "Events", deliveries: tr ? "Teslimatlar" : "Deliveries", deadLetters: tr ? "Kalıcı hatalar" : "Dead letters", templates: tr ? "Şablonlar" : "Templates", announcements: tr ? "Duyurular" : "Announcements", providers: tr ? "Sağlayıcılar" : "Providers" } as Record<NotificationAdminTab, string>,
    loading: tr ? "Bildirim operasyonları yükleniyor..." : "Loading notification operations...", loadFailed: tr ? "Bildirim operasyonları yüklenemedi." : "Notification operations could not be loaded.", actionFailed: tr ? "İşlem tamamlanamadı." : "The operation could not be completed.", forbidden: tr ? "Bu alana erişim yetkiniz yok." : "You are not authorized to access this area.",
    success: tr ? "Başarılı" : "Success", retryQueued: tr ? "Teslimat güvenli yeniden deneme kuyruğuna alındı." : "Delivery was queued for a safe retry.", testSent: tr ? "Kontrollü test yalnızca yönetici hesabınıza gönderildi." : "The controlled test was sent only to your administrator account.",
    draftCreated: tr ? "Duyuru taslağı oluşturuldu. Yayınlamadan önce önizleyin." : "Announcement draft created. Preview it before publishing.", published: tr ? "Duyuru yayın kuyruğuna alındı." : "Announcement was queued for publishing.", canceled: tr ? "Duyuru iptal edildi." : "Announcement canceled.", confirmationFailed: tr ? "Onay metni geçersiz veya önizleme güncel değil." : "Confirmation is invalid or the preview is stale.",
    eventCount: tr ? "Son olaylar" : "Recent events", deliveryRate: tr ? "Teslim oranı" : "Delivery rate", failures: tr ? "Başarısız teslimatlar" : "Failed deliveries", deadLetters: tr ? "Kalıcı hatalar" : "Dead letters", activeDevices: tr ? "Aktif cihazlar" : "Active devices",
    empty: tr ? "Kayıt yok" : "No records", noEvents: tr ? "Henüz bildirim olayı yok." : "No notification events yet.", noDeliveries: tr ? "Henüz teslimat kaydı yok." : "No delivery records yet.", noDeadLetters: tr ? "Çözümlenmeyi bekleyen kalıcı hata yok." : "There are no unresolved dead letters.", noTemplates: tr ? "Henüz bildirim şablonu yok." : "No notification templates yet.", noAnnouncements: tr ? "Henüz duyuru yok." : "No announcements yet.", noProviders: tr ? "Sağlayıcı durumu alınamadı." : "Provider status is unavailable.",
    platform: tr ? "Platform" : "Platform", system: tr ? "Sistem" : "System", recipients: tr ? "Alıcılar" : "Recipients", deliveries: tr ? "Teslimatlar" : "Deliveries", attempts: tr ? "Deneme" : "Attempts", version: tr ? "Sürüm" : "Version", providerPending: tr ? "Sağlayıcı bekleniyor" : "Provider pending", safeFailure: tr ? "Güvenli hata kodu" : "Safe error code", retry: tr ? "Yeniden dene" : "Retry", active: tr ? "Aktif" : "Active", testSelf: tr ? "Kendime test gönder" : "Send test to myself",
    newAnnouncement: tr ? "Yeni duyuru taslağı" : "New announcement draft", announcementTitle: tr ? "Duyuru başlığı" : "Announcement title", announcementBody: tr ? "Duyuru metni" : "Announcement body", createDraft: tr ? "Taslak oluştur" : "Create draft", preview: tr ? "Yayın önizlemesi" : "Publishing preview", channels: tr ? "Kanallar" : "Channels", typeConfirmation: tr ? "Devam etmek için tam olarak yazın: {value}" : "Type exactly to continue: {value}", publish: tr ? "Duyuruyu yayınla" : "Publish announcement", announcements: tr ? "Duyuru geçmişi" : "Announcement history", previewAndConfirm: tr ? "Önizle ve onayla" : "Preview and confirm", cancel: tr ? "İptal et" : "Cancel",
    configured: tr ? "Yapılandırıldı" : "Configured", configurationRequired: tr ? "Yapılandırma gerekli" : "Configuration required", provider: tr ? "Sağlayıcı" : "Provider", recentWebhooks: tr ? "Son 24 saat webhook" : "Webhooks in last 24h"
  };
}

type Copy = ReturnType<typeof labels>;

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 40 }, tabs: { gap: 8, paddingVertical: 2 }, list: { gap: 12 }, grid: { gap: 12 }, card: { gap: 10 },
  row: { alignItems: "center", flexDirection: "row", gap: 10 }, flex: { flex: 1 }, muted: { fontSize: 14 }, detailText: { fontSize: 14, lineHeight: 20 }, detailStrong: { fontWeight: "800" },
  input: { borderRadius: 8, borderWidth: 1, minHeight: 50, paddingHorizontal: 14, paddingVertical: 12 }, bodyInput: { minHeight: 110, textAlignVertical: "top" },
  smallButton: { alignItems: "center", alignSelf: "flex-start", borderRadius: 8, borderWidth: 1, minHeight: 42, justifyContent: "center", paddingHorizontal: 14 }
});
