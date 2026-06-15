import { StyleSheet, Text, View } from "react-native";

import type { MobileSubscription } from "@/api/mobileSubscription";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

function statusLabel(subscription: MobileSubscription | null, t: ReturnType<typeof useTranslation>["t"]) {
  if (!subscription) return t("expiredPlan");
  if (subscription.isTrial || subscription.status === "TRIALING") return t("trialPlan");
  if (subscription.status === "ACTIVE") return `${t("activePlan")}: ${subscription.planName ?? t("unknown")}`;
  if (subscription.status === "SUSPENDED") return t("suspendedPlan");
  if (subscription.status === "CANCELED" || subscription.status === "CANCELLED") return t("cancelledPlan");
  return t("expiredPlan");
}

export function SubscriptionStatusCard({ subscription }: { subscription: MobileSubscription | null }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const remainingDays = Math.max(0, subscription?.remainingDays ?? 0);

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.eyebrow, { color: theme.primary }]}>{t("currentPlan")}</Text>
      <Text style={[styles.title, { color: theme.text }]}>{statusLabel(subscription, t)}</Text>
      <Text style={[styles.meta, { color: theme.muted }]}>
        {t("remainingDays")}: {remainingDays}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 8
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  title: {
    fontSize: 20,
    fontWeight: "900"
  },
  meta: {
    fontSize: 15,
    fontWeight: "700"
  }
});
