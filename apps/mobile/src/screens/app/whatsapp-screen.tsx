import { useEffect } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import type { MobileWhatsAppAccount } from "@/api/mobileWhatsApp";
import { useWhatsAppStore } from "@/features/whatsapp/whatsappStore";
import { mapWhatsAppStatus, type WhatsAppStatusTone } from "@/features/whatsapp/whatsappStatus";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { Screen } from "@/components/screen";
import { useTranslation } from "@/i18n/use-translation";
import { colors } from "@/theme/colors";
import { useTheme } from "@/theme/theme-provider";

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

function AccountAction({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        { borderColor: danger ? colors.danger : theme.border, opacity: pressed ? 0.8 : 1 }
      ]}
    >
      <Text style={[styles.actionText, { color: danger ? colors.danger : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

function AccountCard({ account }: { account: MobileWhatsAppAccount }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { reconnect, archive, remove } = useWhatsAppStore();
  const status = mapWhatsAppStatus(account.status);
  const displayName = account.displayName || account.label || account.phoneNumber || t("unknown");

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <View style={styles.titleBlock}>
          <Text style={[styles.accountName, { color: theme.text }]}>{displayName}</Text>
          <Text style={[styles.phone, { color: theme.muted }]}>{account.phoneNumber ?? "-"}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: `${toneColor(status.tone)}20` }]}>
          <Text style={[styles.statusText, { color: toneColor(status.tone) }]}>{t(status.labelKey)}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View>
          <Text style={[styles.statValue, { color: theme.text }]}>{account.groupCount}</Text>
          <Text style={[styles.statLabel, { color: theme.muted }]}>{t("groups")}</Text>
        </View>
        <View>
          <Text style={[styles.statValue, { color: theme.text }]}>{account.contactCount}</Text>
          <Text style={[styles.statLabel, { color: theme.muted }]}>{t("contacts")}</Text>
        </View>
        <View>
          <Text style={[styles.statValue, { color: theme.text }]}>{formatDate(account.lastSyncedAt)}</Text>
          <Text style={[styles.statLabel, { color: theme.muted }]}>{t("lastSync")}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <AccountAction label={account.status === "CONNECTED" ? t("reconnect") : t("connect")} onPress={() => void reconnect(account.id)} />
        <AccountAction label={t("archive")} onPress={() => void archive(account.id)} />
        <AccountAction
          label={t("delete")}
          danger
          onPress={() =>
            Alert.alert(t("delete"), "Bu WhatsApp hesabını silmek istediğinizden emin misiniz?", [
              { text: "Vazgeç", style: "cancel" },
              { text: t("delete"), style: "destructive", onPress: () => void remove(account.id) }
            ])
          }
        />
      </View>
    </View>
  );
}

export function WhatsAppScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { accounts, loading, refreshing, error, load, refresh } = useWhatsAppStore();

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
  statValue: {
    fontSize: 17,
    fontWeight: "900"
  },
  statLabel: {
    fontSize: 12,
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
