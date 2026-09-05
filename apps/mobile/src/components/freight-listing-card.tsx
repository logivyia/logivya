import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { MobileFreightListing } from "@/api/mobileFreight";
import { Badge, SurfaceCard } from "@/components/ui";
import { useSettingsStore } from "@/auth/settings-store";
import { formatFreightDate, formatFreightPrice, statusLabelKeys } from "@/features/freight/freight-format";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import { formatRelativeTime } from "@/utils/relative-time";

export function FreightListingCard({
  listing,
  onPress,
  actions,
}: {
  listing: MobileFreightListing;
  onPress: () => void;
  actions?: React.ReactNode;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const locale = useSettingsStore((state) => state.locale);
  const price = formatFreightPrice(listing, locale);
  const tone = listing.status === "ACTIVE" ? "success" : listing.status === "COMPLETED" ? "primary" : "default";

  return (
    <SurfaceCard style={styles.card}>
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.pressable, pressed ? styles.pressed : null]}>
        <View style={styles.advertiserRow}>
          <Text style={[styles.company, { color: theme.text }]} numberOfLines={1}>{listing.publicAdvertiserName}</Text>
          <Text style={[styles.time, { color: theme.muted }]}>{formatRelativeTime(listing.publishedAt, locale)}</Text>
        </View>
        <View style={styles.headerRow}>
          <View style={styles.routeBlock}>
            <Text style={[styles.route, { color: theme.text }]} numberOfLines={2}>{listing.publicTitle}</Text>
          </View>
          <View style={styles.badges}><Badge label={t(statusLabelKeys[listing.status])} tone={tone} /></View>
        </View>
        {listing.publicDescription ? <Text numberOfLines={2} style={[styles.description, { color: theme.muted }]}>{listing.publicDescription}</Text> : null}
        <View style={styles.metaGrid}>
          <Meta icon="calendar-outline" value={formatFreightDate(listing.loadingDate, locale)} />
          <Meta icon="scale-outline" value={listing.tonnageDisplay ?? t("notSpecified")} />
          <Meta icon="car-outline" value={listing.vehicleDisplayName ?? t("notSpecified")} />
          <Meta icon="layers-outline" value={listing.vehicleCountDisplay ?? t("freightVehicleCountValue", { count: listing.vehicleCount })} />
        </View>
        <View style={[styles.routeDetails, { borderTopColor: theme.border }]}>
          <RoutePoint label={t("loadingLabel")} value={listing.loadingDisplayName ?? t("notSpecified")} />
          <RoutePoint label={t("deliveryLabel")} value={listing.deliveryDisplayName ?? t("notSpecified")} />
        </View>
        <View style={styles.footer}>
          <Text style={[styles.price, { color: price ? theme.primary : theme.muted }]}>{price ?? t("freightPriceNotSpecified")}</Text>
          <View style={styles.detailsHint}>
            <Text style={[styles.detailsText, { color: theme.primary }]}>{t("viewDetails")}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.primary} />
          </View>
        </View>
      </Pressable>
      {actions ? <View style={[styles.actions, { borderTopColor: theme.border }]}>{actions}</View> : null}
    </SurfaceCard>
  );
}

function RoutePoint({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return <View style={styles.routePoint}><Text style={[styles.routeLabel, { color: theme.muted }]}>{label}</Text><Text numberOfLines={1} style={[styles.routeValue, { color: theme.text }]}>{value}</Text></View>;
}

function Meta({ icon, value }: { icon: React.ComponentProps<typeof Ionicons>["name"]; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={16} color={theme.iconMuted} />
      <Text style={[styles.metaText, { color: theme.muted }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, overflow: "hidden" },
  pressable: { gap: 14, padding: 18 },
  pressed: { opacity: 0.78 },
  advertiserRow: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  headerRow: { alignItems: "flex-start", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  routeBlock: { flex: 1, gap: 4, minWidth: 0 },
  route: { fontSize: 19, fontWeight: "900", lineHeight: 25 },
  company: { flex: 1, fontSize: 13, fontWeight: "900" },
  time: { fontSize: 12, fontWeight: "700" },
  badges: { alignItems: "flex-end", gap: 6 },
  description: { fontSize: 13, fontWeight: "600", lineHeight: 19 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  meta: { alignItems: "center", flexDirection: "row", gap: 6, minWidth: "46%" },
  metaText: { flex: 1, fontSize: 12, fontWeight: "700" },
  routeDetails: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 14, paddingTop: 12 },
  routePoint: { flex: 1, gap: 3, minWidth: 0 },
  routeLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  routeValue: { fontSize: 13, fontWeight: "800" },
  footer: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  price: { flex: 1, fontSize: 15, fontWeight: "900" },
  detailsHint: { alignItems: "center", flexDirection: "row" },
  detailsText: { fontSize: 13, fontWeight: "900" },
  actions: { borderTopWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12 },
});
