import { Ionicons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useRef, useState, type ComponentProps } from "react";
import { AppState, FlatList, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  getLiveMarketplaceEvents,
  getMarketplaceDemandMatches,
  getMarketplaceDemandRequests,
  type LiveMarketplaceListing,
  type LogisticsSector,
  type MarketplaceDemandMatch,
  type MarketplaceScope,
} from "@/api/mobileFreight";
import { LiveMarketplaceListingCard } from "@/components/live-marketplace-listing-card";
import { CatalogFilters, emptyMarketplaceFilters, matchesMarketplaceFilters, type MarketplaceFilters } from "@/features/freight/catalog-filters";
import { LowbedIcon } from "@/components/lowbed-icon";
import { Screen } from "@/components/screen";
import { ErrorState } from "@/components/state/error-state";
import { SurfaceCard } from "@/components/ui";
import { useProductFeatureStatus } from "@/features/product/productFeatureStore";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { AppTabParamList } from "@/types/navigation";

type SectorRoute = "HomeMoving" | "PartialLoad" | "HeavyHaul";
type Props = BottomTabScreenProps<AppTabParamList, SectorRoute>;
type SearchTarget = "LOAD" | "VEHICLE" | "DRIVER";
type IconName = ComponentProps<typeof Ionicons>["name"];

const sectors = {
  HomeMoving: {
    scope: "HOME_MOVING", feature: "HOME_MOVING", icon: "home-outline",
    titleKey: "homeMovingMarketplace", descriptionKey: "homeMovingMarketplaceDescription",
  },
  PartialLoad: {
    scope: "PARTIAL_LOAD", feature: "PARTIAL_LOAD", icon: "layers-outline",
    titleKey: "partialLoadMarketplace", descriptionKey: "partialLoadMarketplaceDescription",
  },
  HeavyHaul: {
    scope: "HEAVY_HAUL", feature: "HEAVY_HAUL", icon: "construct-outline",
    titleKey: "heavyHaulMarketplace", descriptionKey: "heavyHaulMarketplaceDescription",
  },
} as const;

export function SectorMarketplaceScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const config = sectors[route.name];
  const scope = config.scope as MarketplaceScope;
  const sector = config.scope as LogisticsSector;
  const title = t(config.titleKey);
  const description = t(config.descriptionKey);
  const status = useProductFeatureStatus(config.feature);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<SearchTarget>("LOAD");
  const [liveListings, setLiveListings] = useState<LiveMarketplaceListing[]>([]);
  const [filters, setFilters] = useState<MarketplaceFilters>({ ...emptyMarketplaceFilters });
  const liveGeneration = useRef(0);
  const [liveLoadFailed, setLiveLoadFailed] = useState(false);
  const [recentMatches, setRecentMatches] = useState<MarketplaceDemandMatch[]>([]);
  const cursor = useRef<string | undefined>(undefined);
  const liveRefreshInFlight = useRef(false);

  const refreshLive = useCallback(async (replaceSnapshot = false) => {
    if (liveRefreshInFlight.current && !replaceSnapshot) return;
    liveRefreshInFlight.current = true;
    const run = ++liveGeneration.current;
    try {
      const live = await getLiveMarketplaceEvents(replaceSnapshot ? undefined : cursor.current, 250, scope, filters);
      if (run !== liveGeneration.current) return;
      cursor.current = live.cursor;
      setLiveLoadFailed(false);
      if (!replaceSnapshot && live.events.length === 0) return;
      setLiveListings((current) => {
        const baseline = replaceSnapshot ? [] : current;
        const map = new Map(baseline.map((listing) => [`${listing.kind}:${listing.id}`, listing]));
        for (const event of live.events) {
          const key = `${event.listing.kind}:${event.listing.id}`;
          if (event.event === "listing.deleted" || event.event === "listing.expired" || event.listing.status !== "ACTIVE") map.delete(key);
          else map.set(key, event.listing);
        }
        return [...map.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      });
    } catch {
      if (run === liveGeneration.current) setLiveLoadFailed(true);
    } finally {
      if (run === liveGeneration.current) liveRefreshInFlight.current = false;
    }
  }, [scope, filters]);

  const refreshMatches = useCallback(async () => {
    const requests = await getMarketplaceDemandRequests("ACTIVE", scope).catch(() => null);
    if (requests) {
      const matches = await Promise.all(requests.requests.slice(0, 4).map((request) => getMarketplaceDemandMatches(request.id).catch(() => null)));
      setRecentMatches(matches.flatMap((page) => page?.matches ?? []).sort((a, b) => Date.parse(b.matchedAt) - Date.parse(a.matchedAt)).slice(0, 5));
    }
  }, [scope]);

  useFocusEffect(useCallback(() => {
    void refreshLive(true);
    void refreshMatches();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void refreshLive();
    }, 20_000);
    return () => clearInterval(timer);
  }, [refreshLive, refreshMatches]));

  function runSearch() {
    Keyboard.dismiss();
    const initialQuery = query.trim() || undefined;
    const params = { ...(initialQuery ? { initialQuery } : {}), scope };
    if (target === "LOAD") navigation.navigate("FindLoads", { screen: "FindLoadsHome", params });
    else if (target === "VEHICLE") navigation.navigate("VehicleMarketplace", { screen: "VehicleSearch", params });
    else navigation.navigate("DriverMarketplace", { screen: "DriverSearch", params });
  }

  const openListing = useCallback((listing: Pick<LiveMarketplaceListing, "kind" | "id">) => {
    if (listing.kind === "LOAD") navigation.navigate("FindLoads", { screen: "FreightDetails", params: { listingId: listing.id } });
    else if (listing.kind === "VEHICLE") navigation.navigate("VehicleMarketplace", { screen: "VehicleDetails", params: { listingId: listing.id } });
    else navigation.navigate("DriverMarketplace", { screen: "DriverDetails", params: { listingId: listing.id } });
  }, [navigation]);

  const renderLiveListing = useCallback(({ item }: { item: LiveMarketplaceListing }) => (
    <LiveMarketplaceListingCard listing={item} onPress={() => openListing(item)} />
  ), [openListing]);

  const actions: Array<{ label: string; icon: IconName; onPress: () => void }> = [
    { label: t("createLoad"), icon: "add-circle-outline", onPress: () => navigation.navigate("CreateLoad", { screen: "CreateLoadHome", params: { sector } }) },
    { label: t("findLoads"), icon: "search-outline", onPress: () => navigation.navigate("FindLoads", { screen: "FindLoadsHome", params: { scope } }) },
    { label: t("shareVehicle"), icon: "bus-outline", onPress: () => navigation.navigate("VehicleMarketplace", { screen: "CreateVehicle", params: { sector } }) },
    { label: t("findVehicle"), icon: "navigate-outline", onPress: () => navigation.navigate("VehicleMarketplace", { screen: "VehicleSearch", params: { scope } }) },
    { label: t("findDriver"), icon: "person-outline", onPress: () => navigation.navigate("DriverMarketplace", { screen: "DriverSearch", params: { scope } }) },
    { label: t("postDriverListing"), icon: "person-add-outline", onPress: () => navigation.navigate("DriverMarketplace", { screen: "CreateDriver", params: { sector } }) },
    { label: t("myListings"), icon: "clipboard-outline", onPress: () => navigation.navigate("MyListings", { screen: "MyListingsHome", params: { scope } }) },
  ];

  return <Screen style={styles.screen}><FlatList
    contentContainerStyle={styles.content}
    data={liveListings.filter((listing) => matchesMarketplaceFilters(listing, filters))}
    initialNumToRender={6}
    ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
    keyboardDismissMode="on-drag"
    keyboardShouldPersistTaps="handled"
    keyExtractor={(item) => `${item.kind}:${item.id}`}
    ListHeaderComponent={<View style={styles.header}>
    <View style={styles.headingRow}>
      <View style={[styles.sectorIcon, { backgroundColor: theme.badge }]}>{route.name === "HeavyHaul" ? <LowbedIcon size={28} color={theme.primary} /> : <Ionicons name={config.icon} size={28} color={theme.primary} />}</View>
      <View style={styles.flex}><Text style={[styles.title, { color: theme.text }]}>{title}</Text><Text style={[styles.description, { color: theme.muted }]}>{description}</Text></View>
    </View>

    <Pressable accessibilityRole="button" onPress={() => navigation.navigate("DemandRequests", { screen: "DemandRequestsHome", params: { sector, scope } })} style={[styles.demand, { backgroundColor: theme.primary }]}>
      <Ionicons name="notifications-outline" size={28} color={theme.primaryText} /><View style={styles.flex}><Text style={[styles.demandTitle, { color: theme.primaryText }]}>{t("createDemandRequest")}</Text><Text style={[styles.demandText, { color: theme.primaryText }]}>{t("createDemandRequestDashboardDescription")}</Text></View><Ionicons name="arrow-forward-circle-outline" size={28} color={theme.primaryText} />
    </Pressable>

    <SurfaceCard style={styles.card}><Text style={[styles.sectionTitle, { color: theme.text }]}>{t("whatAreYouLookingFor")}</Text>
      <View style={styles.chips}>{(["LOAD", "VEHICLE", "DRIVER"] as const).map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: target === item }} onPress={() => setTarget(item)} style={[styles.chip, { backgroundColor: target === item ? theme.primary : theme.cardMuted, borderColor: target === item ? theme.primary : theme.border }]}><Text style={{ color: target === item ? theme.primaryText : theme.text, fontWeight: "900" }}>{item === "LOAD" ? t("load") : item === "VEHICLE" ? t("vehicle") : t("driver")}</Text></Pressable>)}</View>
      <View style={[styles.search, { backgroundColor: theme.input, borderColor: theme.border }]}><Ionicons name="search-outline" size={21} color={theme.iconMuted} /><TextInput value={query} onChangeText={setQuery} onSubmitEditing={runSearch} placeholder={t("marketplaceSearch")} placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text }]} /><Pressable accessibilityRole="button" accessibilityLabel={t("search")} onPress={runSearch} style={[styles.searchButton, { backgroundColor: theme.primary }]}><Ionicons name="arrow-forward" size={20} color={theme.primaryText} /></Pressable></View>
    </SurfaceCard>

    <View style={styles.section}><Text style={[styles.sectionTitle, { color: theme.text }]}>{t("quickActions")}</Text><View style={styles.actionGrid}>{actions.map((action) => <Pressable key={action.label} accessibilityRole="button" onPress={action.onPress} style={[styles.action, { backgroundColor: theme.card, borderColor: theme.border }]}><Ionicons name={action.icon} size={22} color={theme.primary} /><Text style={[styles.actionLabel, { color: theme.text }]}>{action.label}</Text></Pressable>)}</View></View>

    <View style={styles.section}><Text style={[styles.sectionTitle, { color: theme.text }]}>{t("liveListings")}</Text><CatalogFilters value={filters} onApply={(value) => { setLiveListings([]); setFilters(value); }} />{liveLoadFailed ? <ErrorState title={t("liveListings")} onRetry={() => void refreshLive(true)} /> : null}</View>
    </View>}
    ListEmptyComponent={liveLoadFailed ? null : <Text style={[styles.empty, { color: theme.muted }]}>{t("noLiveListings")}</Text>}
    ListFooterComponent={<View style={styles.footer}>

    <View style={styles.section}><Text style={[styles.sectionTitle, { color: theme.text }]}>{t("recentMatches")}</Text>{recentMatches.length ? recentMatches.map((match) => <Pressable key={match.id} accessibilityRole="button" onPress={() => openListing({ kind: match.listingKind, id: match.listingId })} style={[styles.listing, styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}><Text style={[styles.score, { color: theme.primary }]}>%{match.score}</Text><Text style={[styles.listingTitle, styles.flex, { color: theme.text }]}>{match.listing.title}</Text><Ionicons name="chevron-forward" size={18} color={theme.iconMuted} /></Pressable>) : <Text style={[styles.empty, { color: theme.muted }]}>{t("noRecentMatches")}</Text>}</View>
    </View>}
    maxToRenderPerBatch={8}
    onRefresh={() => void refreshLive(true)}
    refreshing={false}
    removeClippedSubviews={Platform.OS === "android"}
    renderItem={renderLiveListing}
    showsVerticalScrollIndicator={false}
    updateCellsBatchingPeriod={50}
    windowSize={7}
  /></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingTop: 0 }, content: { padding: 18, paddingBottom: 110 }, header: { gap: 22, marginBottom: 12 }, footer: { marginTop: 22 }, listSeparator: { height: 12 }, headingRow: { alignItems: "flex-start", flexDirection: "row", gap: 12 }, sectorIcon: { alignItems: "center", borderRadius: 17, height: 56, justifyContent: "center", width: 56 }, flex: { flex: 1 }, title: { fontSize: 25, fontWeight: "900", lineHeight: 31 }, description: { fontSize: 13, lineHeight: 19, marginTop: 4 }, beta: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 }, betaText: { fontSize: 10, fontWeight: "900" }, demand: { alignItems: "center", borderRadius: 22, flexDirection: "row", gap: 12, minHeight: 105, padding: 17 }, demandTitle: { fontSize: 19, fontWeight: "900" }, demandText: { fontSize: 12, lineHeight: 18, marginTop: 4, opacity: 0.9 }, card: { gap: 14 }, section: { gap: 12 }, sectionTitle: { fontSize: 20, fontWeight: "900" }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { borderRadius: 999, borderWidth: 1, justifyContent: "center", minHeight: 41, paddingHorizontal: 15 }, search: { alignItems: "center", borderRadius: 16, borderWidth: 1, flexDirection: "row", minHeight: 56, paddingLeft: 14, paddingRight: 6 }, input: { flex: 1, minHeight: 54, paddingHorizontal: 10 }, searchButton: { alignItems: "center", borderRadius: 13, height: 44, justifyContent: "center", width: 44 }, actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, action: { alignItems: "center", borderRadius: 15, borderWidth: 1, flexBasis: "47%", flexDirection: "row", flexGrow: 1, gap: 9, minHeight: 54, padding: 12 }, actionLabel: { flex: 1, fontSize: 13, fontWeight: "800" }, listing: { borderRadius: 17, borderWidth: 1, gap: 6, padding: 14 }, row: { alignItems: "center", flexDirection: "row", gap: 10 }, listingTitle: { flex: 1, fontSize: 14, fontWeight: "900" }, time: { fontSize: 10, fontWeight: "700" }, source: { fontSize: 10, fontWeight: "700" }, details: { fontSize: 11, fontWeight: "900" }, score: { fontSize: 14, fontWeight: "900" }, empty: { fontSize: 13, paddingVertical: 12, textAlign: "center" },
});
