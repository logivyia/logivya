import { useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { getMobileContacts, syncMobileContacts } from "@/api/mobileContacts";
import { syncCurrentMobileGroups } from "@/api/mobileGroups";
import { getMobileWhatsAppAccountStatus, type MobileWhatsAppAccount } from "@/api/mobileWhatsApp";
import { useWhatsAppStore } from "@/features/whatsapp/whatsappStore";
import { mapWhatsAppStatus, type WhatsAppStatusTone } from "@/features/whatsapp/whatsappStatus";
import { Badge, IconBadge, PageHeader, SectionTitle, StatCard, SurfaceCard } from "@/components/ui";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { useTranslation } from "@/i18n/use-translation";
import { colors } from "@/theme/colors";
import { useTheme } from "@/theme/theme-provider";
import type { AppTabParamList, WhatsAppStackParamList } from "@/types/navigation";

type WhatsAppNavigation = NativeStackNavigationProp<WhatsAppStackParamList>;
type SyncResource = "groups" | "contacts";

const SYNC_POLL_MS = 1_500;
const GROUP_SYNC_POLL_ATTEMPTS = 12;
const CONTACT_SYNC_POLL_ATTEMPTS = 20;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function badgeTone(tone: WhatsAppStatusTone) {
  if (tone === "success") return "success" as const;
  if (tone === "danger") return "danger" as const;
  if (tone === "warning") return "warning" as const;
  return "default" as const;
}

function AccountAction({ label, icon, onPress, danger = false, loading = false, disabled = false }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; danger?: boolean; loading?: boolean; disabled?: boolean }) {
  const theme = useTheme();
  const unavailable = loading || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        { borderColor: danger ? colors.danger : theme.border, opacity: pressed || unavailable ? 0.62 : 1 }
      ]}
    >
      <Ionicons name={icon} size={17} color={danger ? colors.danger : theme.text} />
      <Text style={[styles.actionText, { color: danger ? colors.danger : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

function WorkspaceAction({ active = false, icon, label, onPress }: { active?: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.workspaceAction,
        {
          backgroundColor: active ? theme.primary : theme.card,
          borderColor: active ? theme.primary : theme.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={23} color={active ? theme.primaryText : theme.text} />
      <Text style={[styles.workspaceActionText, { color: active ? theme.primaryText : theme.text }]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

function AccountCard({ account }: { account: MobileWhatsAppAccount }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { reconnect, archive, remove, refresh, actionLoadingId } = useWhatsAppStore();
  const [syncingResource, setSyncingResource] = useState<SyncResource | null>(null);
  const status = mapWhatsAppStatus(account.status, account.lastError);
  const phoneNumber = account.phoneNumber || t("unknown");
  const loading = actionLoadingId === account.id;
  const connected = account.status === "CONNECTED";
  const actionUnavailable = Boolean(actionLoadingId) || syncingResource !== null;
  const connectionTone = badgeTone(status.tone);

  const confirmAction = (title: string, message: string, action: () => Promise<void>) => {
    Alert.alert(title, message, [
      { text: t("cancel"), style: "cancel" },
      { text: t("confirm"), onPress: () => void action(), style: title === t("delete") ? "destructive" : "default" }
    ]);
  };

  const assertConnected = () => {
    if (connected) return true;
    Alert.alert(t("whatsappRefreshUnavailableTitle"), t("whatsappRefreshRequiresConnection"));
    return false;
  };

  const handleRefreshGroups = async () => {
    if (!assertConnected() || actionUnavailable) return;
    setSyncingResource("groups");
    try {
      const previousSyncAt = account.lastGroupSyncAt ?? account.lastSyncedAt;
      const requested = await syncCurrentMobileGroups(account.id);
      let refreshedAccount: MobileWhatsAppAccount | null = null;
      let completed = requested.completedAccountIds.includes(account.id);

      for (let attempt = 0; !completed && attempt < GROUP_SYNC_POLL_ATTEMPTS; attempt += 1) {
        await wait(SYNC_POLL_MS);
        const response = await getMobileWhatsAppAccountStatus(account.id);
        refreshedAccount = response.account;
        const currentSyncAt = refreshedAccount.lastGroupSyncAt ?? refreshedAccount.lastSyncedAt;
        completed = Boolean(currentSyncAt && currentSyncAt !== previousSyncAt);
      }

      await refresh();
      const groupCount = refreshedAccount?.groupCount ?? requested.groupCount;
      Alert.alert(
        completed ? t("whatsappGroupsRefreshCompleteTitle") : t("whatsappRefreshQueuedTitle"),
        completed
          ? t("whatsappGroupsRefreshCompleteDescription", { count: groupCount })
          : t("whatsappGroupsRefreshQueuedDescription")
      );
    } catch (error) {
      Alert.alert(t("whatsappRefreshFailedTitle"), error instanceof Error ? error.message : t("whatsappGroupsRefreshFailed"));
    } finally {
      setSyncingResource(null);
    }
  };

  const handleRefreshContacts = async () => {
    if (!assertConnected() || actionUnavailable) return;
    setSyncingResource("contacts");
    try {
      const requested = await syncMobileContacts(account.id);
      let completed = false;
      let partial = false;
      let contactCount = account.contactCount;

      for (let attempt = 0; attempt < CONTACT_SYNC_POLL_ATTEMPTS; attempt += 1) {
        await wait(SYNC_POLL_MS);
        const response = await getMobileContacts({ accountId: account.id, page: 1, limit: 10 });
        contactCount = response.pageInfo.total;
        if (response.syncRun?.id !== requested.syncRunId) continue;
        if (response.syncRun.status === "FAILED" || response.syncRun.status === "CANCELLED") {
          throw new Error(t("whatsappContactsRefreshFailed"));
        }
        if (response.syncRun.status === "COMPLETED") {
          completed = true;
          break;
        }
        if (response.syncRun.status === "PARTIAL") {
          partial = true;
          break;
        }
      }

      await refresh();
      Alert.alert(
        completed ? t("whatsappContactsRefreshCompleteTitle") : t("whatsappRefreshQueuedTitle"),
        completed
          ? t("whatsappContactsRefreshCompleteDescription", { count: contactCount })
          : partial
            ? t("whatsappContactsRefreshPartialDescription", { count: contactCount })
            : t("whatsappContactsRefreshQueuedDescription")
      );
    } catch (error) {
      Alert.alert(t("whatsappRefreshFailedTitle"), error instanceof Error ? error.message : t("whatsappContactsRefreshFailed"));
    } finally {
      setSyncingResource(null);
    }
  };

  return (
    <SurfaceCard style={styles.card}>
      <View style={styles.cardHeader}>
        <IconBadge icon="logo-whatsapp" tone={connectionTone} />
        <View style={styles.titleBlock}>
          <Text style={[styles.phone, { color: theme.text }]} numberOfLines={1}>{phoneNumber}</Text>
        </View>
        <Badge label={t(status.labelKey)} tone={connectionTone} />
      </View>

      <View style={[styles.groupStatPanel, { borderColor: theme.border }]}>
        <View style={styles.groupStatContent}>
          <Text style={[styles.statValue, { color: theme.text }]}>{account.groupCount}</Text>
          <Text style={[styles.statLabel, { color: theme.muted }]}>{t("connectedGroups")}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
        <View style={styles.groupStatContent}>
          <Text style={[styles.statValue, { color: theme.text }]}>{account.contactCount}</Text>
          <Text style={[styles.statLabel, { color: theme.muted }]}>{t("connectedContacts")}</Text>
        </View>
      </View>

      <Text style={[styles.refreshHelp, { color: theme.muted }]}>{t("whatsappRefreshWithoutDisconnect")}</Text>

      <View style={styles.actions}>
        <AccountAction
          icon="people-outline"
          label={syncingResource === "groups" ? t("refreshingGroups") : t("refreshGroups")}
          loading={syncingResource === "groups"}
          disabled={!connected || actionUnavailable}
          onPress={() => void handleRefreshGroups()}
        />
        <AccountAction
          icon="person-add-outline"
          label={syncingResource === "contacts" ? t("refreshingContacts") : t("refreshContacts")}
          loading={syncingResource === "contacts"}
          disabled={!connected || actionUnavailable}
          onPress={() => void handleRefreshContacts()}
        />
        <AccountAction
          icon="refresh-outline"
          label={t("reconnect")}
          loading={loading}
          disabled={actionUnavailable}
          onPress={() => confirmAction(t("reconnect"), t("reconnectConfirmation"), () => reconnect(account.id))}
        />
        <AccountAction
          icon="archive-outline"
          label={t("archive")}
          loading={loading}
          disabled={actionUnavailable}
          onPress={() => confirmAction(t("archive"), t("archiveConfirmation"), () => archive(account.id))}
        />
        <AccountAction
          icon="trash-outline"
          label={t("delete")}
          danger
          loading={loading}
          disabled={actionUnavailable}
          onPress={() => confirmAction(t("delete"), t("deleteConfirmation"), () => remove(account.id))}
        />
      </View>
    </SurfaceCard>
  );
}

export function WhatsAppScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<WhatsAppNavigation>();
  const tabNavigation = navigation.getParent<BottomTabNavigationProp<AppTabParamList>>();
  const { accounts, loading, refreshing, loadAttempted, error, load, refresh, resetConnection } = useWhatsAppStore();
  const connectedCount = accounts.filter((account) => account.status === "CONNECTED").length;
  const groupCount = accounts.reduce((total, account) => total + account.groupCount, 0);
  const contactCount = accounts.reduce((total, account) => total + account.contactCount, 0);
  const failedCount = accounts.filter((account) => account.status === "FAILED" || account.lastError).length;

  useEffect(() => {
    if (accounts.length === 0 && !loading && !loadAttempted && !error) void load();
  }, [accounts.length, error, load, loadAttempted, loading]);

  if (loading && accounts.length === 0) {
    return (
      <Screen>
        <LoadingState label={t("loadingWhatsApp")} />
      </Screen>
    );
  }

  if (error && accounts.length === 0) {
    return (
      <Screen>
        <ErrorState title={error || t("whatsappAccountsLoadFailed")} onRetry={() => void load()} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.primary} />}
        contentContainerStyle={styles.content}
      >
        <PageHeader
          eyebrow="WhatsApp"
          title={t("whatsappAccounts")}
          description={t("whatsappScreenSubtitle")}
        />

        <View accessibilityRole="tablist" style={styles.workspaceGrid}>
          <WorkspaceAction active icon="person-circle-outline" label={t("accountsTab")} onPress={() => undefined} />
          <WorkspaceAction icon="people-outline" label={t("groups")} onPress={() => tabNavigation?.navigate("Groups", { initialPlatform: "WHATSAPP" })} />
          <WorkspaceAction icon="send-outline" label={t("messagingTitle")} onPress={() => tabNavigation?.navigate("Messaging", { initialPlatform: "WHATSAPP" })} />
          <WorkspaceAction icon="time-outline" label={t("historyTab")} onPress={() => tabNavigation?.navigate("MessageHistory", { initialPlatform: "WHATSAPP" })} />
        </View>

        <View style={styles.grid}>
          <StatCard icon="checkmark-circle-outline" label={t("statusConnected")} value={connectedCount} tone="success" />
          <StatCard icon="people-outline" label={t("groups")} value={groupCount} />
          <StatCard icon="person-add-outline" label={t("contacts")} value={contactCount} />
          <StatCard icon="alert-circle-outline" label={t("warnings")} value={failedCount} tone={failedCount ? "danger" : "default"} />
        </View>

        <View style={styles.connectionButtons}>
          <PrimaryButton
            icon="qr-code-outline"
            title={t("connectWithQr")}
            onPress={() => {
              resetConnection("qr");
              navigation.navigate("WhatsAppQR");
            }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              resetConnection("phoneCode");
              navigation.navigate("WhatsAppPhoneConnect");
            }}
            style={({ pressed }) => [
              styles.secondaryButton,
              { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.82 : 1 }
            ]}
          >
            <Ionicons name="call-outline" size={19} color={theme.text} />
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>{t("connectWithPhoneCode")}</Text>
          </Pressable>
        </View>

        <SectionTitle title={t("whatsappAccounts")} />
        {accounts.length === 0 ? (
          <EmptyState title={t("noWhatsAppAccountFound")} description={t("accountActionsPrepared")} />
        ) : (
          accounts.map((account) => <AccountCard key={account.id} account={account} />)
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18
  },
  content: {
    gap: 16,
    paddingBottom: 32
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  workspaceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  workspaceAction: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: "47%",
    flexDirection: "row",
    flexGrow: 1,
    gap: 9,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  workspaceActionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "900"
  },
  connectionButtons: {
    gap: 12
  },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 18
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "800"
  },
  card: {
    gap: 16
  },
  cardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12
  },
  titleBlock: {
    flex: 1,
    justifyContent: "center",
    minHeight: 42
  },
  phone: {
    fontSize: 18,
    fontWeight: "900"
  },
  groupStatPanel: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 82,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  groupStatContent: {
    alignItems: "center",
    flex: 1,
    gap: 4
  },
  statDivider: {
    height: 46,
    width: 1
  },
  statValue: {
    fontSize: 28,
    fontWeight: "900"
  },
  statLabel: {
    fontSize: 13,
    fontWeight: "800"
  },
  refreshHelp: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  actionButton: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 10
  },
  actionText: {
    fontSize: 14,
    fontWeight: "900"
  }
});
