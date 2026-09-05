import * as Crypto from "expo-crypto";
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
  createDriverListing,
  getDriverListing,
  searchDriverListings,
  updateDriverListing,
  type DriverEmploymentType,
  type DriverLicenseClass,
  type DriverListingPayload,
  type DriverListingType,
  type DriverSearchFilters,
  type MobileDriverListing,
} from "@/api/mobileFreight";
import { useAuthStore } from "@/auth/auth-store";
import { DriverListingForm } from "@/components/driver-listing-form";
import { FreightOptionPicker } from "@/components/freight-option-picker";
import { DriverListingCard } from "@/components/marketplace-listing-card";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { TextField } from "@/components/text-field";
import { Chip, PageHeader, SurfaceCard } from "@/components/ui";
import { formatFreightDate } from "@/features/freight/freight-format";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { DriverMarketplaceStackParamList } from "@/types/navigation";
import { MarketplaceSafetyActions } from "@/features/marketplace/marketplace-safety-actions";
import { EMPTY_BLOCKED_OWNER_IDS, useMarketplaceSafetyStore } from "@/features/marketplace/marketplace-safety-store";
import { MarketplaceContactActions } from "@/features/freight/marketplace-contact-actions";
import { DemandContextBanner } from "@/features/freight/demand-context-banner";
import { hasInvalidMarketplaceLinkIdentifier, normalizeMarketplaceLinkIdentifier } from "@/navigation/marketplace-link-context";

type SearchProps = NativeStackScreenProps<
  DriverMarketplaceStackParamList,
  "DriverSearch"
>;
type CreateProps = NativeStackScreenProps<
  DriverMarketplaceStackParamList,
  "CreateDriver"
>;
type DetailProps = NativeStackScreenProps<
  DriverMarketplaceStackParamList,
  "DriverDetails"
>;
type EditProps = NativeStackScreenProps<
  DriverMarketplaceStackParamList,
  "EditDriver"
>;
type Draft = {
  q: string;
  location: string;
  listingType: DriverListingType;
  licenseClass: DriverLicenseClass | null;
  employmentType: DriverEmploymentType | null;
};
const licenses: DriverLicenseClass[] = ["B", "C", "CE", "D", "DE"];

export function DriverSearchScreen({ navigation, route }: SearchProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const initial = useMemo<Draft>(
    () => ({
      q: route.params?.initialQuery?.trim() ?? "",
      location: "",
      listingType: "DRIVER_AVAILABLE",
      licenseClass: null,
      employmentType: null,
    }),
    [route.params?.initialQuery],
  );
  const [draft, setDraft] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [listings, setListings] = useState<MobileDriverListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [employmentOpen, setEmploymentOpen] = useState(false);
  const viewerUserId = useAuthStore((state) => state.user?.id ?? null);
  const blockedOwnerIds = useMarketplaceSafetyStore(
    (state) => (viewerUserId ? state.blockedOwnerIdsByViewer[viewerUserId] ?? EMPTY_BLOCKED_OWNER_IDS : EMPTY_BLOCKED_OWNER_IDS),
  );
  const visibleListings = useMemo(
    () => listings.filter((listing) => !blockedOwnerIds.includes(listing.ownerUserId)),
    [blockedOwnerIds, listings],
  );
  const licenseOptions = useMemo(
    () => licenses.map((value) => ({ value, label: value })),
    [],
  );
  const employmentOptions = useMemo<
    Array<{ value: DriverEmploymentType; label: string }>
  >(
    () => [
      { value: "FULL_TIME", label: t("driverEmploymentFULL_TIME") },
      { value: "PART_TIME", label: t("driverEmploymentPART_TIME") },
      { value: "CONTRACT", label: t("driverEmploymentCONTRACT") },
      { value: "DAILY", label: t("driverEmploymentDAILY") },
    ],
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
      const values: DriverSearchFilters = {
        ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
        ...(filters.location.trim()
          ? { location: filters.location.trim() }
          : {}),
        listingType: filters.listingType,
        ...(filters.licenseClass ? { licenseClass: filters.licenseClass } : {}),
        ...(filters.employmentType
          ? { employmentType: filters.employmentType }
          : {}),
        ...(mode === "append" && nextCursor ? { cursor: nextCursor } : {}),
        scope: route.params?.scope ?? "GLOBAL",
        limit: 20,
      };
      try {
        const response = await searchDriverListings(values);
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
            : t("driverSearchFailed"),
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
      location: "",
      listingType: "DRIVER_AVAILABLE",
      licenseClass: null,
      employmentType: null,
    };
    setDraft(empty);
    setApplied(empty);
    void load(empty);
  }
  const header = (
    <View style={styles.header}>
      <PageHeader
        eyebrow={t("logisticsMarketplace")}
        title={t("findDriver")}
        description={t("findDriverDescription")}
        right={
          <Pressable
            onPress={() => navigation.navigate("CreateDriver")}
            style={[styles.headerAction, { backgroundColor: theme.primary }]}
          >
            <Text style={{ color: theme.primaryText, fontWeight: "900" }}>
              {t("postDriverListing")}
            </Text>
          </Pressable>
        }
      />
      <SurfaceCard style={styles.filters}>
        <View style={styles.chips}>
          <Chip
            label={t("driverAvailable")}
            active={draft.listingType === "DRIVER_AVAILABLE"}
            onPress={() =>
              setDraft((current) => ({
                ...current,
                listingType: "DRIVER_AVAILABLE",
              }))
            }
          />
          <Chip
            label={t("driverWanted")}
            active={draft.listingType === "DRIVER_WANTED"}
            onPress={() =>
              setDraft((current) => ({
                ...current,
                listingType: "DRIVER_WANTED",
              }))
            }
          />
        </View>
        <TextField
          label={t("marketplaceSearch")}
          placeholder={t("searchDriverPlaceholder")}
          value={draft.q}
          onChangeText={(q) => setDraft((current) => ({ ...current, q }))}
        />
        <TextField
          label={t("driverLocation")}
          value={draft.location}
          onChangeText={(location) =>
            setDraft((current) => ({ ...current, location }))
          }
        />
        <View style={styles.columns}>
          <View style={styles.column}>
            <FreightOptionPicker
              label={t("driverLicenseClass")}
              value={draft.licenseClass}
              placeholder={t("allLicenseClasses")}
              options={licenseOptions}
              open={licenseOpen}
              onOpen={() => setLicenseOpen(true)}
              onClose={() => setLicenseOpen(false)}
              onChange={(licenseClass) =>
                setDraft((current) => ({ ...current, licenseClass }))
              }
            />
          </View>
          <View style={styles.column}>
            <FreightOptionPicker
              label={t("driverEmploymentType")}
              value={draft.employmentType}
              placeholder={t("allEmploymentTypes")}
              options={employmentOptions}
              open={employmentOpen}
              onOpen={() => setEmploymentOpen(true)}
              onClose={() => setEmploymentOpen(false)}
              onChange={(employmentType) =>
                setDraft((current) => ({ ...current, employmentType }))
              }
            />
          </View>
        </View>
        <View style={styles.filterActions}>
          <View style={styles.flex}>
            <PrimaryButton
              title={t("findDriver")}
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
        {t(
          draft.listingType === "DRIVER_AVAILABLE"
            ? "availableDrivers"
            : "driverJobListings",
        )}
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
          <DriverListingCard
            listing={item}
            onPress={() =>
              navigation.navigate("DriverDetails", { listingId: item.id })
            }
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            title={t("noDriversFound")}
            description={t("noDriversFoundDescription")}
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

export function CreateDriverScreen({ navigation, route }: CreateProps) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const company = useAuthStore((state) => state.company);
  const requestId = useRef(Crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(payload: DriverListingPayload) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await createDriverListing({
        ...payload,
        primarySector:
          route.params?.sector ?? payload.primarySector ?? "GENERAL_LOGISTICS",
        clientRequestId: requestId.current,
      });
      Alert.alert(t("driverPublishedTitle"), t("driverPublishedDescription"), [
        {
          text: t("viewMyListings"),
          onPress: () => navigation.getParent()?.navigate("MyListings"),
        },
      ]);
      requestId.current = Crypto.randomUUID();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("driverCreateFailed"),
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <DriverListingForm
      defaultPhone={user?.phone ?? ""}
      defaultCurrency={company?.defaultCurrency ?? "TRY"}
      saving={saving}
      error={error}
      title={t("postDriverListing")}
      description={t("postDriverListingDescription")}
      submitTitle={t("publishDriverListing")}
      initialSector={route.params?.sector}
      lockedSector={route.params?.sector}
      onSubmit={submit}
    />
  );
}

export function DriverDetailsScreen({ route, navigation }: DetailProps) {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const [listing, setListing] = useState<MobileDriverListing | null>(null);
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
      setError(t("driverDetailFailed"));
      setLoading(false);
      return;
    }
    try {
      const response = await getDriverListing(route.params.listingId, requestId ?? undefined);
      setListing(response.listing);
      setValidatedRequestId(response.requestId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("driverDetailFailed"),
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
          eyebrow={t(
            listing.listingType === "DRIVER_WANTED"
              ? "driverWanted"
              : "driverAvailable",
          )}
          title={listing.publicTitle}
          description={listing.publicAdvertiserName}
        />
        <DriverListingCard listing={listing} onPress={() => undefined} />
        <SurfaceCard style={styles.detailCard}>
          <DetailRow
            label={t("availableFrom")}
            value={formatFreightDate(listing.availableFrom, locale)}
          />
          <DetailRow
            label={t("driverLicenseClasses")}
            value={listing.licenseClasses.join(", ")}
          />
          <DetailRow
            label={t("driverExperienceYears")}
            value={t("yearsExperience", { count: listing.experienceYears })}
          />
          <DetailRow
            label={t("driverEmploymentType")}
            value={employmentLabel(listing.employmentType, t)}
          />
          {listing.preferredRoute ? (
            <DetailRow
              label={t("preferredRoute")}
              value={listing.preferredRoute}
            />
          ) : null}
          <DetailRow label={t("advertiser")} value={listing.publicAdvertiserName} />
          <DetailRow label={t("listingSourceLabel")} value={listing.sourcePlatformDisplay} />
          {listing.publicDescription ? (
            <DetailRow label={t("description")} value={listing.publicDescription} />
          ) : null}
        </SurfaceCard>
        <MarketplaceContactActions contactAccess={listing.contactAccess} phone={listing.contactPhone} canCall={listing.canCall} canOpenWhatsApp={listing.canOpenWhatsApp} whatsappPrefilledMessage={listing.whatsappPrefilledMessage} />
        <MarketplaceSafetyActions
          kind="DRIVER"
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

export function EditDriverScreen({ route, navigation }: EditProps) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const company = useAuthStore((state) => state.company);
  const [listing, setListing] = useState<MobileDriverListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getDriverListing(route.params.listingId);
      setListing(response.listing);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("driverDetailFailed"),
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
  async function submit(payload: DriverListingPayload) {
    setSaving(true);
    setError(null);
    try {
      await updateDriverListing(route.params.listingId, payload);
      Alert.alert(t("saved"), t("driverUpdated"), [
        { text: t("ok"), onPress: () => navigation.goBack() },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("driverUpdateFailed"),
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
    <DriverListingForm
      listing={listing}
      defaultPhone={user?.phone ?? ""}
      defaultCurrency={company?.defaultCurrency ?? "TRY"}
      saving={saving}
      error={error}
      title={t("editDriverListing")}
      description={t("editDriverListingDescription")}
      submitTitle={t("saveChanges")}
      onBack={() => navigation.goBack()}
      onSubmit={submit}
    />
  );
}

function employmentLabel(
  value: DriverEmploymentType,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (value === "FULL_TIME") return t("driverEmploymentFULL_TIME");
  if (value === "PART_TIME") return t("driverEmploymentPART_TIME");
  if (value === "CONTRACT") return t("driverEmploymentCONTRACT");
  return t("driverEmploymentDAILY");
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
  list: { gap: 14, padding: 18, paddingBottom: 44 },
  header: { gap: 16 },
  headerAction: {
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  filters: { gap: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 2 },
  columns: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  column: { flex: 1, minWidth: 140 },
  filterActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  flex: { flex: 1, minWidth: 180 },
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
  detail: { gap: 16, padding: 18, paddingBottom: 44 },
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
