import { useEffect } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type { MobileWhatsAppAccount } from "@/api/mobileWhatsApp";
import { useWhatsAppStore } from "@/features/whatsapp/whatsappStore";
import { mapWhatsAppStatus, type WhatsAppStatusTone } from "@/features/whatsapp/whatsappStatus";
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

function toneColor(tone: WhatsAppStatusTone) {
  if (tone === "success") return colors.success;
  if (tone === "danger") return colors.danger;
  if (tone === "warning") return colors.orange;
  return colors.slate;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function AccountAction({ label, onPress, danger = false, loading = false }: { label: string; onPress: () => void; danger?: boolean; loading?: boolean }) {
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
      <Text style={[styles.actionText, { color: danger ? colors.danger : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

function AccountCard({ account }: { account: MobileWhatsAppAccount }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { reconnect, archive, remove, actionLoadingId } = useWhatsAppStore();
  const status = mapWhatsAppStatus(account.status);
  const displayName = account.displayName || account.label || account.phoneNumber || t("unknown");
  const loading = actionLoadingId === account.id;

  const confirmAction = (title: string, message: string, action: () => Promise<void>) => {
    Alert.alert(title, message, [
      { text: t("cancel"), style: "cancel" },
      { text: t("confirm"), onPress: () => void action(), style: title === t("delete") ? "destructive" : "default" }
    ]);
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <View style={styles.titleBlock}>
          <Text style={[styles.accountName, { color: theme.text }]}>{displayName}</Text>
          <Text style={[styles.phone, { color: theme.muted }]}>
            {t("phone")}: {account.phoneNumber ?? "-"}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: `${toneColor(status.tone)}20` }]}>
          <Text style={[styles.statusText, { color: toneColor(status.tone) }]}>{t(status.labelKey)}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: theme.text }]}>{account.groupCount}</Text>
          <Text style={[styles.statLabel, { color: theme.muted }]}>{t("connectedGroups")}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: theme.text }]}>{formatDate(account.lastSyncedAt)}</Text>
          <Text style={[styles.statLabel, { color: theme.muted }]}>{t("lastSync")}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: toneColor(status.tone) }]}>{t(status.labelKey)}</Text>
          <Text style={[styles.statLabel, { color: theme.muted }]}>{t("connectionState")}</Text>
        </View>
      </View>

      {account.lastError ? <Text style={[styles.errorText, { color: colors.danger }]}>{account.lastError}</Text> : null}

      <View style={styles.actions}>
        <AccountAction
          label={t("reconnect")}
          loading={loading}
          onPress={() => confirmAction(t("reconnect"), t("reconnectConfirmation"), () => reconnect(account.id))}
        />
        <AccountAction
          label={t("archive")}
          loading={loading}
          onPress={() => confirmAction(t("archive"), t("archiveConfirmation"), () => archive(account.id))}
        />
        <AccountAction
          label={t("delete")}
          danger
          loading={loading}
          onPress={() => confirmAction(t("delete"), t("deleteConfirmation"), () => remove(account.id))}
        />
      </View>
    </View>
  );
}

export function WhatsAppScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<WhatsAppNavigation>();
  const { accounts, loading, refreshing, error, load, refresh, resetConnection } = useWhatsAppStore();

  useEffect(() => {
    if (accounts.length === 0 && !loading) void load();
  }, [accounts.length, load, loading]);

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
        <ErrorState title={t("whatsappAccounts")} onRetry={() => void load()} />
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
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: theme.primary }]}>{t("whatsappAccounts")}</Text>
          <Text style={[styles.title, { color: theme.text }]}>{t("whatsappAccounts")}</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>{t("accountActionsPrepared")}</Text>
        </View>

        <View style={styles.connectionButtons}>
          <PrimaryButton
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
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>{t("connectWithPhoneCode")}</Text>
          </Pressable>
        </View>

        {accounts.length === 0 ? (
          <EmptyState title={t("noWhatsAppAccountFound")} description={t("connectAccount")} />
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
  header: {
    gap: 6
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.6,
    textTransform: "uppercase"
  },
  title: {
    fontSize: 30,
    fontWeight: "900"
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600"
  },
  connectionButtons: {
    gap: 12
  },
  secondaryButton: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: "800"
  },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 18
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  titleBlock: {
    flex: 1,
    gap: 4
  },
  accountName: {
    fontSize: 20,
    fontWeight: "900"
  },
  phone: {
    fontSize: 14,
    fontWeight: "600"
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  statusText: {
    fontSize: 12,
    fontWeight: "900"
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  stat: {
    flex: 1
  },
  statValue: {
    fontSize: 15,
    fontWeight: "900"
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "700"
  },
  errorText: {
    fontSize: 13,
    fontWeight: "700"
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  actionButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  actionText: {
    fontSize: 14,
    fontWeight: "800"
  }
});
