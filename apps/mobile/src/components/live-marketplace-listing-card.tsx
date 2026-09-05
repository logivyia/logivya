import { localizeListingSummary } from "../../../../shared/localize-listing-summary";
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { PublicCatalogListing } from "@/api/publicMarketplace";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import { formatRelativeTime } from "@/utils/relative-time";

function LiveMarketplaceListingCardComponent({ listing, onPress }: { listing: Pick<PublicCatalogListing, "kind" | "updatedAt" | "publicTitle" | "publicDescription" | "publicAdvertiserName" | "vehicleDisplayName" | "tonnageDisplay" | "tonnageAccessibilityLabel" | "vehicleCountDisplay" | "loadingDisplayName" | "deliveryDisplayName">; onPress: () => void }) {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  listing = localizeListingSummary(listing, locale);
  const metadata = [listing.tonnageDisplay, listing.vehicleDisplayName, listing.vehicleCountDisplay].filter(Boolean);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t("viewDetails")}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={styles.topRow}>
        <View style={[styles.advertiserBadge, { backgroundColor: theme.badge }]}>
          <Text numberOfLines={1} style={[styles.advertiser, { color: theme.primary }]}>{listing.publicAdvertiserName}</Text>
        </View>
        <Text style={[styles.time, { color: theme.muted }]}>{formatRelativeTime(listing.updatedAt, locale)}</Text>
      </View>
      <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>{listing.publicTitle}</Text>
      {listing.publicDescription ? <Text numberOfLines={2} style={[styles.description, { color: theme.muted }]}>{listing.publicDescription}</Text> : null}
      {metadata.length ? <Text numberOfLines={1} style={[styles.metadata, { color: theme.text }]}>{metadata.join(" · ")}</Text> : null}
      <View style={[styles.routeRow, { borderTopColor: theme.border }]}>
        <RoutePoint label={t("loadingLabel")} value={listing.loadingDisplayName} />
        <RoutePoint label={t("deliveryLabel")} value={listing.deliveryDisplayName} />
        <View style={styles.detailsLink}>
          <Text style={[styles.detailsText, { color: theme.primary }]}>{t("viewDetails")}</Text>
          <Ionicons name="chevron-forward" size={17} color={theme.primary} />
        </View>
      </View>
    </Pressable>
  );
}

export const LiveMarketplaceListingCard = memo(
  LiveMarketplaceListingCardComponent,
  (previous, next) => previous.listing.kind === next.listing.kind
    && previous.onPress === next.onPress
    && previous.listing.updatedAt === next.listing.updatedAt,
);

function RoutePoint({ label, value }: { label: string; value: string | null }) {
  const theme = useTheme();
  if (!value) return null;
  return <View style={styles.routePoint}><Text style={[styles.routeLabel, { color: theme.muted }]}>{label}</Text><Text numberOfLines={1} style={[styles.routeValue, { color: theme.text }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, gap: 10, padding: 15 },
  topRow: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  advertiserBadge: { borderRadius: 999, flexShrink: 1, paddingHorizontal: 10, paddingVertical: 6 },
  advertiser: { fontSize: 11, fontWeight: "900" },
  time: { fontSize: 11, fontWeight: "700" },
  title: { fontSize: 17, fontWeight: "900", lineHeight: 23 },
  description: { fontSize: 13, fontWeight: "600", lineHeight: 19 },
  metadata: { fontSize: 12, fontWeight: "800" },
  routeRow: { alignItems: "flex-end", borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 11 },
  routePoint: { flex: 1, gap: 3, minWidth: 88 },
  routeLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.65 },
  routeValue: { fontSize: 12, fontWeight: "800" },
  detailsLink: { alignItems: "center", flexDirection: "row", marginLeft: "auto" },
  detailsText: { fontSize: 12, fontWeight: "900" },
});
