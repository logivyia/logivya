import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";

import {
  deleteMobileMessageForEveryone,
  deleteMobileMessageForMe,
  getMobileMessageHistory,
  platformDeleteMobileMessage,
  type MobileDeleteForEveryoneState,
  type MobileMessageCampaign
} from "@/api/mobileMessages";
import { Screen } from "@/components/screen";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { Badge, Chip, PageHeader, StatCard } from "@/components/ui";
import { useTelegramAccessEnabled } from "@/features/telegram/telegramAccessStore";
import { formatDateTime } from "@/i18n/format";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import { TelegramScreen } from "@/screens/app/telegram-screen";
import type { AppTabParamList } from "@/types/navigation";

export function MessageHistoryScreen() {
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const route = useRoute<RouteProp<AppTabParamList, "MessageHistory">>();
  const telegramEnabled = useTelegramAccessEnabled();
  const [historyPlatform, setHistoryPlatform] = useState<"WHATSAPP" | "TELEGRAM">(route.params?.initialPlatform ?? "WHATSAPP");
  const [campaigns, setCampaigns] = useState<MobileMessageCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  useEffect(() => {
    setHistoryPlatform(route.params?.initialPlatform ?? "WHATSAPP");
  }, [route.params?.initialPlatform]);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    setError(null);
    try {
      const response = await getMobileMessageHistory({ limit: 30 });
      setCampaigns(response.campaigns);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("actionFailed"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(campaign: MobileMessageCampaign, action: "deleteForMe" | "deleteForEveryone" | "platformDelete") {
    const labels = {
      deleteForMe: {
        title: t("deleteForMe"),
        message: t("deleteForMeDescription"),
      },
      deleteForEveryone: {
        title: t("deleteForEveryone"),
        message: t("deleteForEveryoneDescription"),
      },
      platformDelete: {
        title: t("deleteFromPlatform"),
        message: t("deleteFromPlatformDescription"),
      },
    }[action];

    Alert.alert(labels.title, labels.message, [
      { text: t("cancel"), style: "cancel" },
      {
        text: action === "platformDelete" ? t("delete") : t("continue"),
        style: action === "platformDelete" ? "destructive" : "default",
        onPress: () => {
          void (async () => {
            setWorkingId(campaign.id);
            try {
              if (action === "deleteForMe") await deleteMobileMessageForMe(campaign.id);
              if (action === "deleteForEveryone") await deleteMobileMessageForEveryone(campaign.id);
              if (action === "platformDelete") await platformDeleteMobileMessage(campaign.id);
              await load("refresh");
            } catch (actionError) {
              Alert.alert(t("operationFailed"), actionError instanceof Error ? actionError.message : t("tryAgain"));
            } finally {
              setWorkingId(null);
            }
          })();
        },
      },
    ]);
  }

  if (telegramEnabled && historyPlatform === "TELEGRAM") {
    return <TelegramScreen initialTab="history" lockedTab onSwitchToWhatsApp={() => setHistoryPlatform("WHATSAPP")} />;
  }

  if (loading && campaigns.length === 0) {
    return (
      <Screen>
        <LoadingState label={t("loadingMessageHistory")} />
      </Screen>
    );
  }

  if (error && campaigns.length === 0) {
    return (
      <Screen>
        <ErrorState title={error} onRetry={() => void load()} />
      </Screen>
    );
  }

  const scheduledCount = campaigns.filter((campaign) => campaign.scheduleType === "SCHEDULED").length;
  const sentCount = campaigns.reduce((total, campaign) => total + (campaign.sentCount ?? 0), 0);
  const failedCount = campaigns.reduce((total, campaign) => total + (campaign.failedCount ?? 0), 0);

  return (
    <Screen style={styles.screen}>
      <FlatList
        data={campaigns}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={theme.primary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader
              eyebrow={t("reporting")}
              title={t("messageHistoryTitle")}
              description={t("messageHistorySubtitle")}
            />
            {telegramEnabled ? <View style={styles.platformRow}><Chip label="WhatsApp" active onPress={() => setHistoryPlatform("WHATSAPP")} /><Chip label={t("telegramAccounts")} active={false} onPress={() => setHistoryPlatform("TELEGRAM")} /></View> : null}
            <View style={styles.grid}>
              <StatCard icon="send-outline" label={t("sent")} value={sentCount} tone="success" />
              <StatCard icon="calendar-outline" label={t("scheduled")} value={scheduledCount} tone="warning" />
              <StatCard icon="alert-circle-outline" label={t("failed")} value={failedCount} tone={failedCount > 0 ? "danger" : "default"} />
            </View>
            {error ? <ErrorState title={error} onRetry={() => void load()} /> : null}
          </View>
        }
        ListEmptyComponent={<EmptyState title={t("noCampaigns")} description={t("noCampaignsDescription")} />}
        renderItem={({ item }) => (
          <CampaignCard
            campaign={item}
            locale={locale}
            t={t}
            working={workingId === item.id}
            onAction={(action) => void runAction(item, action)}
          />
        )}
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

function CampaignCard({
  campaign,
  locale,
  t,
  working,
  onAction
}: {
  campaign: MobileMessageCampaign;
  locale: ReturnType<typeof useTranslation>["locale"];
  t: ReturnType<typeof useTranslation>["t"];
  working: boolean;
  onAction: (action: "deleteForMe" | "deleteForEveryone" | "platformDelete") => void;
}) {
  const theme = useTheme();
  const scheduledAt = campaign.scheduledAt ? formatDateTime(campaign.scheduledAt, locale) : null;
  const createdAt = campaign.createdAt ? formatDateTime(campaign.createdAt, locale) : null;
  const completedAt = campaign.completedAt ? formatDateTime(campaign.completedAt, locale) : null;
  const deleteState = campaign.deleteForEveryone;

  return (
    <Pressable accessibilityRole="button" style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.rowBetween}>
        <View style={styles.titleBlock}>
          <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
            {campaign.title || t("mobileCampaign")}
          </Text>
          <Text style={[styles.meta, { color: theme.muted }]}>
            {campaign.scheduleType === "SCHEDULED" && scheduledAt ? t("scheduledAt", { date: scheduledAt }) : createdAt ?? t("noDate")}
          </Text>
          {completedAt ? <Text style={[styles.meta, { color: theme.muted }]}>{t("completedAt", { date: completedAt })}</Text> : null}
        </View>
        <Badge label={statusLabel(campaign.status, t)} tone={statusTone(campaign.status)} />
      </View>
      {campaign.content ? (
        <Text style={[styles.preview, { color: theme.muted }]} numberOfLines={2}>
          {campaign.content}
        </Text>
      ) : null}
      {(campaign.attachments?.length || campaign.attachment) ? (
        <Text style={[styles.preview, { color: theme.primary }]} numberOfLines={1}>
          📎 {campaign.attachments?.length ? t("selectedAttachmentCount", { count: campaign.attachments.length }) : campaign.attachment?.fileName}
        </Text>
      ) : null}
      <View style={styles.metricsRow}>
        <Text style={[styles.metric, { color: theme.text }]}>{t("targetsMetric", { count: campaign.totalRecipients })}</Text>
        <Text style={[styles.metric, { color: theme.success }]}>{t("sentMetric", { count: campaign.sentCount ?? 0 })}</Text>
        <Text style={[styles.metric, { color: theme.danger }]}>{t("errorMetric", { count: campaign.failedCount ?? 0 })}</Text>
        <Text style={[styles.metric, { color: theme.text }]}>{t("groupMetric", { count: campaign.groupCount ?? 0 })}</Text>
        <Text style={[styles.metric, { color: theme.text }]}>{t("contactMetric", { count: campaign.contactCount ?? 0 })}</Text>
        <Text style={[styles.metric, { color: theme.muted }]}>{t("pendingMetric", { count: campaign.pendingCount ?? 0 })}</Text>
        <Text style={[styles.metric, { color: theme.primary }]}>{t("retryingMetric", { count: campaign.retryingCount ?? 0 })}</Text>
      </View>
      {campaign.sendSafetyCode ? <Text style={[styles.preview, { color: theme.danger }]}>{t(campaign.sendSafetyCode === "WHATSAPP_SEND_PAUSED" ? "whatsappSendPaused" : "whatsappSendSafetyUnavailable")}</Text> : null}
      {deleteState ? (
        <Text style={[styles.deleteSummary, { color: theme.muted }]}>
          {deleteForEveryoneSummary(deleteState, t)}
        </Text>
      ) : null}
      {campaign.status !== "DELETED" ? (
        <View style={styles.actionRow}>
          <ActionButton
            label={t("deleteForMe")}
            disabled={working}
            color={theme.text}
            borderColor={theme.border}
            onPress={() => onAction("deleteForMe")}
          />
          <ActionButton
            label={t("deleteForEveryone")}
            disabled={working || !canDeleteForEveryone(deleteState)}
            color={theme.primary}
            borderColor={theme.border}
            onPress={() => onAction("deleteForEveryone")}
          />
          <ActionButton
            label={t("deleteFromPlatform")}
            disabled={working}
            color={theme.danger}
            borderColor={theme.border}
            onPress={() => onAction("platformDelete")}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

function ActionButton({
  label,
  disabled,
  color,
  borderColor,
  onPress
}: {
  label: string;
  disabled?: boolean;
  color: string;
  borderColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.actionButton, { borderColor, opacity: disabled ? 0.45 : 1 }]}
    >
      <Text style={[styles.actionText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function canDeleteForEveryone(state?: MobileDeleteForEveryoneState) {
  if (!state) return false;
  if (["DELETE_PENDING", "DELETE_PROCESSING", "DELETED_FOR_EVERYONE"].includes(state.status)) return false;
  return state.eligible && state.progress.eligibleTargets > 0;
}

function deleteForEveryoneSummary(state: MobileDeleteForEveryoneState, t: ReturnType<typeof useTranslation>["t"]) {
  const progress = state.progress;
  if (state.status === "NOT_REQUESTED" && !progress.deleted && !progress.failed && !progress.expired) {
    return state.eligible ? t("deleteEveryoneAvailable") : t("deleteEveryoneExpired");
  }
  return t("deleteEveryoneProgress", { deleted: progress.deleted, total: progress.keyedTargets || progress.sentTargets, pending: progress.pending + progress.processing, failed: progress.failed });
}

function statusLabel(status: string, t: ReturnType<typeof useTranslation>["t"]) {
  if (status === "COMPLETED") return t("statusCompleted");
  if (status === "FAILED") return t("statusFailedMessage");
  if (status === "QUEUED") return t("statusQueued");
  if (status === "SENDING") return t("statusSending");
  if (status === "CANCELLED" || status === "CANCELED") return t("statusCancelled");
  return status;
}

function statusTone(status: string) {
  if (status === "COMPLETED") return "success" as const;
  if (status === "FAILED") return "danger" as const;
  if (status === "QUEUED" || status === "SENDING") return "warning" as const;
  return "default" as const;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  list: { gap: 14, paddingBottom: 32 },
  header: { gap: 14 },
  platformRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { borderRadius: 24, borderWidth: 1, gap: 12, padding: 18 },
  rowBetween: { alignItems: "flex-start", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  titleBlock: { flex: 1, gap: 5, minWidth: 0 },
  cardTitle: { fontSize: 18, fontWeight: "900", lineHeight: 24 },
  meta: { fontSize: 12, fontWeight: "700", lineHeight: 17 },
  preview: { fontSize: 14, fontWeight: "700", lineHeight: 20 },
  metricsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { fontSize: 12, fontWeight: "900" },
  deleteSummary: { fontSize: 12, fontWeight: "700", lineHeight: 18 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionButton: { borderRadius: 14, borderWidth: 1, minHeight: 38, paddingHorizontal: 11, paddingVertical: 9 },
  actionText: { fontSize: 12, fontWeight: "900" }
});
