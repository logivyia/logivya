import { CatalogReturnScreen } from "@/features/freight/catalog-return";
import { localizeListingSummary } from "../../../../../shared/localize-listing-summary";
import * as Crypto from "expo-crypto";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  createVehicleListing,
  getVehicleListing,
  searchVehicleListings,
  updateVehicleListing,
  type FreightTrailerType,
  type MobileVehicleListing,
  type VehicleListingPayload,
  type VehicleSearchFilters,
} from "@/api/mobileFreight";
import { useAuthStore } from "@/auth/auth-store";
import { FreightOptionPicker } from "@/components/freight-option-picker";
import { VehicleListingCard } from "@/components/marketplace-listing-card";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { TextField } from "@/components/text-field";
import { Badge, PageHeader, SurfaceCard } from "@/components/ui";
import {
  formatFreightDate,
  trailerLabelKey,
  trailerOptions,
} from "@/features/freight/freight-format";
import { useSettingsStore } from "@/auth/settings-store";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { VehicleMarketplaceStackParamList } from "@/types/navigation";
import { VehicleListingForm } from "@/components/vehicle-listing-form";
import { MarketplaceSafetyActions } from "@/features/marketplace/marketplace-safety-actions";
import { EMPTY_BLOCKED_OWNER_IDS, useMarketplaceSafetyStore } from "@/features/marketplace/marketplace-safety-store";
import { MarketplaceContactActions } from "@/features/freight/marketplace-contact-actions";
import { DemandContextBanner } from "@/features/freight/demand-context-banner";
import { hasInvalidMarketplaceLinkIdentifier, normalizeMarketplaceLinkIdentifier } from "@/navigation/marketplace-link-context";

type SearchProps = NativeStackScreenProps<
  VehicleMarketplaceStackParamList,
  "VehicleSearch"
>;
type CreateProps = NativeStackScreenProps<
  VehicleMarketplaceStackParamList,
  "CreateVehicle"
>;
type DetailProps = NativeStackScreenProps<
  VehicleMarketplaceStackParamList,
  "VehicleDetails"
>;
type EditProps = NativeStackScreenProps<
  VehicleMarketplaceStackParamList,
  "EditVehicle"
>;
type Draft = {
  q: string;
  origin: string;
  destination: string;
  trailerType: FreightTrailerType | null;
};

export function VehicleSearchScreen(props: SearchProps) {
  return props.route.params?.initialCatalog ? <CatalogReturnScreen initialCatalog={props.route.params.initialCatalog} /> : <VehicleSearchScreenContent {...props} />;
}

function VehicleSearchScreenContent({ navigation, route }: SearchProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const initial = useMemo<Draft>(
    () => ({
      q: route.params?.initialQuery?.trim() ?? "",
      origin: "",
      destination: "",
      trailerType: null,
    }),
    [route.params?.initialQuery],
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [applied, setApplied] = useState<Draft>(initial);
  const [listings, setListings] = useState<MobileVehicleListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const viewerUserId = useAuthStore((state) => state.user?.id ?? null);
  const blockedOwnerIds = useMarketplaceSafetyStore(
    (state) => (viewerUserId ? state.blockedOwnerIdsByViewer[viewerUserId] ?? EMPTY_BLOCKED_OWNER_IDS : EMPTY_BLOCKED_OWNER_IDS),
  );
  const visibleListings = useMemo(
    () => listings.filter((listing) => !blockedOwnerIds.includes(listing.ownerUserId)),
    [blockedOwnerIds, listings],
  );
  const pickerOptions = useMemo(
    () =>
      trailerOptions.map((option) => ({
        value: option.value,
        label: t(option.labelKey),
      })),
    [t],
  );
  const load = useCallback(
    async (
      filters: Draft,
      mode: "replace" | "refresh" | "append" = "replace",
    ) => {
      if (mode === "append" && (!hasMore || !nextCursor || loadingMore)) return;
      if (mode === "append") setLoadingMore(true);
      else if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setError(null);
      const values: VehicleSearchFilters = {
        ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
        ...(filters.origin.trim() ? { origin: filters.origin.trim() } : {}),
        ...(filters.destination.trim()
          ? { destination: filters.destination.trim() }
          : {}),
        ...(filters.trailerType ? { trailerType: filters.trailerType } : {}),
        ...(mode === "append" && nextCursor ? { cursor: nextCursor } : {}),
        scope: route.params?.scope ?? "GLOBAL",
        limit: 20,
      };
      try {
        const response = await searchVehicleListings(values);
        setListings((current) =>
          mode === "append"
            ? [...current, ...response.listings]
            : response.listings,
        );
        setNextCursor(response.pageInfo.nextCursor);
        setHasMore(response.pageInfo.hasMore);
        setLoaded(true);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : t("vehicleSearchFailed"),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [hasMore, loadingMore, nextCursor, route.params?.scope, t],
  );
  useFocusEffect(
    useCallback(() => {
      if (!loaded) void load(applied);
    }, [applied, load, loaded]),
  );
  function apply() {
    setApplied(draft);
    void load(draft);
  }
  function clear() {
    const empty: Draft = {
      q: "",
      origin: "",
      destination: "",
      trailerType: null,
    };
    setDraft(empty);
    setApplied(empty);
    void load(empty);
  }
  const header = (
    <View style={styles.header}>
      <PageHeader
        eyebrow={t("logisticsMarketplace")}
        title={t("findAndShareVehicle")}
        description={t("findVehicleDescription")}
      />
      <VehicleWorkspaceSwitch mode="FIND" onFind={() => undefined} onShare={() => navigation.navigate("CreateVehicle", route.params?.scope && route.params.scope !== "GLOBAL" ? { sector: route.params.scope } : undefined)} />
      <SurfaceCard style={styles.filters}>
        <TextField
          label={t("marketplaceSearch")}
          placeholder={t("searchVehiclePlaceholder")}
          value={draft.q}
          onChangeText={(q) => setDraft((current) => ({ ...current, q }))}
        />
        <View style={styles.columns}>
          <View style={styles.column}>
            <TextField
              label={t("from")}
              value={draft.origin}
              onChangeText={(origin) =>
                setDraft((current) => ({ ...current, origin }))
              }
            />
          </View>
          <View style={styles.column}>
            <TextField
              label={t("toOptional")}
              value={draft.destination}
              onChangeText={(destination) =>
                setDraft((current) => ({ ...current, destination }))
              }
            />
          </View>
        </View>
        <FreightOptionPicker
          label={t("freightTrailerType")}
          value={draft.trailerType}
          placeholder={t("freightAllTrailerTypes")}
          options={pickerOptions}
          open={trailerOpen}
          onOpen={() => setTrailerOpen(true)}
          onClose={() => setTrailerOpen(false)}
          onChange={(trailerType) =>
            setDraft((current) => ({ ...current, trailerType }))
          }
        />
        <View style={styles.filterActions}>
          <View style={styles.flex}>
            <PrimaryButton
              title={t("findVehicle")}
              icon="search-outline"
              loading={loading && loaded}
              onPress={apply}
            />
          </View>
          <Pressable
            onPress={clear}
            style={[styles.secondary, { borderColor: theme.border }]}
          >
            <Text style={{ color: theme.text, fontWeight: "900" }}>
              {t("clearFilters")}
            </Text>
          </Pressable>
        </View>
      </SurfaceCard>
      <Text style={[styles.resultsTitle, { color: theme.text }]}>
        {t("availableVehicles")}
      </Text>
    </View>
  );
  if (loading && !loaded)
    return (
      <Screen>
        <Center label={t("freightLoadingListings")} />
      </Screen>
    );
  if (error && !listings.length)
    return (
      <Screen>
        <ErrorState title={error} onRetry={() => void load(applied)} />
      </Screen>
    );
  return (
    <Screen style={styles.screen}>
      <FlatList
        data={visibleListings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <VehicleListingCard
            listing={item}
            onPress={() =>
              navigation.navigate("VehicleDetails", { listingId: item.id })
            }
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            title={t("noVehiclesFound")}
            description={t("noVehiclesFoundDescription")}
          />
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={theme.primary} /> : null
        }
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(applied, "refresh")}
            tintColor={theme.primary}
          />
        }
        onEndReached={() => void load(applied, "append")}
        onEndReachedThreshold={0.35}
      />
    </Screen>
  );
}

export function CreateVehicleScreen({ navigation, route }: CreateProps) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const company = useAuthStore((state) => state.company);
  const requestId = useRef(Crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(payload: VehicleListingPayload) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await createVehicleListing({
        ...payload,
        primarySector:
          route.params?.sector ?? payload.primarySector ?? "GENERAL_LOGISTICS",
        clientRequestId: requestId.current,
      });
      Alert.alert(
        t("vehiclePublishedTitle"),
        t("vehiclePublishedDescription"),
        [
          {
            text: t("viewMyListings"),
            onPress: () => navigation.getParent()?.navigate("MyListings"),
          },
        ],
      );
      requestId.current = Crypto.randomUUID();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("vehicleCreateFailed"),
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <VehicleListingForm
      defaultPhone={user?.phone ?? ""}
      defaultCurrency={company?.defaultCurrency ?? "TRY"}
      saving={saving}
      error={error}
      title={t("findAndShareVehicle")}
      description={t("shareVehicleDescription")}
      submitTitle={t("publishVehicle")}
      initialSector={route.params?.sector}
      lockedSector={route.params?.sector}
      headerAddon={
        <VehicleWorkspaceSwitch
          mode="SHARE"
          onFind={() => {
            const scope = route.params?.sector;
            navigation.navigate(
              "VehicleSearch",
              scope && scope !== "GENERAL_LOGISTICS" ? { scope } : undefined,
            );
          }}
          onShare={() => undefined}
        />
      }
      onSubmit={submit}
    />
  );
}

export function VehicleDetailsScreen({ route, navigation }: DetailProps) {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const [rawListing, setListing] = useState<MobileVehicleListing | null>(null);
  const listing = rawListing ? localizeListingSummary(rawListing, locale) : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validatedRequestId, setValidatedRequestId] = useState<string | null>(null);
  const requestId = normalizeMarketplaceLinkIdentifier(route.params.requestId);
  const invalidDemandContext = hasInvalidMarketplaceLinkIdentifier(route.params.requestId);
  const goBack = useCallback(() => {
    if (validatedRequestId) {
      navigation.getParent()?.navigate("DemandRequests", { screen: "DemandRequestMatches", params: { requestId: validatedRequestId } });
      return;
    }
    navigation.goBack();
  }, [navigation, validatedRequestId]);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setValidatedRequestId(null);
    if (invalidDemandContext) {
      setError(t("vehicleDetailFailed"));
      setLoading(false);
      return;
    }
    try {
      const response = await getVehicleListing(route.params.listingId, requestId ?? undefined);
      setListing(response.listing);
      setValidatedRequestId(response.requestId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("vehicleDetailFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [invalidDemandContext, requestId, route.params.listingId, t]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  if (loading && !listing)
    return (
      <Screen>
        <Center label={t("loading")} />
      </Screen>
    );
  if (error && !listing)
    return (
      <Screen>
        <ErrorState title={error} onRetry={() => void load()} />
      </Screen>
    );
  if (!listing) return null;
  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.detail}>
        <BackButton onPress={goBack} />
        <DemandContextBanner requestId={validatedRequestId} />
        <PageHeader
          eyebrow={t("vehicleListing")}
          title={listing.publicTitle}
          description={listing.publicAdvertiserName}
        />
        <VehicleListingCard listing={listing} onPress={() => undefined} />
        <SurfaceCard style={styles.detailCard}>
          <DetailRow
            label={t("availableFrom")}
            value={formatFreightDate(listing.availableFrom, locale)}
          />
          <DetailRow
            label={t("availableUntilOptional")}
            value={
              listing.availableUntil
                ? formatFreightDate(listing.availableUntil, locale)
                : t("notSpecified")
            }
          />
          <DetailRow
            label={t("freightTrailerType")}
            value={listing.vehicleDisplayName ?? t("notSpecified")}
          />
          <DetailRow
            label={t("vehicleCapacityTonnesOptional")}
            value={
              listing.tonnageDisplay ?? t("capacityFlexible")
            }
          />
          <DetailRow
            label={t("freightVehicleCount")}
            value={listing.vehicleCountDisplay ?? String(listing.vehicleCount)}
          />
          <DetailRow label={t("advertiser")} value={listing.publicAdvertiserName} />
          <DetailRow label={t("listingSourceLabel")} value={listing.sourcePlatformDisplay} />
          {listing.publicDescription ? (
            <DetailRow label={t("description")} value={listing.publicDescription} />
          ) : null}
        </SurfaceCard>
        <MarketplaceContactActions contactAccess={listing.contactAccess} phone={listing.contactPhone} canCall={listing.canCall} canOpenWhatsApp={listing.canOpenWhatsApp} whatsappPrefilledMessage={listing.whatsappPrefilledMessage} />
        <MarketplaceSafetyActions
          kind="VEHICLE"
          listingId={listing.id}
          ownerUserId={listing.ownerUserId}
          ownerName={listing.ownerName}
          title={listing.publicTitle}
          onBlocked={goBack}
        />
      </ScrollView>
    </Screen>
  );
}

export function EditVehicleScreen({ route, navigation }: EditProps) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const company = useAuthStore((state) => state.company);
  const [listing, setListing] = useState<MobileVehicleListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getVehicleListing(route.params.listingId);
      setListing(response.listing);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("vehicleDetailFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [route.params.listingId, t]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  async function submit(payload: VehicleListingPayload) {
    setSaving(true);
    setError(null);
    try {
      await updateVehicleListing(route.params.listingId, payload);
      Alert.alert(t("saved"), t("vehicleUpdated"), [
        { text: t("ok"), onPress: () => navigation.goBack() },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("vehicleUpdateFailed"),
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading && !listing)
    return (
      <Screen>
        <Center label={t("loading")} />
      </Screen>
    );
  if (error && !listing)
    return (
      <Screen>
        <ErrorState title={error} onRetry={() => void load()} />
      </Screen>
    );
  if (!listing) return null;
  return (
    <VehicleListingForm
      listing={listing}
      defaultPhone={user?.phone ?? ""}
      defaultCurrency={company?.defaultCurrency ?? "TRY"}
      saving={saving}
      error={error}
      title={t("editVehicleListing")}
      description={t("editVehicleListingDescription")}
      submitTitle={t("saveChanges")}
      onBack={() => navigation.goBack()}
      onSubmit={submit}
    />
  );
}

function Center({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Text style={{ color: theme.muted }}>{label}</Text>
    </View>
  );
}

function VehicleWorkspaceSwitch({ mode, onFind, onShare }: { mode: "FIND" | "SHARE"; onFind: () => void; onShare: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  return <View accessibilityRole="tablist" style={[styles.workspaceSwitch, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === "FIND" }} onPress={onFind} style={[styles.workspaceTab, mode === "FIND" ? { backgroundColor: theme.primary } : null]}><Ionicons name="search-outline" size={18} color={mode === "FIND" ? theme.primaryText : theme.iconMuted} /><Text style={[styles.workspaceTabText, { color: mode === "FIND" ? theme.primaryText : theme.text }]}>{t("findVehicle")}</Text></Pressable>
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === "SHARE" }} onPress={onShare} style={[styles.workspaceTab, mode === "SHARE" ? { backgroundColor: theme.primary } : null]}><Ionicons name="add-circle-outline" size={18} color={mode === "SHARE" ? theme.primaryText : theme.iconMuted} /><Text style={[styles.workspaceTabText, { color: mode === "SHARE" ? theme.primaryText : theme.text }]}>{t("shareVehicle")}</Text></Pressable>
  </View>;
}
function BackButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.back}>
      <Text style={{ color: theme.primary, fontSize: 17, fontWeight: "900" }}>← {t("back")}</Text>
    </Pressable>
  );
}
function DetailRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.detailRow, { borderBottomColor: theme.border }]}>
      <Text style={[styles.detailLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingTop: 0 },
  back: { alignSelf: "flex-start", justifyContent: "center", minHeight: 44 },
  list: { gap: 14, padding: 18, paddingBottom: 150 },
  header: { gap: 16 },
  workspaceSwitch: { borderRadius: 17, borderWidth: 1, flexDirection: "row", gap: 6, padding: 5 },
  workspaceTab: { alignItems: "center", borderRadius: 13, flex: 1, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 44, paddingHorizontal: 12 },
  workspaceTabText: { fontSize: 13, fontWeight: "900" },
  headerAction: {
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  filters: { gap: 14 },
  columns: { gap: 12 },
  column: { width: "100%" },
  filterActions: {
    alignItems: "center",
    flexDirection: "column",
    gap: 10,
  },
  flex: { width: "100%" },
  secondary: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 16,
  },
  resultsTitle: { fontSize: 18, fontWeight: "900" },
  center: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center" },
  detail: { gap: 16, padding: 18, paddingBottom: 150 },
  detailCard: { gap: 0 },
  detailRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 5,
    paddingVertical: 13,
  },
  detailLabel: { fontSize: 12, fontWeight: "800" },
  detailValue: { fontSize: 15, fontWeight: "800", lineHeight: 21 },
  notice: { fontSize: 13, textAlign: "center" },
});
