import { useCallback } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useAuthStore } from "@/auth/auth-store";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { Badge, PageHeader, SurfaceCard } from "@/components/ui";
import { useSubscriptionStore } from "@/features/subscription/subscriptionStore";
import { useTranslation } from "@/i18n/use-translation";
import { formatDate } from "@/i18n/format";
import { useTheme } from "@/theme/theme-provider";
import type { ProfileStackParamList } from "@/types/navigation";

type SubscriptionNavigation = NativeStackNavigationProp<ProfileStackParamList, "Subscription">;

export function SubscriptionScreen() {
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const navigation = useNavigation<SubscriptionNavigation>();
  const userRole = useAuthStore((state) => state.user?.role);
  const { subscription, loading, requesting, error, success, load, requestUpgrade } = useSubscriptionStore();
  const normalizedRole = userRole?.trim().toUpperCase();
  const canManageTeam = normalizedRole === "OWNER" || normalizedRole === "ADMIN";

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (loading && !subscription) {
    return (
      <Screen>
        <LoadingState label={t("loadingSubscription")} />
      </Screen>
    );
  }

  if (error && !subscription) {
    return (
      <Screen>
        <ErrorState title={error} onRetry={load} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader eyebrow="Logivya" title={t("subscription")} description={t("subscriptionScreenSubtitle")} />

        <SurfaceCard style={styles.card}>
          <View style={styles.currentHeader}>
            <View style={styles.flexText}>
              <Text style={[styles.kicker, { color: theme.muted }]}>{t("activePlan")}</Text>
              <Text style={[styles.title, { color: theme.text }]}>{subscription?.planName ?? t("trialPlan")}</Text>
            </View>
            <Badge label={subscriptionStatusLabel(subscription?.status, subscription?.isTrial, t)} tone={subscription?.isTrial ? "warning" : subscription?.isExpired ? "danger" : "success"} />
          </View>

          {subscription?.isExpired ? (
            <View style={[styles.lockedNotice, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}>
              <Text style={[styles.noticeTitle, { color: theme.danger }]}>{t("readOnlyMode")}</Text>
              <Text style={[styles.meta, { color: theme.danger }]}>{t("readOnlyModeDescription")}</Text>
            </View>
          ) : null}

          <View style={styles.dateGrid}>
            <InfoTile label={t("remainingDays")} value={t("daysCount", { count: Math.max(0, subscription?.remainingDays ?? 0) })} />
            <InfoTile label={t("startDate")} value={subscription?.startsAt ? formatDate(subscription.startsAt, locale) : "-"} />
            <InfoTile label={t("endDate")} value={subscription?.endsAt ? formatDate(subscription.endsAt, locale) : "-"} />
          </View>
        </SurfaceCard>

        {canManageTeam ? (
          <SurfaceCard style={styles.card}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("teamManagement")}</Text>
            <Text style={[styles.meta, { color: theme.muted }]}>{t("teamManagementDescription")}</Text>
            <PrimaryButton icon="people-outline" title={t("manageTeamUsers")} onPress={() => navigation.navigate("TeamUsers")} />
          </SurfaceCard>
        ) : null}

        {error ? <Text style={[styles.feedbackText, { color: theme.danger }]}>{error}</Text> : null}
        {success ? <Text style={[styles.feedbackText, { color: theme.success }]}>{success}</Text> : null}
        <PrimaryButton icon="trending-up-outline" title={t("upgradePlan")} loading={requesting} onPress={() => void requestUpgrade()} />
      </ScrollView>
    </Screen>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.infoTile, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
      <Text style={[styles.infoLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

function subscriptionStatusLabel(status: string | undefined, isTrial: boolean | undefined, t: ReturnType<typeof useTranslation>["t"]) {
  if (isTrial || status === "TRIALING") return t("subscriptionTrial");
  if (status === "ACTIVE") return t("subscriptionActive");
  if (status === "SUSPENDED") return t("subscriptionSuspended");
  if (status === "CANCELED" || status === "CANCELLED") return t("subscriptionCancelled");
  if (status === "EXPIRED" || status === "PAST_DUE") return t("subscriptionExpired");
  return t("unknown");
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  content: { gap: 14, paddingBottom: 48 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 12 },
  currentHeader: { alignItems: "flex-start", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  flexText: { flex: 1, gap: 6, minWidth: 0 },
  kicker: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  title: { fontSize: 30, fontWeight: "900" },
  meta: { fontSize: 14, lineHeight: 21 },
  sectionTitle: { fontSize: 18, fontWeight: "900" },
  dateGrid: { gap: 10 },
  infoTile: { borderRadius: 16, borderWidth: 1, gap: 4, padding: 12 },
  infoLabel: { fontSize: 12, fontWeight: "800" },
  infoValue: { fontSize: 16, fontWeight: "900" },
  lockedNotice: { borderRadius: 16, borderWidth: 1, gap: 6, padding: 12 },
  noticeTitle: { fontSize: 14, fontWeight: "900" },
  feedbackText: { fontSize: 14, fontWeight: "900", lineHeight: 20 }
});
