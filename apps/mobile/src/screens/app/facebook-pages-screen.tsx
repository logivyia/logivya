import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  createFacebookPost,
  connectDiscoveredFacebookPage,
  deleteFacebookPost,
  disconnectFacebookPage,
  getFacebookPages,
  getFacebookPostHistory,
  startFacebookPagesOAuth,
  syncFacebookPages,
  uploadFacebookMedia,
  type MobileFacebookPage,
  type MobileFacebookPost,
} from "@/api/mobileFacebook";
import { pickMessagePhotos, pickMessageVideo, type LocalMessageAttachment } from "@/api/mobileMedia";
import { useAuthStore } from "@/auth/auth-store";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { Badge, Chip, IconBadge, PageHeader, SectionTitle, SurfaceCard } from "@/components/ui";
import { useFacebookAccessStore } from "@/features/facebook/facebookAccessStore";
import { useTranslation } from "@/i18n/use-translation";
import { colors } from "@/theme/colors";
import { useTheme } from "@/theme/theme-provider";

type Tab = "accounts" | "compose" | "history";
type PickerMode = "date" | "time" | "datetime";

function copyFor(locale: string) {
  if (locale !== "tr") return {
    eyebrow: "Facebook", title: "Facebook Management", description: "Connect Facebook Pages, create or schedule posts, and manage history in one workspace.",
    accounts: "Pages", compose: "Create Post", history: "History", connect: "Connect Facebook Pages", sync: "Sync Pages",
    configMissing: "The Meta application settings must be completed on the Logivya server before connecting.", noPages: "No Facebook Page is connected yet.",
    selectPage: "Publishing Pages", text: "Post text", textPlaceholder: "Write your Facebook Page post…", link: "Link (optional)", linkPlaceholder: "https://…",
    media: "Photos or video", addPhotos: "Add photos", addVideo: "Add video", schedule: "Schedule", now: "Publish now", selectDate: "Select date and time",
    publish: "Publish to Facebook", publishing: "Publishing", published: "Published", scheduled: "Scheduled", failed: "Failed", deleted: "Deleted",
    remove: "Remove", disconnectTitle: "Disconnect Page", disconnectBody: "The encrypted Page token will be removed from Logivya. Existing Facebook posts will not be deleted.",
    deleteTitle: "Delete Facebook post", deleteBody: "The post will be deleted from Facebook. This action cannot be undone.", delete: "Delete from Facebook",
    cancel: "Cancel", emptyHistory: "No Facebook Page post has been created from Logivya.", operationFailed: "The operation could not be completed.",
    connected: "Connected", discovered: "Ready to connect", connectPage: "Connect Page", reconnect: "Reconnect required", publishSuccess: "The Page post was queued safely.", scheduleSuccess: "The scheduled Page post was queued safely.",
    contentRequired: "Enter text, a link, a photo, or a video.", pageRequired: "Select at least one connected Page first.", invalidSchedule: "Scheduled posts must be between 10 minutes and 30 days from now.",
    photoVideoRule: "A post can contain up to 10 photos or one video.", refresh: "Refresh", attachmentCount: (count: number) => `${count} media item(s)`,
  };
  return {
    eyebrow: "Facebook", title: "Facebook Yönetimi", description: "Facebook sayfalarınızı bağlayın, gönderi oluşturun veya zamanlayın ve geçmişi tek çalışma alanından yönetin.",
    accounts: "Sayfalar", compose: "Gönderi Oluştur", history: "Geçmiş", connect: "Facebook Sayfalarını Bağla", sync: "Sayfaları Eşitle",
    configMissing: "Bağlantıdan önce Logivya sunucusundaki Meta uygulama ayarları tamamlanmalıdır.", noPages: "Henüz Facebook Sayfası bağlanmadı.",
    selectPage: "Yayınlanacak Sayfalar", text: "Gönderi metni", textPlaceholder: "Facebook Sayfası gönderinizi yazın…", link: "Bağlantı (isteğe bağlı)", linkPlaceholder: "https://…",
    media: "Fotoğraflar veya video", addPhotos: "Fotoğraf ekle", addVideo: "Video ekle", schedule: "Zamanla", now: "Şimdi yayınla", selectDate: "Tarih ve saat seçin",
    publish: "Facebook'ta Yayınla", publishing: "Yayınlanıyor", published: "Yayınlandı", scheduled: "Planlandı", failed: "Başarısız", deleted: "Silindi",
    remove: "Kaldır", disconnectTitle: "Sayfa bağlantısını kaldır", disconnectBody: "Şifrelenmiş Sayfa erişim anahtarı Logivya’dan kaldırılır. Mevcut Facebook gönderileri silinmez.",
    deleteTitle: "Facebook gönderisini sil", deleteBody: "Gönderi Facebook’tan silinecek. Bu işlem geri alınamaz.", delete: "Facebook'tan Sil",
    cancel: "Vazgeç", emptyHistory: "Logivya üzerinden henüz Facebook Sayfası gönderisi oluşturulmadı.", operationFailed: "İşlem tamamlanamadı.",
    connected: "Bağlı", discovered: "Bağlanmaya hazır", connectPage: "Sayfayı Bağla", reconnect: "Yeniden bağlantı gerekli", publishSuccess: "Sayfa gönderisi güvenli biçimde kuyruğa alındı.", scheduleSuccess: "Planlanan Sayfa gönderisi güvenli biçimde kuyruğa alındı.",
    contentRequired: "Metin, bağlantı, fotoğraf veya video ekleyin.", pageRequired: "Önce en az bir bağlı Sayfa seçin.", invalidSchedule: "Planlanan zaman şu andan 10 dakika ile 30 gün arasında olmalıdır.",
    photoVideoRule: "Bir gönderiye en fazla 10 fotoğraf veya tek video eklenebilir.", refresh: "Yenile", attachmentCount: (count: number) => `${count} medya`,
  };
}

function defaultScheduleDate() {
  const date = new Date(Date.now() + 30 * 60_000);
  date.setSeconds(0, 0);
  return date;
}

function mergeDateAndTime(date: Date, time: Date) {
  const value = new Date(date);
  value.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return value;
}

function formatBytes(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
}

export function FacebookPagesScreen() {
  const theme = useTheme();
  const { locale } = useTranslation();
  const copy = useMemo(() => copyFor(locale), [locale]);
  const configured = useFacebookAccessStore((state) => state.configured);
  const role = useAuthStore((state) => state.user?.role || "VIEWER");
  const canManageConnection = role === "OWNER" || role === "ADMIN";
  const canPublish = role !== "VIEWER";
  const [tab, setTab] = useState<Tab>("accounts");
  const [pages, setPages] = useState<MobileFacebookPage[]>([]);
  const [history, setHistory] = useState<MobileFacebookPost[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [attachments, setAttachments] = useState<LocalMessageAttachment[]>([]);
  const [scheduled, setScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(defaultScheduleDate());
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [accountResult, historyResult] = await Promise.all([getFacebookPages(), getFacebookPostHistory()]);
      setPages(accountResult.accounts);
      setHistory(historyResult.items);
      setSelectedPageIds((current) => {
        const publishable = new Set(accountResult.accounts.filter((page) => page.canPublish).map((page) => page.id));
        const retained = current.filter((id) => publishable.has(id));
        if (retained.length) return retained;
        const first = accountResult.accounts.find((page) => page.canPublish)?.id;
        return first ? [first] : [];
      });
    } catch (error) {
      if (!silent) Alert.alert(copy.title, error instanceof Error ? error.message : copy.operationFailed);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [copy.operationFailed, copy.title]);

  useEffect(() => {
    void loadAll();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void loadAll(true);
    });
    return () => subscription.remove();
  }, [loadAll]);

  async function connect() {
    try {
      setBusy("connect");
      const result = await startFacebookPagesOAuth();
      await Linking.openURL(result.authorizationUrl);
    } catch (error) {
      Alert.alert(copy.title, error instanceof Error ? error.message : copy.operationFailed);
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    try {
      setBusy("sync");
      await syncFacebookPages();
      await loadAll(true);
    } catch (error) {
      Alert.alert(copy.title, error instanceof Error ? error.message : copy.operationFailed);
    } finally {
      setBusy(null);
    }
  }

  function confirmDisconnect(page: MobileFacebookPage) {
    Alert.alert(copy.disconnectTitle, copy.disconnectBody, [
      { text: copy.cancel, style: "cancel" },
      { text: copy.remove, style: "destructive", onPress: () => void disconnect(page) },
    ]);
  }

  async function disconnect(page: MobileFacebookPage) {
    try {
      setBusy(`disconnect:${page.id}`);
      await disconnectFacebookPage(page.id);
      await loadAll(true);
    } catch (error) {
      Alert.alert(copy.disconnectTitle, error instanceof Error ? error.message : copy.operationFailed);
    } finally {
      setBusy(null);
    }
  }

  async function connectPage(page: MobileFacebookPage) {
    try {
      setBusy(`connect-page:${page.id}`);
      await connectDiscoveredFacebookPage(page.id);
      await loadAll(true);
    } catch (error) {
      Alert.alert(copy.title, error instanceof Error ? error.message : copy.operationFailed);
    } finally {
      setBusy(null);
    }
  }

  async function addPhotos() {
    try {
      const selected = (await pickMessagePhotos()).slice(0, 10);
      if (!selected.length) return;
      setAttachments((current) => [...current.filter((item) => item.kind === "PHOTO"), ...selected].slice(0, 10));
    } catch (error) {
      Alert.alert(copy.media, error instanceof Error ? error.message : copy.operationFailed);
    }
  }

  async function addVideo() {
    try {
      const selected = await pickMessageVideo();
      if (selected) setAttachments([selected]);
    } catch (error) {
      Alert.alert(copy.media, error instanceof Error ? error.message : copy.operationFailed);
    }
  }

  function onPickerChange(event: DateTimePickerEvent, value?: Date) {
    if (event.type === "dismissed" || !value) {
      setPickerMode(null);
      return;
    }
    if (Platform.OS === "android" && pickerMode === "date") {
      setScheduledAt(mergeDateAndTime(value, scheduledAt));
      setPickerMode("time");
      return;
    }
    setScheduledAt(pickerMode === "time" ? mergeDateAndTime(scheduledAt, value) : value);
    setPickerMode(null);
  }

  async function publish() {
    if (!selectedPageIds.length) return Alert.alert(copy.title, copy.pageRequired);
    if (!message.trim() && !link.trim() && attachments.length === 0) return Alert.alert(copy.title, copy.contentRequired);
    if (scheduled) {
      const delay = scheduledAt.getTime() - Date.now();
      if (delay < 10 * 60_000 || delay > 30 * 24 * 60 * 60_000) return Alert.alert(copy.schedule, copy.invalidSchedule);
    }
    try {
      setBusy("publish");
      const uploadedIds: string[] = [];
      for (const attachment of attachments) {
        const uploaded = await uploadFacebookMedia(attachment);
        uploadedIds.push(uploaded.attachment.mediaFileId);
      }
      await createFacebookPost({
        pageAccountIds: selectedPageIds,
        message: message.trim(),
        ...(link.trim() ? { link: link.trim() } : {}),
        ...(uploadedIds.length ? { mediaFileIds: uploadedIds } : {}),
        ...(scheduled ? { scheduledAt: scheduledAt.toISOString() } : {}),
      });
      setMessage("");
      setLink("");
      setAttachments([]);
      setScheduled(false);
      setScheduledAt(defaultScheduleDate());
      await loadAll(true);
      setTab("history");
      Alert.alert(copy.title, scheduled ? copy.scheduleSuccess : copy.publishSuccess);
    } catch (error) {
      Alert.alert(copy.title, error instanceof Error ? error.message : copy.operationFailed);
    } finally {
      setBusy(null);
    }
  }

  function confirmDelete(item: MobileFacebookPost) {
    Alert.alert(copy.deleteTitle, copy.deleteBody, [
      { text: copy.cancel, style: "cancel" },
      { text: copy.delete, style: "destructive", onPress: () => void removePost(item) },
    ]);
  }

  async function removePost(item: MobileFacebookPost) {
    try {
      setBusy(`delete:${item.id}`);
      await deleteFacebookPost(item.id);
      await loadAll(true);
    } catch (error) {
      Alert.alert(copy.deleteTitle, error instanceof Error ? error.message : copy.operationFailed);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void loadAll()} tintColor={theme.primary} />}
        >
          <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
          <View style={styles.tabs}>
            <Chip label={copy.accounts} active={tab === "accounts"} onPress={() => setTab("accounts")} />
            <Chip label={copy.compose} active={tab === "compose"} onPress={() => setTab("compose")} />
            <Chip label={copy.history} active={tab === "history"} onPress={() => setTab("history")} />
          </View>

          {tab === "accounts" ? (
            <View style={styles.section}>
              {!configured ? <SurfaceCard><Text style={[styles.notice, { color: theme.warning }]}>{copy.configMissing}</Text></SurfaceCard> : null}
              {canManageConnection ? <PrimaryButton title={copy.connect} icon="logo-facebook" loading={busy === "connect"} disabled={!configured} onPress={() => void connect()} /> : null}
              {canManageConnection && pages.length ? <PrimaryButton title={copy.sync} icon="sync-outline" loading={busy === "sync"} onPress={() => void sync()} /> : null}
              <SectionTitle title={copy.accounts} />
              {!pages.length ? <SurfaceCard><Text style={[styles.empty, { color: theme.muted }]}>{copy.noPages}</Text></SurfaceCard> : pages.map((page) => (
                <Pressable key={page.id} disabled={!page.canPublish} onPress={() => { setSelectedPageIds([page.id]); setTab("compose"); }}>
                  <SurfaceCard style={styles.pageCard}>
                    {page.pictureUrl ? <Image source={{ uri: page.pictureUrl }} style={styles.avatar} resizeMethod="resize" /> : <IconBadge icon="logo-facebook" />}
                    <View style={styles.pageText}>
                      <Text style={[styles.pageName, { color: theme.text }]}>{page.name}</Text>
                      <Text style={[styles.meta, { color: theme.muted }]}>{page.username ? `@${page.username}` : page.category || "Facebook Page"}</Text>
                    </View>
                    <Badge label={page.status === "CONNECTED" ? copy.connected : page.status === "PENDING" ? copy.discovered : copy.reconnect} tone={page.status === "CONNECTED" ? "success" : "warning"} />
                    {canManageConnection && page.status === "PENDING" ? (
                      <Pressable accessibilityRole="button" disabled={busy === `connect-page:${page.id}`} onPress={() => void connectPage(page)} style={[styles.connectButton, { borderColor: theme.primary }]}>
                        <Text style={[styles.connectButtonText, { color: theme.primary }]}>{copy.connectPage}</Text>
                      </Pressable>
                    ) : null}
                    {canManageConnection ? (
                      <Pressable accessibilityRole="button" disabled={busy === `disconnect:${page.id}`} onPress={() => confirmDisconnect(page)} style={styles.iconButton}>
                        <Ionicons name="trash-outline" color={colors.danger} size={20} />
                      </Pressable>
                    ) : null}
                  </SurfaceCard>
                </Pressable>
              ))}
            </View>
          ) : null}

          {tab === "compose" ? (
            <View style={styles.section}>
              <SectionTitle title={copy.selectPage} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
                {pages.filter((page) => page.canPublish).map((page) => <Chip key={page.id} label={page.name} active={selectedPageIds.includes(page.id)} onPress={() => setSelectedPageIds((current) => current.includes(page.id) ? current.filter((id) => id !== page.id) : [...current, page.id])} />)}
              </ScrollView>
              <SurfaceCard style={styles.formCard}>
                <Text style={[styles.label, { color: theme.text }]}>{copy.text}</Text>
                <TextInput multiline value={message} onChangeText={setMessage} placeholder={copy.textPlaceholder} placeholderTextColor={theme.muted} style={[styles.textarea, { color: theme.text, backgroundColor: theme.input, borderColor: theme.border }]} />
                <Text style={[styles.label, { color: theme.text }]}>{copy.link}</Text>
                <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="url" value={link} onChangeText={setLink} placeholder={copy.linkPlaceholder} placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text, backgroundColor: theme.input, borderColor: theme.border }]} />
              </SurfaceCard>
              <SurfaceCard style={styles.formCard}>
                <SectionTitle title={copy.media} />
                <Text style={[styles.help, { color: theme.muted }]}>{copy.photoVideoRule}</Text>
                <View style={styles.actionRow}>
                  <Pressable onPress={() => void addPhotos()} style={[styles.secondaryButton, { borderColor: theme.border, backgroundColor: theme.cardMuted }]}><Ionicons name="images-outline" size={19} color={theme.primary} /><Text style={[styles.secondaryText, { color: theme.text }]}>{copy.addPhotos}</Text></Pressable>
                  <Pressable onPress={() => void addVideo()} style={[styles.secondaryButton, { borderColor: theme.border, backgroundColor: theme.cardMuted }]}><Ionicons name="videocam-outline" size={19} color={theme.primary} /><Text style={[styles.secondaryText, { color: theme.text }]}>{copy.addVideo}</Text></Pressable>
                </View>
                {attachments.map((attachment, index) => (
                  <View key={`${attachment.uri}:${index}`} style={[styles.attachment, { borderColor: theme.border }]}>
                    <Ionicons name={attachment.kind === "VIDEO" ? "videocam-outline" : "image-outline"} size={20} color={theme.primary} />
                    <View style={styles.attachmentText}><Text numberOfLines={1} style={[styles.fileName, { color: theme.text }]}>{attachment.fileName}</Text><Text style={[styles.meta, { color: theme.muted }]}>{formatBytes(attachment.size)}</Text></View>
                    <Pressable onPress={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Ionicons name="close-circle" color={colors.danger} size={24} /></Pressable>
                  </View>
                ))}
              </SurfaceCard>
              <SurfaceCard style={styles.formCard}>
                <SectionTitle title={copy.schedule} />
                <View style={styles.actionRow}><Chip label={copy.now} active={!scheduled} onPress={() => setScheduled(false)} /><Chip label={copy.schedule} active={scheduled} onPress={() => setScheduled(true)} /></View>
                {scheduled ? <Pressable onPress={() => setPickerMode(Platform.OS === "ios" ? "datetime" : "date")} style={[styles.dateButton, { borderColor: theme.border, backgroundColor: theme.input }]}><Ionicons name="calendar-outline" size={20} color={theme.primary} /><Text style={[styles.dateText, { color: theme.text }]}>{scheduledAt.toLocaleString(locale === "tr" ? "tr-TR" : "en-US", { dateStyle: "medium", timeStyle: "short" })}</Text></Pressable> : null}
                {pickerMode ? <DateTimePicker value={scheduledAt} minimumDate={new Date()} mode={pickerMode === "datetime" ? "datetime" : pickerMode} is24Hour locale={locale === "tr" ? "tr-TR" : "en-US"} onChange={onPickerChange} /> : null}
              </SurfaceCard>
              <PrimaryButton title={busy === "publish" ? copy.publishing : copy.publish} icon="logo-facebook" loading={busy === "publish"} disabled={!canPublish || selectedPageIds.length === 0} onPress={() => void publish()} />
            </View>
          ) : null}

          {tab === "history" ? (
            <View style={styles.section}>
              <SectionTitle title={copy.history} />
              {!history.length ? <SurfaceCard><Text style={[styles.empty, { color: theme.muted }]}>{copy.emptyHistory}</Text></SurfaceCard> : history.map((item) => {
                const statusLabel = item.status === "SENT" ? copy.published : item.status === "QUEUED" ? copy.scheduled : item.status === "PENDING" ? (locale === "tr" ? "Kuyrukta" : "Queued") : item.status === "FAILED" ? copy.failed : item.status === "CANCELED" ? copy.deleted : item.status;
                const tone = item.status === "SENT" ? "success" : item.status === "FAILED" ? "danger" : item.status === "CANCELED" ? "default" : "warning";
                return <SurfaceCard key={item.id} style={styles.historyCard}>
                  <View style={styles.historyHeader}><View style={styles.pageText}><Text style={[styles.pageName, { color: theme.text }]}>{item.pageName}</Text><Text style={[styles.meta, { color: theme.muted }]}>{new Date(item.createdAt).toLocaleString(locale === "tr" ? "tr-TR" : "en-US")}</Text></View><Badge label={statusLabel} tone={tone} /></View>
                  {item.content ? <Text style={[styles.historyContent, { color: theme.text }]}>{item.content}</Text> : null}
                  {item.attachmentCount ? <Text style={[styles.meta, { color: theme.muted }]}>{copy.attachmentCount(item.attachmentCount)}</Text> : null}
                  {item.errorMessage ? <Text style={[styles.error, { color: theme.danger }]}>{item.errorMessage}</Text> : null}
                  {item.canDelete && canPublish ? <Pressable disabled={busy === `delete:${item.id}`} onPress={() => confirmDelete(item)} style={[styles.deleteButton, { borderColor: theme.danger }]}><Ionicons name="trash-outline" size={18} color={theme.danger} /><Text style={[styles.deleteText, { color: theme.danger }]}>{copy.delete}</Text></Pressable> : null}
                </SurfaceCard>;
              })}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, screen: { paddingHorizontal: 0, paddingVertical: 0 }, content: { gap: 18, paddingBottom: 56 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, horizontalChips: { paddingRight: 8 }, section: { gap: 14 },
  notice: { fontSize: 14, fontWeight: "800", lineHeight: 21 }, empty: { fontSize: 14, lineHeight: 21, textAlign: "center" },
  pageCard: { alignItems: "center", flexDirection: "row", gap: 12 }, avatar: { borderRadius: 22, height: 44, width: 44 },
  pageText: { flex: 1, gap: 3, minWidth: 0 }, pageName: { fontSize: 16, fontWeight: "900" }, meta: { fontSize: 12, lineHeight: 17 },
  iconButton: { alignItems: "center", justifyContent: "center", minHeight: 40, minWidth: 40 }, formCard: { gap: 12 }, label: { fontSize: 14, fontWeight: "900" },
  textarea: { borderRadius: 16, borderWidth: 1, fontSize: 16, lineHeight: 23, minHeight: 150, padding: 14, textAlignVertical: "top" },
  input: { borderRadius: 16, borderWidth: 1, fontSize: 15, minHeight: 54, paddingHorizontal: 14 }, help: { fontSize: 13, lineHeight: 19 },
  actionRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 9 }, secondaryButton: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 8, minHeight: 48, paddingHorizontal: 14 },
  secondaryText: { fontSize: 13, fontWeight: "900" }, attachment: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, padding: 11 },
  attachmentText: { flex: 1, minWidth: 0 }, fileName: { fontSize: 13, fontWeight: "800" }, dateButton: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 52, paddingHorizontal: 14 },
  dateText: { flex: 1, fontSize: 14, fontWeight: "800" }, historyCard: { gap: 11 }, historyHeader: { alignItems: "center", flexDirection: "row", gap: 12 }, historyContent: { fontSize: 15, lineHeight: 22 },
  error: { fontSize: 13, fontWeight: "800" }, deleteButton: { alignItems: "center", alignSelf: "flex-start", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 7, minHeight: 42, paddingHorizontal: 12 }, deleteText: { fontSize: 13, fontWeight: "900" },
  connectButton: { alignItems: "center", borderRadius: 10, borderWidth: 1, justifyContent: "center", minHeight: 38, paddingHorizontal: 10 }, connectButtonText: { fontSize: 12, fontWeight: "900" },
});
