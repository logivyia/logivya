import { useEffect } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type { MobileWhatsAppAccount } from "@/api/mobileWhatsApp";
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
import type { WhatsAppStackParamList } from "@/types/navigation";

type WhatsAppNavigation = NativeStackNavigationProp<WhatsAppStackParamList>;

function badgeTone(tone: WhatsAppStatusTone) {
  if (tone === "success") return "success" as const;
  if (tone === "danger") return "danger" as const;
  if (tone === "warning") return "warning" as const;
  return "default" as const;
}

function AccountAction({ label, icon, onPress, danger = false, loading = false }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; danger?: boolean; loading?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        { borderColor: danger ? colors.danger : theme.border, opacity: pressed || loading ? 0.72 : 1 }
      ]}
    >
      <Ionicons name={icon} size={17} color={danger ? colors.danger : theme.text} />
      <Text style={[styles.actionText, { color: danger ? colors.danger : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

function AccountCard({ account }: { account: MobileWhatsAppAccount }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { reconnect, archive, remove, actionLoadingId } = useWhatsAppStore();
  const status = mapWhatsAppStatus(account.status, account.lastError);
  const phoneNumber = account.phoneNumber || t("unknown");
  const loading = actionLoadingId === account.id;
  const connectionTone = badgeTone(status.tone);

  const confirmAction = (title: string, message: string, action: () => Promise<void>) => {
    Alert.alert(title, message, [
      { text: t("cancel"), style: "cancel" },
      { text: t("confirm"), onPress: () => void action(), style: title === t("delete") ? "destructive" : "default" }
    ]);
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
      </View>

      <View style={styles.actions}>
        <AccountAction
          icon="refresh-outline"
          label={t("reconnect")}
          loading={loading}
          onPress={() => confirmAction(t("reconnect"), t("reconnectConfirmation"), () => reconnect(account.id))}
        />
        <AccountAction
          icon="archive-outline"
          label={t("archive")}
          loading={loading}
          onPress={() => confirmAction(t("archive"), t("archiveConfirmation"), () => archive(account.id))}
        />
        <AccountAction
          icon="trash-outline"
          label={t("delete")}
          danger
          loading={loading}
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
    gap: 4
  },
  statValue: {
    fontSize: 28,
    fontWeight: "900"
  },
  statLabel: {
    fontSize: 13,
    fontWeight: "800"
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
