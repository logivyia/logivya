import { useEffect } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";

import { useDashboardStore } from "@/features/dashboard/dashboardStore";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { SubscriptionStatusCard } from "@/components/subscription/SubscriptionStatusCard";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { AppTabParamList } from "@/types/navigation";

function MetricCard({ label, value }: { label: string; value: string | number }) {
  const theme = useTheme();

  return (
    <View style={[styles.metricCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: theme.muted }]}>{label}</Text>
    </View>
  );
}

export function DashboardScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<AppTabParamList>>();
  const theme = useTheme();
  const { t } = useTranslation();
  const { data, metrics, loading, refreshing, error, load, refresh } = useDashboardStore();

  useEffect(() => {
    if (!data && !loading) void load();
  }, [data, load, loading]);

  if (loading && !data) {
    return (
      <Screen>
        <LoadingState label={t("loadingDashboard")} />
      </Screen>
    );
  }

  if (error && !data) {
    return (
      <Screen>
        <ErrorState title={t("dashboard")} onRetry={() => void load()} />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen>
        <EmptyState title={t("emptyDashboard")} />
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
          <Text style={[styles.eyebrow, { color: theme.primary }]}>{t("dashboard")}</Text>
          <Text style={[styles.title, { color: theme.text }]}>Merhaba, {data.user.name}</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>{data.company.name}</Text>
        </View>

        <SubscriptionStatusCard subscription={data.subscription} />

        <View style={styles.grid}>
          <MetricCard label={t("connectedAccounts")} value={data.whatsapp.connectedCount} />
          <MetricCard label={t("groups")} value={metrics.groupCount} />
          <MetricCard label={t("sentThisMonth")} value={metrics.sentThisMonth} />
          <MetricCard label={t("failedMessages")} value={metrics.failedMessages} />
          <MetricCard label={t("currentPlan")} value={data.subscription.planName ?? t("trialPlan")} />
          <MetricCard label={t("remainingDays")} value={Math.max(0, data.subscription.remainingDays)} />
        </View>

        <PrimaryButton title={t("manageWhatsAppAccounts")} onPress={() => navigation.navigate("WhatsApp")} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18
  },
  content: {
    gap: 18,
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
    fontSize: 16,
    fontWeight: "600"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  metricCard: {
    width: "48%",
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    minHeight: 116,
    justifyContent: "space-between"
  },
  metricValue: {
    fontSize: 28,
    fontWeight: "900"
  },
  metricLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700"
  }
});
