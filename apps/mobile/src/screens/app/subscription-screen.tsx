import { useCallback } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { useSubscriptionStore } from "@/features/subscription/subscriptionStore";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

export function SubscriptionScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { subscription, loading, error, load } = useSubscriptionStore();

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

  const limits = subscription?.limits;

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.eyebrow, { color: theme.primary }]}>{t("subscription")}</Text>
          <Text style={[styles.title, { color: theme.text }]}>{subscription?.planName ?? t("trialPlan")}</Text>
          <Text style={[styles.status, { color: theme.primary }]}>{subscriptionStatusLabel(subscription?.status, subscription?.isTrial, t)}</Text>
          <Text style={[styles.meta, { color: theme.muted }]}>{t("remainingDays")}: {Math.max(0, subscription?.remainingDays ?? 0)}</Text>
          <Text style={[styles.meta, { color: theme.muted }]}>{t("startDate")}: {subscription?.startsAt ? new Date(subscription.startsAt).toLocaleDateString() : "-"}</Text>
          <Text style={[styles.meta, { color: theme.muted }]}>{t("endDate")}: {subscription?.endsAt ? new Date(subscription.endsAt).toLocaleDateString() : "-"}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("planLimits")}</Text>
          <Limit label={t("maxWhatsappAccounts")} value={limits?.maxWhatsappAccounts} />
          <Limit label={t("maxTeamUsers")} value={limits?.maxTeamUsers} />
          <Limit label={t("maxGroups")} value={limits?.maxGroups} />
          <Limit label={t("maxMessagesPerDay")} value={limits?.maxMessagesPerDay} />
          <Limit label={t("maxMessagesPerMonth")} value={limits?.maxMessagesPerMonth} />
        </View>
        <PrimaryButton title={t("upgradePlan")} onPress={() => undefined} />
      </ScrollView>
    </Screen>
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

function Limit({ label, value }: { label: string; value: number | undefined }) {
  const theme = useTheme();
  return (
    <View style={styles.limitRow}>
      <Text style={[styles.meta, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.limitValue, { color: theme.text }]}>{typeof value === "number" ? value : "-"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  content: { gap: 14, paddingBottom: 32 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 10 },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 3, textTransform: "uppercase" },
  title: { fontSize: 30, fontWeight: "900" },
  status: { fontSize: 15, fontWeight: "900" },
  meta: { fontSize: 14, lineHeight: 21 },
  sectionTitle: { fontSize: 18, fontWeight: "900" },
  limitRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  limitValue: { fontSize: 15, fontWeight: "900" }
});
