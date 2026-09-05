import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { createMobileSupportTicket, createSupportOperationId } from "@/api/mobileSupport";
import { useAuthStore } from "@/auth/auth-store";
import { SurfaceCard } from "@/components/ui";
import { EMPTY_BLOCKED_OWNER_IDS, useMarketplaceSafetyStore } from "@/features/marketplace/marketplace-safety-store";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

type MarketplaceListingKind = "LOAD" | "VEHICLE" | "DRIVER";

type Props = {
  kind: MarketplaceListingKind;
  listingId: string;
  ownerUserId: string;
  ownerName: string;
  title: string;
  onBlocked?: () => void;
};

export function MarketplaceSafetyActions({ kind, listingId, ownerUserId, ownerName, title, onBlocked }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const viewerUserId = useAuthStore((state) => state.user?.id ?? null);
  const blockedOwnerIds = useMarketplaceSafetyStore(
    (state) => (viewerUserId ? state.blockedOwnerIdsByViewer[viewerUserId] ?? EMPTY_BLOCKED_OWNER_IDS : EMPTY_BLOCKED_OWNER_IDS),
  );
  const blockOwner = useMarketplaceSafetyStore((state) => state.blockOwner);
  const unblockOwner = useMarketplaceSafetyStore((state) => state.unblockOwner);
  const [reporting, setReporting] = useState(false);
  const isBlocked = blockedOwnerIds.includes(ownerUserId);

  if (!viewerUserId || viewerUserId === ownerUserId) return null;
  const resolvedViewerUserId = viewerUserId;

  async function submitReport() {
    if (reporting) return;
    setReporting(true);
    const clientRequestId = createSupportOperationId("marketplace-report");
    try {
      await createMobileSupportTicket({
        subject: t("marketplaceSafetyReportSubject", { title }).slice(0, 160),
        category: "OTHER",
        message: [
          "Marketplace content report",
          `Listing kind: ${kind}`,
          `Listing ID: ${listingId}`,
          `Listing title: ${title}`,
          `Owner user ID: ${ownerUserId}`,
          `Owner name: ${ownerName}`,
          "Please review this listing and its owner under the LOGIVYA marketplace rules.",
        ].join("\n"),
        clientMessageId: createSupportOperationId("marketplace-report-message"),
        clientRequestId,
      });
      Alert.alert(t("reportSubmittedTitle"), t("reportSubmittedDescription"));
    } catch {
      Alert.alert(t("operationFailed"), t("reportListingFailed"));
    } finally {
      setReporting(false);
    }
  }

  function confirmReport() {
    Alert.alert(t("reportListing"), t("reportListingConfirm"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("reportListing"), style: "destructive", onPress: () => void submitReport() },
    ]);
  }

  function confirmBlock() {
    Alert.alert(t("blockMarketplaceUser"), t("blockMarketplaceUserConfirm", { name: ownerName }), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("blockMarketplaceUser"),
        style: "destructive",
        onPress: () => {
          blockOwner(resolvedViewerUserId, ownerUserId);
          Alert.alert(t("marketplaceUserBlockedTitle"), t("marketplaceUserBlockedDescription"));
          onBlocked?.();
        },
      },
    ]);
  }

  function unblock() {
    unblockOwner(resolvedViewerUserId, ownerUserId);
    Alert.alert(t("marketplaceUserUnblockedTitle"), t("marketplaceUserUnblockedDescription"));
  }

  return (
    <SurfaceCard style={styles.card}>
      <View style={styles.headingRow}>
        <Ionicons name="shield-checkmark-outline" size={22} color={theme.primary} />
        <View style={styles.headingText}>
          <Text style={[styles.title, { color: theme.text }]}>{t("marketplaceSafetyTitle")}</Text>
          <Text style={[styles.description, { color: theme.muted }]}>{t("marketplaceSafetyDescription")}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={reporting}
          onPress={confirmReport}
          style={({ pressed }) => [
            styles.action,
            { borderColor: theme.border, backgroundColor: theme.cardMuted, opacity: pressed || reporting ? 0.7 : 1 },
          ]}
        >
          {reporting ? <ActivityIndicator color={theme.primary} /> : <Ionicons name="flag-outline" size={19} color={theme.primary} />}
          <Text style={[styles.actionText, { color: theme.text }]}>{t("reportListing")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={isBlocked ? unblock : confirmBlock}
          style={({ pressed }) => [
            styles.action,
            { borderColor: theme.border, backgroundColor: theme.dangerSoft, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name={isBlocked ? "person-add-outline" : "ban-outline"} size={19} color={theme.danger} />
          <Text style={[styles.actionText, { color: theme.danger }]}>
            {t(isBlocked ? "unblockMarketplaceUser" : "blockMarketplaceUser")}
          </Text>
        </Pressable>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 50,
    minWidth: 150,
    paddingHorizontal: 14,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionText: { fontSize: 14, fontWeight: "900" },
  card: { gap: 16 },
  description: { fontSize: 13, lineHeight: 19 },
  headingRow: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  headingText: { flex: 1, gap: 5 },
  title: { fontSize: 16, fontWeight: "900" },
});
