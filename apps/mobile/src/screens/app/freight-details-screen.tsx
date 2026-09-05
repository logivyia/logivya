import { localizeListingSummary } from "../../../../../shared/localize-listing-summary";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getFreightListing, type MobileFreightListing } from "@/api/mobileFreight";
import { useSettingsStore } from "@/auth/settings-store";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { ErrorState } from "@/components/state/error-state";
import { Badge, PageHeader, SurfaceCard } from "@/components/ui";
import { containerLabelKey, formatFreightDate, formatFreightPrice, statusLabelKeys } from "@/features/freight/freight-format";
import { MarketplaceContactActions } from "@/features/freight/marketplace-contact-actions";
import { DemandContextBanner } from "@/features/freight/demand-context-banner";
import { MarketplaceSafetyActions } from "@/features/marketplace/marketplace-safety-actions";
import { useTranslation } from "@/i18n/use-translation";
import { localeMetadata } from "@/i18n/config";
import { useTheme } from "@/theme/theme-provider";
import type { FindLoadsStackParamList, MyListingsStackParamList } from "@/types/navigation";
import { hasInvalidMarketplaceLinkIdentifier, normalizeMarketplaceLinkIdentifier } from "@/navigation/marketplace-link-context";

type PublicProps = NativeStackScreenProps<FindLoadsStackParamList, "FreightDetails">;
type OwnerProps = NativeStackScreenProps<MyListingsStackParamList, "OwnedFreightDetails">;

export function FreightDetailsScreen({ route, navigation }: PublicProps) {
  const requestId = normalizeMarketplaceLinkIdentifier(route.params.requestId);
  return <FreightDetailsContent
    listingId={route.params.listingId}
    {...(requestId ? { requestId } : {})}
    invalidDemandContext={hasInvalidMarketplaceLinkIdentifier(route.params.requestId)}
    onBack={(validatedRequestId) => validatedRequestId
      ? navigation.getParent()?.navigate("DemandRequests", { screen: "DemandRequestMatches", params: { requestId: validatedRequestId } })
      : navigation.goBack()}
  />;
}

export function OwnedFreightDetailsScreen({ route, navigation }: OwnerProps) {
  return <FreightDetailsContent listingId={route.params.listingId} onBack={() => navigation.goBack()} onEdit={(listingId) => navigation.navigate("EditFreightListing", { listingId })} />;
}

function FreightDetailsContent({ listingId, requestId, invalidDemandContext = false, onBack, onEdit }: { listingId: string; requestId?: string; invalidDemandContext?: boolean; onBack: (requestId: string | null) => void; onEdit?: (listingId: string) => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const locale = useSettingsStore((state) => state.locale);
  const [rawListing, setListing] = useState<MobileFreightListing | null>(null);
  const listing = rawListing ? localizeListingSummary(rawListing, locale) : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validatedRequestId, setValidatedRequestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setValidatedRequestId(null);
    if (invalidDemandContext) {
      setError(t("freightDetailsFailed"));
      setLoading(false);
      return;
    }
    try {
      const response = await getFreightListing(listingId, requestId);
      setListing(response.listing);
      setValidatedRequestId(response.requestId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("freightDetailsFailed"));
    } finally {
      setLoading(false);
    }
  }, [invalidDemandContext, listingId, requestId, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading && !listing) return <Screen><View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /><Text style={{ color: theme.muted }}>{t("freightLoadingDetails")}</Text></View></Screen>;
  if (error && !listing) return <Screen><ErrorState title={error} onRetry={() => void load()} /></Screen>;
  if (!listing) return null;
  const price = formatFreightPrice(listing, locale);
  const tone = listing.status === "ACTIVE" ? "success" : listing.status === "COMPLETED" ? "primary" : "default";

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable accessibilityRole="button" onPress={() => onBack(validatedRequestId)} style={styles.back}><Ionicons name="arrow-back" size={22} color={theme.primary} /><Text style={{ color: theme.primary, fontWeight: "900" }}>{t("back")}</Text></Pressable>
        <DemandContextBanner requestId={validatedRequestId} />
        <PageHeader eyebrow={t("freightLoadDetails")} title={listing.publicTitle} description={listing.publicAdvertiserName} right={<Badge label={t(statusLabelKeys[listing.status])} tone={tone} />} />
        <SurfaceCard style={styles.card}>
          <Detail label={t("loadingLabel")} value={listing.loadingDisplayName ?? t("notSpecified")} />
          <Detail label={t("deliveryLabel")} value={listing.deliveryDisplayName ?? t("notSpecified")} />
          <Detail label={t("freightLoadingDate")} value={formatFreightDate(listing.loadingDate, locale)} />
          <Detail label={t("freightWeightTonnes")} value={listing.tonnageDisplay ?? t("notSpecified")} />
          <Detail label={t("freightTrailerType")} value={listing.vehicleDisplayName ?? t("notSpecified")} />
          <Detail label={t("freightVehicleCount")} value={listing.vehicleCountDisplay ?? String(listing.vehicleCount)} />
          <Detail label={t("freightCargoType")} value={listing.cargoType ?? t("notSpecified")} />
          <Detail label={t("freightPrice")} value={price ?? t("freightPriceNotSpecified")} />
          <Detail label={t("freightContainerStatus")} value={t(containerLabelKey(listing.containerStatus))} />
          <Detail label={t("freightCustoms")} value={listing.customsInfo ?? t("notSpecified")} />
          <Detail label={t("freightListingOwner")} value={listing.publicAdvertiserName} />
          <Detail label={t("listingSourceLabel")} value={listing.sourcePlatformDisplay} />
          <Detail label={t("freightPublishedAt")} value={new Intl.DateTimeFormat(localeMetadata[locale].intlLocale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(listing.publishedAt))} />
        </SurfaceCard>
        {listing.publicDescription ? <SurfaceCard style={styles.card}><Text style={[styles.sectionTitle, { color: theme.text }]}>{t("freightDescription")}</Text><Text style={[styles.description, { color: theme.muted }]}>{listing.publicDescription}</Text></SurfaceCard> : null}
        {error ? <Text style={[styles.inlineError, { backgroundColor: theme.dangerSoft, color: theme.danger }]}>{error}</Text> : null}
        {onEdit && listing.status !== "COMPLETED" && listing.status !== "EXPIRED" ? <PrimaryButton title={t("editListing")} icon="create-outline" onPress={() => onEdit(listing.id)} /> : null}
        {!onEdit ? <MarketplaceContactActions contactAccess={listing.contactAccess} phone={listing.contactPhone} canCall={listing.canCall} canOpenWhatsApp={listing.canOpenWhatsApp} whatsappPrefilledMessage={listing.whatsappPrefilledMessage} /> : null}
        {!onEdit ? (
          <MarketplaceSafetyActions
            kind="LOAD"
            listingId={listing.id}
            ownerUserId={listing.ownerUserId}
            ownerName={listing.ownerName}
            title={`${listing.origin} → ${listing.destination}`}
            onBlocked={() => onBack(validatedRequestId)}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return <View style={[styles.detail, { borderBottomColor: theme.border }]}><Text style={[styles.detailLabel, { color: theme.muted }]}>{label}</Text><Text selectable style={[styles.detailValue, { color: theme.text }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingTop: 0 },
  scroll: { gap: 16, padding: 18, paddingBottom: 40 },
  back: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 8, minHeight: 44 },
  card: { gap: 4 },
  detail: { borderBottomWidth: StyleSheet.hairlineWidth, gap: 5, paddingVertical: 12 },
  detailLabel: { fontSize: 12, fontWeight: "800" },
  detailValue: { fontSize: 15, fontWeight: "800", lineHeight: 22 },
  sectionTitle: { fontSize: 17, fontWeight: "900" },
  description: { fontSize: 15, lineHeight: 23 },
  inlineError: { borderRadius: 14, fontSize: 13, fontWeight: "800", padding: 12 },
  center: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center" },
});
