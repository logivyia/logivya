import { useEffect } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { useDashboardStore } from "@/features/dashboard/dashboardStore";
import { StatCard, SurfaceCard } from "@/components/ui";
import { Screen } from "@/components/screen";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { useTranslation } from "@/i18n/use-translation";
import { formatNumber } from "@/i18n/format";
import { useTheme } from "@/theme/theme-provider";

export function DashboardScreen() {
  const theme = useTheme();
  const { t, locale } = useTranslation();
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

  const remainingDays = Math.max(0, data.subscription.remainingDays);

  return (
    <Screen style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.primary} />}
        contentContainerStyle={styles.content}
      >
        <SurfaceCard style={styles.planCard}>
          <Text style={[styles.cardLabel, { color: theme.muted }]}>{t("currentPackage")}</Text>
          <Text style={[styles.planValue, { color: theme.text }]}>{t("daysCount", { count: remainingDays })}</Text>
        </SurfaceCard>

        <View style={styles.grid}>
          <StatCard icon="logo-whatsapp" label={t("connectedWhatsApp")} value={`${formatNumber(data.whatsapp.connectedCount, locale)}/${formatNumber(metrics.accountCount, locale)}`} tone="success" />
          <StatCard icon="people-outline" label={t("groups")} value={metrics.groupCount} tone="primary" />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18
  },
  content: {
    gap: 14,
    paddingBottom: 32
  },
  planCard: {
    gap: 8
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.3,
    lineHeight: 16
  },
  planValue: {
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 36
  },
  grid: {
    gap: 12
  }
});
