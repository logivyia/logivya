import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { searchFreightListings, type FreightSearchFilters, type FreightTrailerType, type MobileFreightListing } from "@/api/mobileFreight";
import { FreightListingCard } from "@/components/freight-listing-card";
import { FreightOptionPicker } from "@/components/freight-option-picker";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { TextField } from "@/components/text-field";
import { PageHeader, SurfaceCard } from "@/components/ui";
import { dateToInput, trailerOptions } from "@/features/freight/freight-format";
import { EMPTY_BLOCKED_OWNER_IDS, useMarketplaceSafetyStore } from "@/features/marketplace/marketplace-safety-store";
import { useAuthStore } from "@/auth/auth-store";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { FindLoadsStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<FindLoadsStackParamList, "FindLoadsHome">;
type FilterDraft = { q: string; origin: string; destination: string; loadingDate: string; trailerType: FreightTrailerType | null; minWeight: string; maxWeight: string };

const emptyFilters: FilterDraft = { q: "", origin: "", destination: "", loadingDate: "", trailerType: null, minWeight: "", maxWeight: "" };

function apiFilters(draft: FilterDraft, cursor?: string): FreightSearchFilters {
  return {
    ...(draft.q.trim() ? { q: draft.q.trim() } : {}),
    ...(draft.origin.trim() ? { origin: draft.origin.trim() } : {}),
    ...(draft.destination.trim() ? { destination: draft.destination.trim() } : {}),
    ...(draft.loadingDate ? { loadingDate: draft.loadingDate } : {}),
    ...(draft.trailerType ? { trailerType: draft.trailerType } : {}),
    ...(draft.minWeight.trim() ? { minWeight: Number(draft.minWeight.replace(",", ".")) } : {}),
    ...(draft.maxWeight.trim() ? { maxWeight: Number(draft.maxWeight.replace(",", ".")) } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 20,
  };
}

export function FindLoadsScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const initialFilters = useMemo<FilterDraft>(() => ({ ...emptyFilters, q: route.params?.initialQuery?.trim() ?? "" }), [route.params?.initialQuery]);
  const [draft, setDraft] = useState<FilterDraft>(initialFilters);
  const [applied, setApplied] = useState<FilterDraft>(initialFilters);
  const [listings, setListings] = useState<MobileFreightListing[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const viewerUserId = useAuthStore((state) => state.user?.id ?? null);
  const blockedOwnerIds = useMarketplaceSafetyStore(
    (state) => (viewerUserId ? state.blockedOwnerIdsByViewer[viewerUserId] ?? EMPTY_BLOCKED_OWNER_IDS : EMPTY_BLOCKED_OWNER_IDS),
  );
  const visibleListings = useMemo(
    () => listings.filter((listing) => !blockedOwnerIds.includes(listing.ownerUserId)),
    [blockedOwnerIds, listings],
  );
  const pickerOptions = useMemo(() => trailerOptions.map((option) => ({ value: option.value, label: t(option.labelKey) })), [t]);

  const load = useCallback(async (filters: FilterDraft, mode: "replace" | "refresh" | "append" = "replace") => {
    if (mode === "append" && (!hasMore || !nextCursor || loadingMore)) return;
    if (mode === "append") setLoadingMore(true);
    else if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await searchFreightListings({
        ...apiFilters(filters, mode === "append" ? nextCursor ?? undefined : undefined),
        scope: route.params?.scope ?? "GLOBAL",
      });
      setListings((current) => mode === "append" ? [...current, ...response.listings] : response.listings);
      setNextCursor(response.pageInfo.nextCursor);
      setHasMore(response.pageInfo.hasMore);
      setLoaded(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("freightSearchFailed"));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, nextCursor, route.params?.scope, t]);

  useFocusEffect(useCallback(() => {
    if (!loaded) void load(applied);
  }, [applied, load, loaded]));

  function applyFilters() {
    const minimum = draft.minWeight.trim() ? Number(draft.minWeight.replace(",", ".")) : null;
    const maximum = draft.maxWeight.trim() ? Number(draft.maxWeight.replace(",", ".")) : null;
    if ((minimum != null && (!Number.isFinite(minimum) || minimum <= 0)) || (maximum != null && (!Number.isFinite(maximum) || maximum <= 0)) || (minimum != null && maximum != null && minimum > maximum)) {
      setFilterError(t("freightWeightRangeInvalid"));
      return;
    }
    setFilterError(null);
    setApplied(draft);
    void load(draft);
  }

  function clearFilters() {
    setDraft(emptyFilters);
    setApplied(emptyFilters);
    setFilterError(null);
    void load(emptyFilters);
  }

  function onDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === "android") setDateOpen(false);
    if (event.type === "set" && selected) setDraft((current) => ({ ...current, loadingDate: dateToInput(selected) }));
  }

  const header = (
    <View style={styles.header}>
      <PageHeader eyebrow={t("freightMarketplace")} title={t("findLoads")} description={t("findLoadsDescription")} />
      <SurfaceCard style={styles.filters}>
        <TextField label={t("marketplaceSearch")} value={draft.q} maxLength={160} onChangeText={(q) => setDraft((current) => ({ ...current, q }))} />
        <View style={styles.twoColumns}>
          <View style={styles.column}><TextField label={t("from")} value={draft.origin} maxLength={160} onChangeText={(origin) => setDraft((current) => ({ ...current, origin }))} /></View>
          <View style={styles.column}><TextField label={t("to")} value={draft.destination} maxLength={160} onChangeText={(destination) => setDraft((current) => ({ ...current, destination }))} /></View>
        </View>
        <FreightOptionPicker label={t("freightTrailerType")} value={draft.trailerType} placeholder={t("freightAllTrailerTypes")} options={pickerOptions} open={trailerOpen} onOpen={() => setTrailerOpen(true)} onClose={() => setTrailerOpen(false)} onChange={(trailerType) => setDraft((current) => ({ ...current, trailerType }))} />
        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>{t("freightLoadingDateOptional")}</Text>
          <View style={styles.dateRow}>
            <Pressable onPress={() => setDateOpen(true)} style={[styles.dateControl, { backgroundColor: theme.input, borderColor: theme.border }]}>
              <Text style={{ color: draft.loadingDate ? theme.text : theme.muted, fontWeight: "700" }}>{draft.loadingDate || t("freightAnyDate")}</Text>
            </Pressable>
            {draft.loadingDate ? <Pressable onPress={() => setDraft((current) => ({ ...current, loadingDate: "" }))} style={styles.clearDate}><Text style={{ color: theme.primary, fontWeight: "900" }}>{t("clear")}</Text></Pressable> : null}
          </View>
          {dateOpen ? <DateTimePicker minimumDate={new Date()} mode="date" value={draft.loadingDate ? new Date(`${draft.loadingDate}T12:00:00`) : new Date()} onChange={onDateChange} /> : null}
        </View>
        <View style={styles.twoColumns}>
          <View style={styles.column}><TextField label={t("freightMinimumWeight")} keyboardType="decimal-pad" value={draft.minWeight} onChangeText={(minWeight) => setDraft((current) => ({ ...current, minWeight }))} /></View>
          <View style={styles.column}><TextField label={t("freightMaximumWeight")} keyboardType="decimal-pad" value={draft.maxWeight} onChangeText={(maxWeight) => setDraft((current) => ({ ...current, maxWeight }))} /></View>
        </View>
        {filterError ? <Text style={[styles.filterError, { color: theme.danger }]}>{filterError}</Text> : null}
        <View style={styles.actions}><View style={styles.primaryAction}><PrimaryButton title={t("findLoads")} icon="search-outline" loading={loading && loaded} onPress={applyFilters} /></View><Pressable onPress={clearFilters} style={[styles.secondaryAction, { borderColor: theme.border }]}><Text style={{ color: theme.text, fontWeight: "900" }}>{t("clearFilters")}</Text></Pressable></View>
      </SurfaceCard>
      <Text style={[styles.resultsTitle, { color: theme.text }]}>{t("freightAvailableLoads")}</Text>
      {error && listings.length > 0 ? <Text style={[styles.inlineError, { backgroundColor: theme.dangerSoft, color: theme.danger }]}>{error}</Text> : null}
    </View>
  );

  if (loading && !loaded) return <Screen><View style={styles.center}><ActivityIndicator color={theme.primary} size="large" /><Text style={{ color: theme.muted }}>{t("freightLoadingListings")}</Text></View></Screen>;
  if (error && listings.length === 0) return <Screen><ErrorState title={error} onRetry={() => void load(applied)} /></Screen>;

  return (
    <Screen style={styles.screen}>
      <FlatList
        data={visibleListings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <FreightListingCard listing={item} onPress={() => navigation.navigate("FreightDetails", { listingId: item.id })} />}
        ListHeaderComponent={header}
        ListEmptyComponent={<EmptyState title={t("freightNoLoads")} description={t("freightNoLoadsDescription")} />}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.primary} style={styles.footerLoader} /> : null}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(applied, "refresh")} tintColor={theme.primary} />}
        onEndReached={() => void load(applied, "append")}
        onEndReachedThreshold={0.35}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingTop: 0 },
  list: { gap: 14, padding: 18, paddingBottom: 40 },
  header: { gap: 16, marginBottom: 2 },
  filters: { gap: 14 },
  twoColumns: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  column: { flex: 1, minWidth: 140 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: "800" },
  dateRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  dateControl: { borderRadius: 14, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 54, paddingHorizontal: 16 },
  clearDate: { justifyContent: "center", minHeight: 44, paddingHorizontal: 8 },
  filterError: { fontSize: 13, fontWeight: "800" },
  actions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10 },
  primaryAction: { flex: 1, minWidth: 180 },
  secondaryAction: { alignItems: "center", borderRadius: 16, borderWidth: 1, justifyContent: "center", minHeight: 56, paddingHorizontal: 18 },
  resultsTitle: { fontSize: 18, fontWeight: "900" },
  inlineError: { borderRadius: 14, fontSize: 13, fontWeight: "800", padding: 12 },
  center: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center" },
  footerLoader: { marginVertical: 18 },
});
