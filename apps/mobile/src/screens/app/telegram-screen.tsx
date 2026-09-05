import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useSectionHistory } from "@/navigation/use-section-history";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getMobileCategories, type MobileCategory } from "@/api/mobileCategories";
import { getMobileSubscription } from "@/api/mobileSubscription";
import { uploadMobileMessageAttachments, type LocalMessageAttachment } from "@/api/mobileMedia";
import {
  archiveTelegramAccount,
  assignTelegramCategoryChats,
  cancelTelegramDispatch,
  createTelegramAccount,
  createTelegramDispatch,
  deleteTelegramDispatchForEveryone,
  getTelegramAccounts,
  getTelegramChats,
  getTelegramHistory,
  submitTelegramAuth,
  syncTelegramChats,
  type MobileTelegramAccount,
  type MobileTelegramChat,
  type MobileTelegramHistoryItem,
} from "@/api/mobileTelegram";
import { PrimaryButton } from "@/components/primary-button";
import { MessageAttachmentPicker } from "@/components/message-attachment-picker";
import { Screen } from "@/components/screen";
import { Badge, Chip, IconBadge, PageHeader, SectionTitle, StatCard, SurfaceCard } from "@/components/ui";
import { colors } from "@/theme/colors";
import { useTheme } from "@/theme/theme-provider";
import { countryRegistry } from "@/generated/country-registry";

type Tab = "accounts" | "chats" | "send" | "history";
type ScheduleMode = "SEND_NOW" | "SCHEDULED" | "RECURRING";
type SchedulePickerMode = "date" | "time" | "datetime";

const MESSAGE_LIMIT = 4096;
const ADVERTISING_MESSAGE_LIMIT =
  MESSAGE_LIMIT -
  Math.max(...countryRegistry.map((country) => country.attribution.length)) -
  2;

const telegramCopy = {
  addFailed: "Telegram hesabı eklenemedi",
  operationFailed: "İşlem tamamlanamadı.",
  authFailed: "Doğrulama tamamlanamadı",
  authInvalid: "Kod veya bilgi doğrulanamadı.",
  syncDone: "Sohbetler eşitlendi",
  syncSummary: (synced: number, sendable: number) => `${synced} sohbet bulundu; ${sendable} tanesine mesaj gönderilebilir.`,
  syncFailed: "Eşitleme tamamlanamadı",
  archiveTitle: "Telegram hesabını kaldır",
  archiveDescription: "Oturum Telegram’dan kapatılacak ve Logivya’daki hesap arşivlenecek.",
  cancel: "Vazgeç",
  remove: "Kaldır",
  archiveFailed: "Hesap kaldırılamadı",
  categoryDone: "Kategori güncellendi",
  categoryDoneDescription: "Telegram sohbetleri kategoriye kaydedildi.",
  categoryFailed: "Kategori kaydedilemedi",
  invalidDate: "Tarih geçersiz",
  invalidDateDescription: "Gönderim tarihi gelecekte olmalıdır.",
  queued: "Gönderim kuyruğa alındı",
  queuedDescription: "Sonuçları Telegram geçmişinden izleyebilirsiniz.",
  dispatchFailed: "Gönderim oluşturulamadı",
  loading: "Telegram yükleniyor…",
  eyebrow: "Telegram",
  title: "Telegram Yönetimi",
  accountsTitle: "Telegram Hesapları",
  chatsTitle: "Telegram Sohbetleri",
  sendTitle: "Telegram Mesaj Gönder",
  historyTitle: "Telegram Mesaj Geçmişi",
  description: "Telegram hesaplarınızı yönetin, hedefleri düzenleyin ve mesaj gönderimlerini tek ekrandan takip edin.",
  telegram: "Telegram",
  addAccount: "Telegram hesabı ekle",
  noAccount: "Henüz Telegram hesabı eklenmedi.",
  waitingIdentity: "Kimlik doğrulama bekleniyor",
  connected: "Bağlı",
  continue: "Devam et",
  confirmOtherDevice: "Telegram uygulamasında yeni oturum açma isteğini onaylayın.",
  sync: "Sohbetleri eşitle",
  removeAccount: "Hesabı kaldır",
  connectedAccount: "Gönderim hesabı",
  resync: "Sohbetleri yeniden eşitle",
  categoryAssignment: "Kategori ataması",
  categoryHelp: "Bir kategori seçin, ardından bu kategoriye eklenecek sohbetleri işaretleyin.",
  saveCategory: "Kategori atamasını kaydet",
  selectAudiences: "Hedefleri seç",
  searchAudience: "Sohbet veya kanal ara",
  categories: "Kategoriler",
  conversations: "Sohbetler ve kanallar",
  selectVisible: "Görünenleri seç",
  clearVisible: "Görünenleri kaldır",
  noSendable: "Gönderilebilir Telegram sohbeti yok. Önce hesabı bağlayıp sohbetleri eşitleyin.",
  writeMessage: "Mesajınızı yazın",
  messagePlaceholder: "Telegram mesajınızı yazın",
  brandingNotice: "Reklamlı paketinizde mesajın sonuna “Bu mesaj logivya.com üzerinden gönderilmiştir.” otomatik olarak eklenir.",
  messageTooLong: "Mesaj reklam imzasıyla birlikte Telegram sınırını aşıyor. Metni kısaltın.",
  sendNow: "Şimdi gönder",
  schedule: "Zamanla",
  recurring: "Tekrarlı",
  selectDateTime: "Tarih ve saat seçin",
  daily: "Günlük",
  weekly: "Haftalık",
  monthly: "Aylık",
  targetPreview: "Seçilen hedef",
  noTargetSelected: "Henüz hedef seçilmedi",
  selectedChats: (count: number) => `${count} sohbet seçildi`,
  selectedCategories: (count: number) => `${count} kategori seçildi`,
  sendToChats: (count: number) => `${count} sohbete gönder`,
  scheduledSend: "Mesajı zamanla",
  recurringSend: "Tekrarlı gönderim oluştur",
  messageHistory: "Telegram mesaj geçmişi",
  noHistory: "Henüz Telegram gönderimi yok.",
  targetCount: (count: number) => `${count} hedef`,
  runSummary: (sent: number, failed: number, waiting: number) => `Gönderildi: ${sent} · Başarısız: ${failed} · Bekleme: ${waiting}`,
  scheduled: (date: string) => `Planlandı: ${date}`,
  cancelDispatch: "Gönderimi iptal et",
  cancelFailed: "İptal edilemedi",
  deleteForEveryone: "Herkesten sil",
  retryDelete: "Silmeyi tekrar dene",
  deleteTitle: "Telegram mesajını herkesten sil",
  deleteDescription: (count: number) => `${count} gönderilmiş mesaj Telegram'daki tüm alıcılardan silinecek. Bu işlem geri alınamaz.`,
  deleteConfirm: "Herkesten sil",
  deleteSucceeded: (count: number) => `${count} Telegram mesajı herkesten silindi.`,
  deletePartial: (deleted: number, failed: number) => `${deleted} mesaj silindi; ${failed} mesaj Telegram izinleri nedeniyle silinemedi. Tekrar deneyebilirsiniz.`,
  deleteFailed: "Telegram mesajları silinemedi",
  deleteSummary: (deleted: number, total: number, failed: number) => `Herkesten silindi: ${deleted}/${total}${failed ? ` · Silinemedi: ${failed}` : ""}`,
  memberSummary: (type: string, count: number, canSend: boolean) => `${typeLabel(type)} · ${count} üye${canSend ? "" : " · gönderilemez"}`,
  connectedAccountMetric: "Bağlı hesap",
  chatsMetric: "Sohbetler",
  sendableMetric: "Gönderilebilir",
  warningsMetric: "Uyarılar",
  chatMetric: "Sohbet",
  selectedTargetMetric: "Seçilen hedef",
  success: "Başarılı",
  noCategoriesCreated: "Henüz kategori oluşturulmadı.",
};

const moduleTabs: Array<{ key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "accounts", label: "Hesaplar", icon: "person-circle-outline" },
  { key: "chats", label: "Sohbetler", icon: "chatbubbles-outline" },
  { key: "send", label: "Mesaj Gönder", icon: "send-outline" },
  { key: "history", label: "Geçmiş", icon: "time-outline" },
];

function typeLabel(type: string) {
  if (type === "CHANNEL") return "Kanal";
  if (type === "PRIVATE") return "Özel sohbet";
  if (type === "SUPERGROUP") return "Süper grup";
  if (type === "BASIC_GROUP") return "Grup";
  return "Sohbet";
}

function getDefaultScheduleDate() {
  const next = new Date();
  next.setMinutes(next.getMinutes() + 30);
  next.setSeconds(0, 0);
  return next;
}

function mergeScheduleDateAndTime(datePart: Date, timePart: Date) {
  const merged = new Date(datePart);
  merged.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
  return merged;
}

function authPrompt(account: MobileTelegramAccount) {
  if (account.authState === "WAIT_PHONE_NUMBER") return { step: "phone" as const, label: "Telefon numarası", placeholder: "+905551112233", secure: false };
  if (account.authState === "WAIT_CODE") return { step: "code" as const, label: "Telegram doğrulama kodu", placeholder: "12345", secure: false };
  if (account.authState === "WAIT_PASSWORD") return { step: "password" as const, label: "İki adımlı doğrulama parolası", placeholder: account.authStateDetail?.passwordHint || "Parola", secure: true };
  if (account.authState === "WAIT_EMAIL_ADDRESS") return { step: "email" as const, label: "Doğrulama e-postası", placeholder: "ornek@eposta.com", secure: false };
  if (account.authState === "WAIT_EMAIL_CODE") return { step: "email_code" as const, label: "E-posta doğrulama kodu", placeholder: "Kod", secure: false };
  return null;
}

function toneForStatus(status: string) {
  if (status === "CONNECTED" || status === "SENT") return "success" as const;
  if (status === "ERROR" || status === "FAILED") return "danger" as const;
  if (status === "AUTHENTICATING" || status === "PROCESSING" || status === "FLOOD_WAIT") return "warning" as const;
  return "default" as const;
}

function authStateLabel(state: MobileTelegramAccount["authState"]) {
  const labels: Record<MobileTelegramAccount["authState"], string> = {
    STARTING: "Başlatılıyor",
    WAIT_PHONE_NUMBER: "Telefon bekleniyor",
    WAIT_EMAIL_ADDRESS: "E-posta bekleniyor",
    WAIT_EMAIL_CODE: "E-posta kodu bekleniyor",
    WAIT_CODE: "Kod bekleniyor",
    WAIT_PASSWORD: "Parola bekleniyor",
    WAIT_OTHER_DEVICE: "Telegram onayı bekleniyor",
    READY: telegramCopy.connected,
    LOGGING_OUT: "Çıkış yapılıyor",
    CLOSED: "Bağlantı kapalı",
    ERROR: "Bağlantı hatası",
  };
  return labels[state];
}

export function TelegramScreen({ initialTab = "accounts", lockedTab = false, onSwitchToWhatsApp }: { initialTab?: Tab; lockedTab?: boolean; onSwitchToWhatsApp?: () => void } = {}) {
  const theme = useTheme();
  const [tab, setTab, backSection, canGoBackSection] = useSectionHistory<Tab>(initialTab, !lockedTab);
  const [accounts, setAccounts] = useState<MobileTelegramAccount[]>([]);
  const [chats, setChats] = useState<MobileTelegramChat[]>([]);
  const [history, setHistory] = useState<MobileTelegramHistoryItem[]>([]);
  const [categories, setCategories] = useState<MobileCategory[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [sendChatIds, setSendChatIds] = useState<string[]>([]);
  const [sendCategoryIds, setSendCategoryIds] = useState<string[]>([]);
  const [sendSearch, setSendSearch] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryChatIds, setCategoryChatIds] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<LocalMessageAttachment[]>([]);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("SEND_NOW");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(getDefaultScheduleDate());
  const [schedulePickerMode, setSchedulePickerMode] = useState<SchedulePickerMode | null>(null);
  const [recurrence, setRecurrence] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("WEEKLY");
  const [authValues, setAuthValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);
  const [messageBrandingRequired, setMessageBrandingRequired] = useState(true);
  const createInFlight = useRef(false);

  const connectedAccounts = useMemo(() => accounts.filter((account) => account.status === "CONNECTED" && account.authState === "READY"), [accounts]);
  const activeAccount = connectedAccounts.find((account) => account.id === activeAccountId) ?? connectedAccounts[0] ?? null;
  const visibleChats = useMemo(() => chats.filter((chat) => Boolean(activeAccount) && chat.accountId === activeAccount?.id), [activeAccount, chats]);
  const sendableChats = useMemo(() => visibleChats.filter((chat) => {
    if (!chat.canSend || chat.isArchived || chat.type === "SECRET") return false;
    return attachments.every((attachment) => {
      const key = attachment.kind === "PHOTO" ? "canSendPhotos" : attachment.kind === "VIDEO" ? "canSendVideos" : "canSendDocuments";
      return chat.rawPermissions?.[key] !== false;
    });
  }), [attachments, visibleChats]);
  const filteredSendableChats = useMemo(() => {
    const query = sendSearch.trim().toLocaleLowerCase("tr-TR");
    if (!query) return sendableChats;
    return sendableChats.filter((chat) => `${chat.title} ${chat.username || ""}`.toLocaleLowerCase("tr-TR").includes(query));
  }, [sendSearch, sendableChats]);
  const filteredVisibleChats = useMemo(() => {
    const query = chatSearch.trim().toLocaleLowerCase("tr-TR");
    if (!query) return visibleChats;
    return visibleChats.filter((chat) => `${chat.title} ${chat.username || ""}`.toLocaleLowerCase("tr-TR").includes(query));
  }, [chatSearch, visibleChats]);
  const categoryTargetIds = useMemo(() => sendableChats
    .filter((chat) => chat.categoryAssignments.some((assignment) => sendCategoryIds.includes(assignment.category.id)))
    .map((chat) => chat.id), [sendCategoryIds, sendableChats]);
  const effectiveSendChatIds = useMemo(() => [...new Set([...sendChatIds, ...categoryTargetIds])], [categoryTargetIds, sendChatIds]);
  const selectedCategoryNames = useMemo(() => categories.filter((category) => sendCategoryIds.includes(category.id)).map((category) => category.name), [categories, sendCategoryIds]);
  const warningCount = accounts.filter((account) => account.status === "ERROR" || account.authState === "ERROR").length;
  const messageLimit = messageBrandingRequired ? ADVERTISING_MESSAGE_LIMIT : MESSAGE_LIMIT;

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [accountResult, chatResult, historyResult, categoryResult, subscriptionResult] = await Promise.all([
        getTelegramAccounts(),
        getTelegramChats(),
        getTelegramHistory(),
        getMobileCategories(),
        getMobileSubscription().catch(() => null),
      ]);
      setAccounts(accountResult.accounts);
      setChats(chatResult.chats);
      setHistory(historyResult.items);
      setCategories(categoryResult.categories);
      setMessageBrandingRequired(
        subscriptionResult?.subscription?.entitlements.messageBrandingRequired ?? true,
      );
      const connected = accountResult.accounts.find((account) => account.status === "CONNECTED" && account.authState === "READY");
      setActiveAccountId((current) => current && accountResult.accounts.some((account) => account.id === current) ? current : connected?.id ?? null);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Telegram bilgileri yüklenemedi.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!accounts.some((account) => !["READY", "CLOSED", "ERROR"].includes(account.authState))) return;
    const timer = setInterval(() => void load(true), 3_000);
    return () => clearInterval(timer);
  }, [accounts, load]);

  function toggleId(id: string, values: string[], setter: (next: string[]) => void) {
    setter(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);
    setSendFeedback(null);
  }

  function chooseAccount(accountId: string) {
    setActiveAccountId(accountId);
    setSendChatIds([]);
    setSendCategoryIds([]);
    setSelectedCategoryId(null);
    setCategoryChatIds([]);
    setSendFeedback(null);
  }

  async function addAccount() {
    if (createInFlight.current) return;
    createInFlight.current = true;
    setWorking("create");
    try {
      await createTelegramAccount();
      await load(true);
    } catch (actionError) {
      Alert.alert(telegramCopy.addFailed, actionError instanceof Error ? actionError.message : telegramCopy.operationFailed);
    } finally {
      createInFlight.current = false;
      setWorking(null);
    }
  }

  async function submitAuth(account: MobileTelegramAccount) {
    const prompt = authPrompt(account);
    const value = authValues[account.id]?.trim();
    if (!prompt || !value) return;
    setWorking(`auth:${account.id}`);
    try {
      await submitTelegramAuth(account.id, prompt.step, value);
      setAuthValues((current) => ({ ...current, [account.id]: "" }));
      await load(true);
    } catch (actionError) {
      Alert.alert(telegramCopy.authFailed, actionError instanceof Error ? actionError.message : telegramCopy.authInvalid);
    } finally {
      setWorking(null);
    }
  }

  async function syncAccount(accountId: string) {
    setWorking(`sync:${accountId}`);
    try {
      const result = await syncTelegramChats(accountId);
      await load(true);
      Alert.alert(telegramCopy.syncDone, telegramCopy.syncSummary(result.synced, result.sendable));
    } catch (actionError) {
      Alert.alert(telegramCopy.syncFailed, actionError instanceof Error ? actionError.message : telegramCopy.operationFailed);
    } finally {
      setWorking(null);
    }
  }

  function confirmArchive(account: MobileTelegramAccount) {
    Alert.alert(telegramCopy.archiveTitle, telegramCopy.archiveDescription, [
      { text: telegramCopy.cancel, style: "cancel" },
      { text: telegramCopy.remove, style: "destructive", onPress: () => void (async () => {
        setWorking(`archive:${account.id}`);
        try { await archiveTelegramAccount(account.id); await load(true); }
        catch (actionError) { Alert.alert(telegramCopy.archiveFailed, actionError instanceof Error ? actionError.message : telegramCopy.operationFailed); }
        finally { setWorking(null); }
      })() },
    ]);
  }

  function selectCategory(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setCategoryChatIds(visibleChats.filter((chat) => chat.categoryAssignments.some((assignment) => assignment.category.id === categoryId)).map((chat) => chat.id));
  }

  async function saveCategory() {
    if (!selectedCategoryId) return;
    setWorking("category");
    try {
      await assignTelegramCategoryChats(selectedCategoryId, categoryChatIds);
      await load(true);
      Alert.alert(telegramCopy.categoryDone, telegramCopy.categoryDoneDescription);
    } catch (actionError) {
      Alert.alert(telegramCopy.categoryFailed, actionError instanceof Error ? actionError.message : telegramCopy.operationFailed);
    } finally { setWorking(null); }
  }

  function toggleVisibleSendChats() {
    const ids = filteredSendableChats.map((chat) => chat.id);
    const allSelected = ids.length > 0 && ids.every((id) => sendChatIds.includes(id));
    setSendChatIds(allSelected ? sendChatIds.filter((id) => !ids.includes(id)) : [...new Set([...sendChatIds, ...ids])]);
    setSendFeedback(null);
  }

  function openSchedulePicker() {
    if (!scheduledAt) setScheduledAt(getDefaultScheduleDate());
    setSchedulePickerMode(Platform.OS === "ios" ? "datetime" : "date");
  }

  function handleSchedulePickerChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (event.type === "dismissed") {
      setSchedulePickerMode(null);
      return;
    }
    if (!selectedDate) return;
    if (Platform.OS === "android" && schedulePickerMode === "date") {
      setScheduledAt(mergeScheduleDateAndTime(selectedDate, scheduledAt ?? getDefaultScheduleDate()));
      setSchedulePickerMode(null);
      setTimeout(() => setSchedulePickerMode("time"), 80);
      return;
    }
    const next = Platform.OS === "android" && schedulePickerMode === "time"
      ? mergeScheduleDateAndTime(scheduledAt ?? getDefaultScheduleDate(), selectedDate)
      : selectedDate;
    setScheduledAt(next);
    setSchedulePickerMode(Platform.OS === "ios" ? "datetime" : null);
  }

  async function send() {
    if (!activeAccount || (!content.trim() && !attachments.length) || effectiveSendChatIds.length === 0) return;
    const normalizedContent = content.trim();
    if (normalizedContent.length > messageLimit) {
      return Alert.alert(telegramCopy.dispatchFailed, telegramCopy.messageTooLong);
    }
    let scheduledIso: string | undefined;
    if (scheduleMode !== "SEND_NOW") {
      if (!scheduledAt || scheduledAt.getTime() <= Date.now()) return Alert.alert(telegramCopy.invalidDate, telegramCopy.invalidDateDescription);
      scheduledIso = scheduledAt.toISOString();
    }
    setWorking("send");
    setSendFeedback(null);
    try {
      const uploaded = attachments.length ? await uploadMobileMessageAttachments(attachments, "TELEGRAM") : [];
      await createTelegramDispatch({
        accountId: activeAccount.id,
        clientRequestId: `telegram-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        title: (normalizedContent || attachments[0]?.fileName || telegramCopy.writeMessage).slice(0, 120),
        content: normalizedContent,
        ...(uploaded.length ? { mediaFileIds: uploaded.map((item) => item.attachment.mediaFileId) } : {}),
        chatIds: effectiveSendChatIds,
        scheduleType: scheduleMode,
        ...(scheduledIso ? { scheduledAt: scheduledIso } : {}),
        ...(scheduleMode === "RECURRING" ? { recurringRule: { frequency: recurrence, interval: 1 } } : {}),
      });
      const targetCount = effectiveSendChatIds.length;
      setContent("");
      setAttachments([]);
      setSendChatIds([]);
      setSendCategoryIds([]);
      setSendFeedback(`${targetCount} sohbet için gönderim kuyruğa alındı.`);
      await load(true);
      if (!lockedTab) setTab("history");
      Alert.alert(telegramCopy.queued, telegramCopy.queuedDescription);
    } catch (actionError) {
      Alert.alert(telegramCopy.dispatchFailed, actionError instanceof Error ? actionError.message : telegramCopy.operationFailed);
    } finally { setWorking(null); }
  }

  function confirmDeleteForEveryone(item: MobileTelegramHistoryItem) {
    const sentCount = Math.max(
      item.deleteTotalCount,
      item.runs.reduce((total, run) => total + run.sentCount, 0),
    );
    if (sentCount <= 0) return;
    Alert.alert(
      telegramCopy.deleteTitle,
      telegramCopy.deleteDescription(sentCount),
      [
        { text: telegramCopy.cancel, style: "cancel" },
        {
          text: telegramCopy.deleteConfirm,
          style: "destructive",
          onPress: () => void (async () => {
            setWorking(`delete:${item.id}`);
            try {
              const result = await deleteTelegramDispatchForEveryone(item.id);
              await load(true);
              Alert.alert(
                result.failed > 0 ? telegramCopy.deleteFailed : telegramCopy.deleteForEveryone,
                result.failed > 0
                  ? telegramCopy.deletePartial(result.deleted, result.failed)
                  : telegramCopy.deleteSucceeded(result.deleted),
              );
            } catch (actionError) {
              Alert.alert(
                telegramCopy.deleteFailed,
                actionError instanceof Error ? actionError.message : telegramCopy.operationFailed,
              );
            } finally {
              setWorking(null);
            }
          })(),
        },
      ],
    );
  }

  const scheduledAtLabel = scheduledAt?.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) ?? telegramCopy.selectDateTime;
  const selectedTargetSummary = effectiveSendChatIds.length
    ? `${telegramCopy.selectedChats(effectiveSendChatIds.length)}${selectedCategoryNames.length ? ` · ${telegramCopy.selectedCategories(selectedCategoryNames.length)}` : ""}`
    : telegramCopy.noTargetSelected;

  if (loading) return <Screen style={styles.center}><Text style={{ color: theme.muted }}>{telegramCopy.loading}</Text></Screen>;

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboard}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {canGoBackSection ? <Pressable onPress={backSection} accessibilityRole="button" style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 }}><Ionicons name="arrow-back" size={22} color={theme.primary} /><Text style={{ color: theme.primary }}>Geri</Text></Pressable> : null}
          <PageHeader eyebrow={telegramCopy.eyebrow} title={telegramCopy.title} description={telegramCopy.description} />
          {onSwitchToWhatsApp ? <View style={styles.platformRow}><Chip label="WhatsApp" active={false} onPress={onSwitchToWhatsApp} /><Chip label={telegramCopy.telegram} active onPress={() => undefined} /></View> : null}
          {error ? <SurfaceCard><Text style={{ color: colors.danger, fontWeight: "800" }}>{error}</Text></SurfaceCard> : null}
          {!lockedTab ? (
            <View style={styles.moduleTabs}>
              {moduleTabs.map((item) => <ModuleTab key={item.key} active={tab === item.key} icon={item.icon} label={item.label} onPress={() => setTab(item.key)} />)}
            </View>
          ) : null}

          {tab === "accounts" ? (
            <View style={styles.section}>
              <View style={styles.grid}>
                <StatCard icon="checkmark-circle-outline" label={telegramCopy.connectedAccountMetric} value={connectedAccounts.length} tone="success" />
                <StatCard icon="chatbubbles-outline" label={telegramCopy.chatsMetric} value={chats.length} />
                <StatCard icon="send-outline" label={telegramCopy.sendableMetric} value={chats.filter((chat) => chat.canSend && !chat.isArchived && chat.type !== "SECRET").length} />
                <StatCard icon="alert-circle-outline" label={telegramCopy.warningsMetric} value={warningCount} tone={warningCount ? "danger" : "default"} />
              </View>
              <PrimaryButton title={telegramCopy.addAccount} icon="paper-plane-outline" loading={working === "create"} onPress={() => void addAccount()} />
              <SectionTitle title={telegramCopy.accountsTitle} />
              {accounts.length === 0 ? <SurfaceCard><Text style={{ color: theme.muted }}>{telegramCopy.noAccount}</Text></SurfaceCard> : accounts.map((account) => {
                const prompt = authPrompt(account);
                const displayName = [account.firstName, account.lastName].filter(Boolean).join(" ") || account.label;
                const accountChats = chats.filter((chat) => chat.accountId === account.id);
                const accountSendable = accountChats.filter((chat) => chat.canSend && !chat.isArchived && chat.type !== "SECRET");
                return (
                  <SurfaceCard key={account.id} style={styles.card}>
                    <View style={styles.row}>
                      <IconBadge icon="paper-plane-outline" tone={toneForStatus(account.status)} />
                      <View style={styles.grow}>
                        <Text style={[styles.cardTitle, { color: theme.text }]}>{displayName}</Text>
                        <Text style={[styles.meta, { color: theme.muted }]}>{account.username ? `@${account.username}` : account.phoneNumberMasked || telegramCopy.waitingIdentity}</Text>
                      </View>
                      <Badge label={authStateLabel(account.authState)} tone={toneForStatus(account.status)} />
                    </View>
                    <View style={[styles.accountStats, { borderColor: theme.border }]}>
                      <View style={styles.accountStat}><Text style={[styles.accountStatValue, { color: theme.text }]}>{accountChats.length}</Text><Text style={[styles.accountStatLabel, { color: theme.muted }]}>{telegramCopy.chatMetric}</Text></View>
                      <View style={[styles.accountStatDivider, { backgroundColor: theme.border }]} />
                      <View style={styles.accountStat}><Text style={[styles.accountStatValue, { color: theme.text }]}>{accountSendable.length}</Text><Text style={[styles.accountStatLabel, { color: theme.muted }]}>{telegramCopy.sendableMetric}</Text></View>
                    </View>
                    {prompt ? (
                      <View style={styles.form}>
                        <Text style={[styles.label, { color: theme.text }]}>{prompt.label}</Text>
                        <TextInput autoCapitalize="none" onChangeText={(value) => setAuthValues((current) => ({ ...current, [account.id]: value }))} placeholder={prompt.placeholder} placeholderTextColor={theme.muted} secureTextEntry={prompt.secure} style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.cardMuted }]} value={authValues[account.id] || ""} />
                        <PrimaryButton title={telegramCopy.continue} loading={working === `auth:${account.id}`} disabled={!authValues[account.id]?.trim()} onPress={() => void submitAuth(account)} />
                      </View>
                    ) : null}
                    {account.authState === "WAIT_OTHER_DEVICE" ? <Text style={[styles.meta, { color: theme.muted }]}>{telegramCopy.confirmOtherDevice}</Text> : null}
                    <View style={styles.actionRow}>
                      {account.authState === "READY" ? <SmallAction icon="refresh-outline" label={telegramCopy.sync} loading={working === `sync:${account.id}`} onPress={() => void syncAccount(account.id)} /> : null}
                      <SmallAction icon="trash-outline" label={telegramCopy.removeAccount} danger onPress={() => confirmArchive(account)} />
                    </View>
                  </SurfaceCard>
                );
              })}
            </View>
          ) : null}

          {tab === "chats" ? (
            <View style={styles.section}>
              <SurfaceCard style={styles.card}>
                <SectionTitle title={telegramCopy.connectedAccount} />
                <View style={styles.platformRow}>{connectedAccounts.map((account) => <Chip key={account.id} label={account.username ? `@${account.username}` : account.label} active={activeAccount?.id === account.id} onPress={() => chooseAccount(account.id)} />)}</View>
                {activeAccount ? <PrimaryButton title={telegramCopy.resync} icon="refresh-outline" loading={working === `sync:${activeAccount.id}`} onPress={() => void syncAccount(activeAccount.id)} /> : null}
              </SurfaceCard>
              <SurfaceCard style={styles.card}>
                <SectionTitle title={telegramCopy.categoryAssignment} />
                <Text style={[styles.meta, { color: theme.muted }]}>{telegramCopy.categoryHelp}</Text>
                <View style={styles.platformRow}>{categories.map((category) => <Chip key={category.id} label={category.name} active={selectedCategoryId === category.id} onPress={() => selectCategory(category.id)} />)}</View>
                <SearchBox value={chatSearch} onChangeText={setChatSearch} placeholder={telegramCopy.searchAudience} />
                <Text style={[styles.groupTitle, { color: theme.muted }]}>{telegramCopy.conversations} ({filteredVisibleChats.length})</Text>
                <View style={styles.optionGrid}>{filteredVisibleChats.map((chat) => <ChatRow key={chat.id} chat={chat} selected={categoryChatIds.includes(chat.id)} selectable={Boolean(selectedCategoryId)} onPress={() => selectedCategoryId && toggleId(chat.id, categoryChatIds, setCategoryChatIds)} />)}</View>
                <PrimaryButton title={telegramCopy.saveCategory} loading={working === "category"} disabled={!selectedCategoryId} onPress={() => void saveCategory()} />
              </SurfaceCard>
            </View>
          ) : null}

          {tab === "send" ? (
            <View style={styles.section}>
              <View style={styles.grid}>
                <StatCard icon="people-outline" label={telegramCopy.selectedTargetMetric} value={effectiveSendChatIds.length} />
                <StatCard icon="checkmark-done-outline" label={telegramCopy.sendableMetric} value={sendableChats.length} tone="success" />
                <StatCard icon="albums-outline" label={telegramCopy.categories} value={categories.length} />
                <StatCard icon="person-circle-outline" label={telegramCopy.connectedAccountMetric} value={connectedAccounts.length} />
              </View>

              <SurfaceCard style={styles.card}>
                <View style={styles.writeHeader}><SectionTitle title={telegramCopy.writeMessage} /><Badge label={`${content.length}/${messageLimit}`} /></View>
                <TextInput multiline maxLength={messageLimit} onChangeText={(value) => { setContent(value); setSendFeedback(null); }} placeholder={telegramCopy.messagePlaceholder} placeholderTextColor={theme.muted} style={[styles.textarea, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]} textAlignVertical="top" value={content} />
                <MessageAttachmentPicker value={attachments} onChange={(value) => { setAttachments(value); setSendFeedback(null); }} onError={(message) => message && Alert.alert(telegramCopy.dispatchFailed, message)} platform="TELEGRAM" disabled={working === "send"} />
                {messageBrandingRequired ? <Text style={[styles.meta, { color: theme.muted }]}>{telegramCopy.brandingNotice}</Text> : null}
                <View style={styles.modeRow}>
                  <ModeButton active={scheduleMode === "SEND_NOW"} label={telegramCopy.sendNow} onPress={() => setScheduleMode("SEND_NOW")} />
                  <ModeButton active={scheduleMode === "SCHEDULED"} label={telegramCopy.schedule} onPress={() => setScheduleMode("SCHEDULED")} />
                  <ModeButton active={scheduleMode === "RECURRING"} label={telegramCopy.recurring} onPress={() => setScheduleMode("RECURRING")} />
                </View>
                {scheduleMode !== "SEND_NOW" ? (
                  <View style={styles.scheduleBox}>
                    <Pressable accessibilityRole="button" onPress={openSchedulePicker} style={({ pressed }) => [styles.scheduleInputButton, { borderColor: theme.border, backgroundColor: theme.background, opacity: pressed ? 0.82 : 1 }]}>
                      <Text style={[styles.scheduleInputText, { color: scheduledAt ? theme.text : theme.muted }]}>{scheduledAtLabel}</Text>
                      <Ionicons name="calendar-outline" size={20} color={theme.primary} />
                    </Pressable>
                    {schedulePickerMode ? <DateTimePicker value={scheduledAt ?? getDefaultScheduleDate()} mode={schedulePickerMode === "datetime" ? "datetime" : schedulePickerMode} display={Platform.OS === "ios" ? "compact" : "default"} minimumDate={new Date()} is24Hour locale="tr-TR" positiveButton={{ label: "Seç" }} negativeButton={{ label: telegramCopy.cancel }} onChange={handleSchedulePickerChange} /> : null}
                  </View>
                ) : null}
                {scheduleMode === "RECURRING" ? <View style={styles.modeRow}><ModeButton active={recurrence === "DAILY"} label={telegramCopy.daily} onPress={() => setRecurrence("DAILY")} /><ModeButton active={recurrence === "WEEKLY"} label={telegramCopy.weekly} onPress={() => setRecurrence("WEEKLY")} /><ModeButton active={recurrence === "MONTHLY"} label={telegramCopy.monthly} onPress={() => setRecurrence("MONTHLY")} /></View> : null}
                <View style={[styles.preview, { borderColor: theme.border, backgroundColor: theme.badge }]}>
                  <Text style={[styles.previewLabel, { color: theme.primary }]}>{telegramCopy.targetPreview}</Text>
                  <Text style={[styles.previewText, { color: theme.text }]}>{selectedTargetSummary}</Text>
                  {selectedCategoryNames.length ? <Text style={[styles.meta, { color: theme.muted }]}>{selectedCategoryNames.join(", ")}</Text> : null}
                </View>
                {sendFeedback ? <View style={[styles.successBanner, { borderColor: theme.success, backgroundColor: theme.successSoft }]}><Text style={[styles.successTitle, { color: theme.success }]}>{telegramCopy.success}</Text><Text style={[styles.successMessage, { color: theme.success }]}>{sendFeedback}</Text></View> : null}
                <PrimaryButton title={scheduleMode === "SCHEDULED" ? telegramCopy.scheduledSend : scheduleMode === "RECURRING" ? telegramCopy.recurringSend : telegramCopy.sendToChats(effectiveSendChatIds.length)} icon="send-outline" loading={working === "send"} disabled={!activeAccount || (!content.trim() && !attachments.length) || content.trim().length > messageLimit || effectiveSendChatIds.length === 0} onPress={() => void send()} />
              </SurfaceCard>

              <SurfaceCard style={styles.card}>
                <SectionTitle title={telegramCopy.selectAudiences} />
                <Text style={[styles.groupTitle, { color: theme.muted }]}>{telegramCopy.connectedAccount}</Text>
                <View style={styles.platformRow}>{connectedAccounts.map((account) => <Chip key={account.id} label={account.username ? `@${account.username}` : account.label} active={activeAccount?.id === account.id} onPress={() => chooseAccount(account.id)} />)}</View>
                <SearchBox value={sendSearch} onChangeText={setSendSearch} placeholder={telegramCopy.searchAudience} />
                <Text style={[styles.groupTitle, { color: theme.muted }]}>{telegramCopy.categories}</Text>
                {categories.length ? <View style={styles.optionGrid}>{categories.map((category) => {
                  const count = sendableChats.filter((chat) => chat.categoryAssignments.some((assignment) => assignment.category.id === category.id)).length;
                  return <AudienceRow key={category.id} label={category.name} meta={`${count} sohbet`} selected={sendCategoryIds.includes(category.id)} onPress={() => toggleId(category.id, sendCategoryIds, setSendCategoryIds)} />;
                })}</View> : <Text style={[styles.meta, { color: theme.muted }]}>{telegramCopy.noCategoriesCreated}</Text>}
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.groupTitle, { color: theme.muted }]}>{telegramCopy.conversations}</Text>
                  <Pressable accessibilityRole="button" onPress={toggleVisibleSendChats} style={[styles.smallButton, { borderColor: theme.border }]}><Text style={[styles.smallButtonText, { color: theme.text }]}>{filteredSendableChats.length > 0 && filteredSendableChats.every((chat) => sendChatIds.includes(chat.id)) ? telegramCopy.clearVisible : telegramCopy.selectVisible}</Text></Pressable>
                </View>
                {filteredSendableChats.length ? <View style={styles.optionGrid}>{filteredSendableChats.map((chat) => <ChatRow key={chat.id} chat={chat} selected={sendChatIds.includes(chat.id)} selectable onPress={() => toggleId(chat.id, sendChatIds, setSendChatIds)} />)}</View> : <View style={styles.emptyBox}><Ionicons name="chatbubbles-outline" size={28} color={theme.muted} /><Text style={[styles.meta, { color: theme.muted, textAlign: "center" }]}>{telegramCopy.noSendable}</Text>{activeAccount ? <PrimaryButton title={telegramCopy.resync} icon="refresh-outline" loading={working === `sync:${activeAccount.id}`} onPress={() => void syncAccount(activeAccount.id)} /> : null}</View>}
              </SurfaceCard>
            </View>
          ) : null}

          {tab === "history" ? (
            <View style={styles.section}>
              <SectionTitle title={telegramCopy.messageHistory} />
              {history.length === 0 ? <SurfaceCard><Text style={{ color: theme.muted }}>{telegramCopy.noHistory}</Text></SurfaceCard> : history.map((item) => {
                const run = item.runs[0];
                const sentCount = Math.max(item.deleteTotalCount, item.runs.reduce((total, historyRun) => total + historyRun.sentCount, 0));
                const deleteComplete = item.deleteTotalCount > 0 && item.deleteSuccessCount >= item.deleteTotalCount;
                return (
                  <SurfaceCard key={item.id} style={styles.card}>
                    <View style={styles.row}>
                      <IconBadge icon="send-outline" tone={toneForStatus(run?.status || item.status)} />
                      <View style={styles.grow}>
                        <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>{item.content || item.contentJson?.attachments?.[0]?.fileName || item.contentJson?.attachment?.fileName || telegramCopy.writeMessage}</Text>
                        {(item.contentJson?.attachments?.length || item.contentJson?.attachment) ? <Text style={[styles.meta, { color: theme.primary }]}>📎 {item.contentJson?.attachments?.length ? `${item.contentJson.attachments.length} dosya` : item.contentJson?.attachment?.fileName}</Text> : null}
                        <Text style={[styles.meta, { color: theme.muted }]}>{new Date(item.createdAt).toLocaleString("tr-TR")} · {telegramCopy.targetCount(item.targets.length)}</Text>
                      </View>
                      <Badge label={run?.status || item.status} tone={toneForStatus(run?.status || item.status)} />
                    </View>
                    {run ? <Text style={[styles.meta, { color: theme.muted }]}>{telegramCopy.runSummary(run.sentCount, run.failedCount, run.floodWaitCount)}</Text> : <Text style={[styles.meta, { color: theme.muted }]}>{telegramCopy.scheduled(new Date(item.nextRunAt).toLocaleString("tr-TR"))}</Text>}
                    {item.deleteRequestedAt ? <Text style={[styles.deleteSummary, { color: deleteComplete ? theme.success : item.deleteFailedCount > 0 ? theme.danger : theme.muted }]}>{telegramCopy.deleteSummary(item.deleteSuccessCount, item.deleteTotalCount, item.deleteFailedCount)}</Text> : null}
                    <View style={styles.actionRow}>
                      {item.status === "ACTIVE" ? <SmallAction icon="close-circle-outline" label={telegramCopy.cancelDispatch} danger onPress={() => void cancelTelegramDispatch(item.id).then(() => load(true)).catch((actionError) => Alert.alert(telegramCopy.cancelFailed, actionError instanceof Error ? actionError.message : telegramCopy.operationFailed))} /> : null}
                      {sentCount > 0 && !deleteComplete ? <SmallAction icon="trash-outline" label={item.deleteFailedCount > 0 ? telegramCopy.retryDelete : telegramCopy.deleteForEveryone} danger loading={working === `delete:${item.id}`} onPress={() => confirmDeleteForEveryone(item)} /> : null}
                    </View>
                  </SurfaceCard>
                );
              })}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ModuleTab({ active, icon, label, onPress }: { active: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [styles.moduleTab, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.card, opacity: pressed ? 0.8 : 1 }]}>
      <Ionicons name={icon} size={19} color={active ? theme.primaryText : theme.icon} />
      <Text style={[styles.moduleTabText, { color: active ? theme.primaryText : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

function SearchBox({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.searchBox, { borderColor: theme.border, backgroundColor: theme.card }]}>
      <Ionicons name="search-outline" size={18} color={theme.muted} />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.muted} style={[styles.searchInput, { color: theme.text }]} />
    </View>
  );
}

function AudienceRow({ label, meta, selected, onPress }: { label: string; meta: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }) => [styles.selectable, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.badge : theme.card, opacity: pressed ? 0.78 : 1 }]}>
      <Ionicons name={selected ? "checkbox" : "square-outline"} size={21} color={selected ? theme.primary : theme.muted} />
      <Text style={[styles.selectableLabel, { color: theme.text }]} numberOfLines={2}>{label}</Text>
      <Text style={[styles.selectableMeta, { color: theme.muted }]}>{meta}</Text>
    </Pressable>
  );
}

function ChatRow({ chat, selected, selectable, onPress }: { chat: MobileTelegramChat; selected: boolean; selectable: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole={selectable ? "checkbox" : undefined} accessibilityState={selectable ? { checked: selected } : undefined} disabled={!selectable} onPress={onPress} style={({ pressed }) => [styles.chatRow, { backgroundColor: selected ? theme.badge : theme.card, borderColor: selected ? theme.primary : theme.border, opacity: !chat.canSend ? 0.6 : pressed ? 0.78 : 1 }]}>
      <Ionicons name={chat.type === "CHANNEL" ? "megaphone-outline" : chat.type === "PRIVATE" ? "person-outline" : "people-outline"} color={selected ? theme.primary : theme.icon} size={21} />
      <View style={styles.grow}>
        <Text style={[styles.chatTitle, { color: theme.text }]} numberOfLines={1}>{chat.title}</Text>
        <Text style={[styles.meta, { color: theme.muted }]} numberOfLines={1}>{telegramCopy.memberSummary(chat.type, chat.participantCount, chat.canSend)}</Text>
      </View>
      {selectable ? <Ionicons name={selected ? "checkbox" : "square-outline"} color={selected ? theme.primary : theme.iconMuted} size={23} /> : null}
    </Pressable>
  );
}

function ModeButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.modeButton, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.card }]}>
      <Text style={[styles.modeButtonText, { color: active ? theme.primaryText : theme.text }]} numberOfLines={2} adjustsFontSizeToFit>{label}</Text>
    </Pressable>
  );
}

function SmallAction({ icon, label, onPress, danger = false, loading = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean; loading?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable disabled={loading} onPress={onPress} style={({ pressed }) => [styles.smallAction, { borderColor: danger ? colors.danger : theme.border, opacity: loading || pressed ? 0.62 : 1 }]}>
      <Ionicons name={loading ? "hourglass-outline" : icon} color={danger ? colors.danger : theme.text} size={17} />
      <Text style={{ color: danger ? colors.danger : theme.text, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  keyboard: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  content: { gap: 16, paddingBottom: 48 },
  section: { gap: 16 },
  card: { gap: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  platformRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  moduleTabs: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  moduleTab: { alignItems: "center", borderRadius: 16, borderWidth: 1, flexBasis: "47%", flexDirection: "row", flexGrow: 1, gap: 8, justifyContent: "center", minHeight: 50, paddingHorizontal: 12 },
  moduleTabText: { fontSize: 14, fontWeight: "900" },
  row: { alignItems: "center", flexDirection: "row", gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 17, fontWeight: "900", lineHeight: 22 },
  chatTitle: { fontSize: 15, fontWeight: "900" },
  meta: { fontSize: 13, fontWeight: "700", lineHeight: 19 },
  form: { gap: 9 },
  label: { fontSize: 14, fontWeight: "800" },
  input: { borderRadius: 14, borderWidth: 1, fontSize: 15, minHeight: 50, paddingHorizontal: 14 },
  accountStats: { alignItems: "center", borderRadius: 16, borderWidth: 1, flexDirection: "row", minHeight: 82, paddingHorizontal: 16, paddingVertical: 14 },
  accountStat: { alignItems: "center", flex: 1, gap: 4 },
  accountStatDivider: { height: 46, width: 1 },
  accountStatValue: { fontSize: 28, fontWeight: "900" },
  accountStatLabel: { fontSize: 13, fontWeight: "800" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  smallAction: { alignItems: "center", borderRadius: 13, borderWidth: 1, flexDirection: "row", gap: 7, minHeight: 42, paddingHorizontal: 12, paddingVertical: 8 },
  searchBox: { alignItems: "center", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 54, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 15, minHeight: 50 },
  groupTitle: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  optionGrid: { gap: 9 },
  sectionHeaderRow: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  smallButton: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  smallButtonText: { fontSize: 12, fontWeight: "900" },
  selectable: { alignItems: "center", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 54, paddingHorizontal: 13, paddingVertical: 10 },
  selectableLabel: { flex: 1, fontSize: 15, fontWeight: "900", lineHeight: 20 },
  selectableMeta: { fontSize: 12, fontWeight: "800" },
  chatRow: { alignItems: "center", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 11, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10 },
  writeHeader: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  textarea: { borderRadius: 18, borderWidth: 1, fontSize: 16, lineHeight: 22, minHeight: 180, padding: 14 },
  modeRow: { flexDirection: "row", gap: 8 },
  modeButton: { alignItems: "center", borderRadius: 14, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 48, minWidth: 0, paddingHorizontal: 8 },
  modeButtonText: { fontSize: 13, fontWeight: "900", lineHeight: 16, textAlign: "center" },
  scheduleBox: { gap: 10 },
  scheduleInputButton: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, justifyContent: "space-between", minHeight: 52, paddingHorizontal: 14, paddingVertical: 13 },
  scheduleInputText: { flex: 1, fontSize: 16, fontWeight: "800", lineHeight: 22 },
  preview: { borderRadius: 18, borderWidth: 1, gap: 6, padding: 14 },
  previewLabel: { fontSize: 13, fontWeight: "900" },
  previewText: { fontSize: 15, fontWeight: "800", lineHeight: 22 },
  successBanner: { borderRadius: 18, borderWidth: 1, gap: 4, padding: 14 },
  successTitle: { fontSize: 15, fontWeight: "900" },
  successMessage: { fontSize: 14, fontWeight: "800", lineHeight: 20 },
  deleteSummary: { fontSize: 13, fontWeight: "900", lineHeight: 19 },
  emptyBox: { alignItems: "center", gap: 12, paddingVertical: 18 },
});
