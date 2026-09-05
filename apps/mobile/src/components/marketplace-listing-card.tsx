import { localizeListingSummary } from "../../../../shared/localize-listing-summary";
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type {
  MobileDriverListing,
  MobileVehicleListing,
} from "@/api/mobileFreight";
import { useSettingsStore } from "@/auth/settings-store";
import {
  formatFreightDate,
} from "@/features/freight/freight-format";
import { localeMetadata } from "@/i18n/config";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import { Badge, SurfaceCard } from "@/components/ui";
import { LowbedIcon } from "@/components/lowbed-icon";
import { formatRelativeTime } from "@/utils/relative-time";

const ADR_LABEL = "ADR";
const SRC_LABEL = "SRC";

export function VehicleListingCard({
  listing,
  onPress,
  actions,
}: {
  listing: MobileVehicleListing;
  onPress: () => void;
  actions?: ReactNode;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const locale = useSettingsStore((state) => state.locale);
  listing = localizeListingSummary(listing, locale);
  const price =
    listing.priceAmount != null && listing.currency
      ? new Intl.NumberFormat(localeMetadata[locale].intlLocale, {
          style: "currency",
          currency: listing.currency,
          maximumFractionDigits: 0,
        }).format(listing.priceAmount)
      : t("priceOnRequest");
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <SurfaceCard style={styles.card}>
        <View style={styles.cardTop}>
          <View style={[styles.icon, { backgroundColor: theme.badge }]}> 
            {listing.vehicleDisplayName === "Lowbed" ? <LowbedIcon size={23} color={theme.primary} /> : <Ionicons name="bus-outline" size={22} color={theme.primary} />}
          </View>
          <View style={styles.cardHeading}>
            <Text
              style={[styles.cardTitle, { color: theme.text }]}
              numberOfLines={2}
            >
              {listing.publicTitle}
            </Text>
            <Text
              style={[styles.company, { color: theme.muted }]}
              numberOfLines={1}
            >
              {listing.publicAdvertiserName} · {formatRelativeTime(listing.publishedAt, locale)}
            </Text>
          </View>
          <Badge
            label={t(
              listing.status === "ACTIVE"
                ? "freightStatusActive"
                : listing.status === "COMPLETED"
                  ? "freightStatusCompleted"
                  : "freightStatusInactive",
            )}
            tone={
              listing.status === "ACTIVE"
                ? "success"
                : listing.status === "COMPLETED"
                  ? "default"
                  : "warning"
            }
          />
        </View>
        <View style={styles.metaGrid}>
          <Meta
            icon="calendar-outline"
            label={formatFreightDate(listing.availableFrom, locale)}
          />
          <Meta
            icon="bus-outline"
            iconElement={listing.vehicleDisplayName === "Lowbed" ? <LowbedIcon size={17} color={theme.iconMuted} /> : undefined}
            label={listing.vehicleDisplayName ?? t("notSpecified")}
          />
          <Meta
            icon="scale-outline"
            label={
              listing.tonnageDisplay ?? t("capacityFlexible")
            }
          />
          <Meta
            icon="layers-outline"
            label={listing.vehicleCountDisplay ?? t("vehiclesCount", { count: listing.vehicleCount })}
          />
        </View>
        <View style={styles.footer}>
          <View style={styles.badges}>
            {listing.internationalTransport ? (
              <Badge label={t("internationalTransport")} tone="primary" />
            ) : null}
            {listing.adrSuitable ? <Badge label={ADR_LABEL} tone="warning" /> : null}
          </View>
          <Text style={[styles.price, { color: theme.text }]}>{price}</Text>
        </View>
        {listing.publicDescription ? (
          <Text
            style={[styles.description, { color: theme.muted }]}
            numberOfLines={2}
          >
            {listing.publicDescription}
          </Text>
        ) : null}
        {actions ? (
          <View style={[styles.actions, { borderTopColor: theme.border }]}>
            {actions}
          </View>
        ) : null}
      </SurfaceCard>
    </Pressable>
  );
}

export function DriverListingCard({
  listing,
  onPress,
  actions,
}: {
  listing: MobileDriverListing;
  onPress: () => void;
  actions?: ReactNode;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const locale = useSettingsStore((state) => state.locale);
  listing = localizeListingSummary(listing, locale);
  const salary =
    listing.salaryAmount != null && listing.currency
      ? new Intl.NumberFormat(localeMetadata[locale].intlLocale, {
          style: "currency",
          currency: listing.currency,
          maximumFractionDigits: 0,
        }).format(listing.salaryAmount)
      : t("salaryOnRequest");
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <SurfaceCard style={styles.card}>
        <View style={styles.cardTop}>
          <View style={[styles.icon, { backgroundColor: theme.badge }]}>
            <Ionicons name="person-outline" size={22} color={theme.primary} />
          </View>
          <View style={styles.cardHeading}>
            <Text
              style={[styles.cardTitle, { color: theme.text }]}
              numberOfLines={2}
            >
              {listing.publicTitle}
            </Text>
            <Text
              style={[styles.company, { color: theme.muted }]}
              numberOfLines={1}
            >
              {listing.publicAdvertiserName} · {formatRelativeTime(listing.publishedAt, locale)}
            </Text>
          </View>
          <Badge
            label={t(
              listing.listingType === "DRIVER_WANTED"
                ? "driverWanted"
                : "driverAvailable",
            )}
            tone={
              listing.listingType === "DRIVER_WANTED" ? "primary" : "success"
            }
          />
        </View>
        <View style={styles.metaGrid}>
          <Meta
            icon="calendar-outline"
            label={formatFreightDate(listing.availableFrom, locale)}
          />
          <Meta icon="card-outline" label={listing.licenseClasses.join(", ")} />
          <Meta
            icon="briefcase-outline"
            label={t("yearsExperience", { count: listing.experienceYears })}
          />
          <Meta
            icon="time-outline"
            label={t(
              `driverEmployment${listing.employmentType}` as "driverEmploymentFULL_TIME",
            )}
          />
        </View>
        <View style={styles.footer}>
          <View style={styles.badges}>
            {listing.internationalExperience ? (
              <Badge label={t("internationalExperience")} tone="primary" />
            ) : null}
            {listing.srcCertificate ? (
              <Badge label={SRC_LABEL} tone="success" />
            ) : null}
            {listing.adrCertificate ? (
              <Badge label={ADR_LABEL} tone="warning" />
            ) : null}
          </View>
          <Text style={[styles.price, { color: theme.text }]}>{salary}</Text>
        </View>
        {listing.publicDescription ? (
          <Text
            style={[styles.description, { color: theme.muted }]}
            numberOfLines={1}
          >
            {listing.publicDescription}
          </Text>
        ) : null}
        {actions ? (
          <View style={[styles.actions, { borderTopColor: theme.border }]}>
            {actions}
          </View>
        ) : null}
      </SurfaceCard>
    </Pressable>
  );
}

function Meta({
  icon,
  iconElement,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconElement?: ReactNode;
  label: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.meta}>
      {iconElement ?? <Ionicons name={icon} size={16} color={theme.iconMuted} />}
      <Text style={[styles.metaText, { color: theme.muted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  cardTop: { alignItems: "center", flexDirection: "row", gap: 11 },
  icon: {
    alignItems: "center",
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  cardHeading: { flex: 1, gap: 3, minWidth: 0 },
  cardTitle: { fontSize: 16, fontWeight: "900", lineHeight: 21 },
  company: { fontSize: 12, fontWeight: "700" },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  meta: { alignItems: "center", flexDirection: "row", gap: 6, minWidth: "45%" },
  metaText: { flexShrink: 1, fontSize: 12, fontWeight: "700" },
  footer: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  badges: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  price: { fontSize: 14, fontWeight: "900" },
  description: { fontSize: 13, lineHeight: 19 },
  actions: {
    borderTopWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 12,
  },
});
