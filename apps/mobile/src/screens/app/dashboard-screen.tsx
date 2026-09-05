import { Ionicons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useHeaderHeight } from "@react-navigation/elements";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AppState,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getLiveMarketplaceEvents, getMarketplaceDemandMatches, getMarketplaceDemandRequests, type LiveMarketplaceListing, type MarketplaceDemandMatch } from "@/api/mobileFreight";

import { LiveMarketplaceListingCard } from "@/components/live-marketplace-listing-card";
import { CatalogFilters, emptyMarketplaceFilters, matchesMarketplaceFilters, type MarketplaceFilters } from "@/features/freight/catalog-filters";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { Screen } from "@/components/screen";
import { StatCard, SurfaceCard } from "@/components/ui";
import { useDashboardStore } from "@/features/dashboard/dashboardStore";
import { useFreightAccessEnabled } from "@/features/freight/freightAccessStore";
import { formatNumber } from "@/i18n/format";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { AppTabParamList } from "@/types/navigation";

type Props = BottomTabScreenProps<AppTabParamList, "Dashboard">;
type SearchTarget = "LOAD" | "VEHICLE" | "DRIVER";

export function DashboardScreen(props: Props) {
  const freightEnabled = useFreightAccessEnabled();
  return freightEnabled ? (
    <MarketplaceDashboard {...props} />
  ) : (
    <LegacyDashboard />
  );
}

function MarketplaceDashboard({ navigation }: Props) {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<SearchTarget>("LOAD");
  const [liveListings, setLiveListings] = useState<LiveMarketplaceListing[]>([]);
  const [filters, setFilters] = useState<MarketplaceFilters>({ ...emptyMarketplaceFilters });
  const liveGeneration = useRef(0);
  const [liveLoadFailed, setLiveLoadFailed] = useState(false);
  const [recentMatches, setRecentMatches] = useState<MarketplaceDemandMatch[]>([]);
  const liveCursor = useRef<string | undefined>(undefined);
  const liveRefreshInFlight = useRef(false);
  const headerHeight = useHeaderHeight();
  const listRef = useRef<FlatList<LiveMarketplaceListing>>(null);
  const searchInputRef = useRef<TextInput>(null);
  const searchCardY = useRef(0);

  const revealSearch = useCallback(() => {
    if (!searchInputRef.current?.isFocused()) return;
    listRef.current?.scrollToOffset({ offset: Math.max(0, searchCardY.current - 12), animated: true });
  }, []);

  useEffect(() => {
    // Repeat after IME layout: onFocus alone runs before Android resizes the viewport.
    const subscription = Keyboard.addListener("keyboardDidShow", revealSearch);
    return () => subscription.remove();
  }, [revealSearch]);

  const refreshLive = useCallback(async (replaceSnapshot = false) => {
    if (liveRefreshInFlight.current && !replaceSnapshot) return;
    liveRefreshInFlight.current = true;
    const run = ++liveGeneration.current;
    try {
      const response = await getLiveMarketplaceEvents(replaceSnapshot ? undefined : liveCursor.current, 250, "GLOBAL", filters);
      if (run !== liveGeneration.current) return;
      liveCursor.current = response.cursor;
      setLiveLoadFailed(false);
      if (!replaceSnapshot && response.events.length === 0) return;
      setLiveListings((current) => {
        const baseline = replaceSnapshot ? [] : current;
        const map = new Map(baseline.map((listing) => [`${listing.kind}:${listing.id}`, listing]));
        for (const item of response.events) {
          const key = `${item.listing.kind}:${item.listing.id}`;
          if (item.event === "listing.deleted" || item.event === "listing.expired" || item.listing.status !== "ACTIVE") map.delete(key);
          else map.set(key, item.listing);
        }
        return [...map.values()].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
      });
    } catch {
      if (run === liveGeneration.current) setLiveLoadFailed(true);
    } finally {
      if (run === liveGeneration.current) liveRefreshInFlight.current = false;
    }
  }, [filters]);

  const refreshMatches = useCallback(async () => {
    const requests = await getMarketplaceDemandRequests("ACTIVE").catch(() => null);
    if (!requests) return;
    const pages = await Promise.all(requests.requests.slice(0, 5).map((request) => getMarketplaceDemandMatches(request.id).catch(() => null)));
    setRecentMatches(pages.flatMap((page) => page?.matches ?? []).sort((left, right) => Date.parse(right.matchedAt) - Date.parse(left.matchedAt)).slice(0, 5));
  }, []);

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
    const initialQuery = query.trim();
    const params = initialQuery ? { initialQuery } : undefined;
    if (target === "LOAD") {
      navigation.navigate("FindLoads", { screen: "FindLoadsHome", params });
      return;
    }
    if (target === "VEHICLE") {
      navigation.navigate("VehicleMarketplace", {
        screen: "VehicleSearch",
        params,
      });
      return;
    }
    navigation.navigate("DriverMarketplace", {
      screen: "DriverSearch",
      params,
    });
  }

  const openListing = useCallback((listing: { kind: "LOAD" | "VEHICLE" | "DRIVER"; id: string }) => {
    if (listing.kind === "LOAD") navigation.navigate("FindLoads", { screen: "FreightDetails", params: { listingId: listing.id } });
    else if (listing.kind === "VEHICLE") navigation.navigate("VehicleMarketplace", { screen: "VehicleDetails", params: { listingId: listing.id } });
    else navigation.navigate("DriverMarketplace", { screen: "DriverDetails", params: { listingId: listing.id } });
  }, [navigation]);

  const renderLiveListing = useCallback(({ item }: { item: LiveMarketplaceListing }) => (
    <LiveMarketplaceListingCard listing={item} onPress={() => openListing(item)} />
  ), [openListing]);

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={headerHeight}
        style={styles.keyboardArea}
      >
      <FlatList
        ref={listRef}
        contentContainerStyle={styles.marketplaceContent}
        data={liveListings.filter((listing) => matchesMarketplaceFilters(listing, filters))}
        initialNumToRender={6}
        ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        ListEmptyComponent={liveLoadFailed ? null : <Text style={[styles.emptyText, { color: theme.muted }]}>{t("noLiveListings")}</Text>}
        ListFooterComponent={(
          <View style={styles.marketplaceFooter}>
            <DashboardSection title={t("recentMatches")} description={t("recentMatchesDescription")}>
              {recentMatches.length ? recentMatches.map((match) => (
                <Pressable key={match.id} accessibilityRole="button" onPress={() => openListing({ kind: match.listingKind, id: match.listingId })} style={[styles.matchRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={[styles.matchScore, { backgroundColor: theme.successSoft }]}><Text style={[styles.matchScoreText, { color: theme.success }]}>%{match.score}</Text></View>
                  <View style={styles.actionCopy}><Text style={[styles.matchTitle, { color: theme.text }]}>{match.listing.title}</Text><Text numberOfLines={1} style={[styles.liveDescription, { color: theme.muted }]}>{match.reasons.join(" · ")}</Text></View>
                  <Ionicons name="chevron-forward" size={19} color={theme.iconMuted} />
                </Pressable>
              )) : <Text style={[styles.emptyText, { color: theme.muted }]}>{t("noRecentMatches")}</Text>}
            </DashboardSection>
          </View>
        )}
        ListHeaderComponent={(
          <View style={styles.marketplaceHeader}>
            <View style={styles.intro}>
              <Text style={[styles.eyebrow, { color: theme.primary }]}>{t("logisticsMarketplace")}</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate("DemandRequests", { screen: "DemandRequestsHome" })}
              style={({ pressed }) => [
                styles.demandCta,
                { backgroundColor: theme.primary, borderColor: theme.primary },
                pressed ? styles.pressed : null,
              ]}
            >
              <View style={styles.demandCtaIcon}>
                <Ionicons name="notifications-outline" size={25} color={theme.primaryText} />
              </View>
              <View style={styles.actionCopy}>
                <Text style={[styles.demandCtaTitle, { color: theme.primaryText }]}>{t("createDemandRequest")}</Text>
                <Text style={[styles.demandCtaDescription, { color: theme.primaryText }]}>{t("createDemandRequestDashboardDescription")}</Text>
              </View>
              <Ionicons name="arrow-forward-circle-outline" size={27} color={theme.primaryText} />
            </Pressable>

            <View onLayout={(event) => { searchCardY.current = event.nativeEvent.layout.y; }}>
              <SurfaceCard style={styles.searchCard}>
                <Text style={[styles.searchTitle, { color: theme.text }]}>{t("whatAreYouLookingFor")}</Text>
                <View accessibilityRole="tablist" style={styles.searchTargets}>
                  <SearchTargetChip label={t("load")} active={target === "LOAD"} onPress={() => setTarget("LOAD")} />
                  <SearchTargetChip label={t("vehicle")} active={target === "VEHICLE"} onPress={() => setTarget("VEHICLE")} />
                  <SearchTargetChip label={t("driver")} active={target === "DRIVER"} onPress={() => setTarget("DRIVER")} />
                </View>
                <View style={[styles.searchBox, { backgroundColor: theme.input, borderColor: theme.border }]}>
                  <Ionicons name="search-outline" size={21} color={theme.iconMuted} />
                  <TextInput
                    ref={searchInputRef}
                    accessibilityLabel={t("marketplaceSearch")}
                    autoCapitalize="words"
                    enterKeyHint="search"
                    maxLength={160}
                    onChangeText={setQuery}
                    onFocus={revealSearch}
                    onSubmitEditing={runSearch}
                    placeholder={target === "LOAD" ? t("searchLoadPlaceholder") : target === "VEHICLE" ? t("searchVehiclePlaceholder") : t("searchDriverPlaceholder")}
                    placeholderTextColor={theme.muted}
                    returnKeyType="search"
                    style={[styles.searchInput, { color: theme.text }]}
                    value={query}
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel={t("search")} onPress={runSearch} style={[styles.searchButton, { backgroundColor: theme.primary }]}>
                    <Ionicons name="arrow-forward" size={20} color={theme.primaryText} />
                  </Pressable>
                </View>
                <Text style={[styles.searchHint, { color: theme.muted }]}>{t("marketplaceSearchHint")}</Text>
              </SurfaceCard>
            </View>

            <View style={styles.sectionHeading}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("liveListings")}</Text>
              <Text style={[styles.sectionDescription, { color: theme.muted }]}>{t("liveListingsDescription")}</Text>
            </View>
            <CatalogFilters value={filters} onApply={(value) => { setLiveListings([]); setFilters(value); }} />
            {liveLoadFailed ? <ErrorState title={t("liveListings")} onRetry={() => void refreshLive(true)} /> : null}
          </View>
        )}
        maxToRenderPerBatch={8}
        onRefresh={() => void refreshLive(true)}
        refreshing={false}
        removeClippedSubviews={Platform.OS === "android"}
        renderItem={renderLiveListing}
        showsVerticalScrollIndicator={false}
        updateCellsBatchingPeriod={50}
        windowSize={7}
      />
      </KeyboardAvoidingView>
    </Screen>
  );
}

function DashboardSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const theme = useTheme();
  return <View style={styles.dashboardSection}><View style={styles.sectionHeading}><Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text><Text style={[styles.sectionDescription, { color: theme.muted }]}>{description}</Text></View>{children}</View>;
}

function SearchTargetChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.searchTarget,
        {
          backgroundColor: active ? theme.primary : theme.cardMuted,
          borderColor: active ? theme.primary : theme.border,
        },
      ]}
    >
      <Text
        style={[
          styles.searchTargetText,
          { color: active ? theme.primaryText : theme.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function LegacyDashboard() {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const { data, metrics, loading, refreshing, error, load, refresh } =
    useDashboardStore();

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  if (loading && !data)
    return (
      <Screen>
        <LoadingState label={t("loadingDashboard")} />
      </Screen>
    );
  if (error && !data)
    return (
      <Screen>
        <ErrorState title={t("dashboard")} onRetry={() => void load()} />
      </Screen>
    );
  if (!data)
    return (
      <Screen>
        <EmptyState title={t("emptyDashboard")} />
      </Screen>
    );
  const remainingDays = Math.max(0, data.subscription.remainingDays);
  return (
    <Screen style={styles.screen}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={theme.primary}
          />
        }
        contentContainerStyle={styles.legacyContent}
      >
        <SurfaceCard style={styles.planCard}>
          <Text style={[styles.cardLabel, { color: theme.muted }]}>
            {t("currentPackage")}
          </Text>
          <Text style={[styles.planValue, { color: theme.text }]}>
            {t("daysCount", { count: remainingDays })}
          </Text>
        </SurfaceCard>
        <View style={styles.legacyGrid}>
          <StatCard
            icon="logo-whatsapp"
            label={t("connectedWhatsApp")}
            value={`${formatNumber(data.dashboardMetrics.connectedWhatsAppAccountCount, locale)}/${formatNumber(metrics.accountCount, locale)}`}
            tone="success"
          />
          <StatCard
            icon="people-outline"
            label={t("whatsAppGroupsMetric")}
            value={metrics.groupCount}
            tone="primary"
          />
          {data.dashboardMetrics.showContacts ? (
            <StatCard
              icon="person-outline"
              label={t("contacts")}
              value={metrics.contactCount}
              tone="primary"
            />
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardArea: { flex: 1 },
  screen: { paddingHorizontal: 0, paddingTop: 0 },
  marketplaceContent: { padding: 18, paddingBottom: 110 },
  marketplaceHeader: { gap: 22, marginBottom: 12 },
  marketplaceFooter: { marginTop: 22 },
  listSeparator: { height: 12 },
  intro: { gap: 0 },
  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  searchCard: { gap: 14 },
  searchTitle: { fontSize: 18, fontWeight: "900" },
  searchTargets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  searchTarget: {
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 16,
  },
  searchTargetText: { fontSize: 13, fontWeight: "900" },
  searchBox: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 58,
    paddingLeft: 15,
    paddingRight: 7,
  },
  searchInput: { flex: 1, fontSize: 16, minHeight: 56, paddingHorizontal: 12 },
  searchButton: {
    alignItems: "center",
    borderRadius: 13,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  searchHint: { fontSize: 12, lineHeight: 18 },
  sectionHeading: { gap: 5 },
  sectionTitle: { fontSize: 21, fontWeight: "900" },
  sectionDescription: { fontSize: 14, lineHeight: 20 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  dashboardSection: { gap: 12 },
  liveCard: { borderRadius: 19, borderWidth: 1, gap: 8, padding: 15 },
  liveCardTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  liveBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  liveBadgeText: { fontSize: 10, fontWeight: "900" },
  relativeTime: { fontSize: 11, fontWeight: "700" },
  liveTitle: { fontSize: 17, fontWeight: "900", lineHeight: 22 },
  liveDescription: { fontSize: 12, lineHeight: 18 },
  liveMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  liveMeta: { fontSize: 12, fontWeight: "800" },
  detailLink: { alignItems: "center", alignSelf: "flex-end", flexDirection: "row", gap: 2 },
  detailLinkText: { fontSize: 12, fontWeight: "900" },
  emptyText: { fontSize: 13, paddingVertical: 12, textAlign: "center" },
  matchRow: { alignItems: "center", borderRadius: 17, borderWidth: 1, flexDirection: "row", gap: 11, padding: 13 },
  matchScore: { alignItems: "center", borderRadius: 14, height: 48, justifyContent: "center", width: 48 },
  matchScoreText: { fontSize: 13, fontWeight: "900" },
  matchTitle: { fontSize: 14, fontWeight: "900" },
  demandCta: {
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    minHeight: 112,
    padding: 17,
  },
  demandCtaIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 16,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  demandCtaTitle: { fontSize: 19, fontWeight: "900", lineHeight: 24 },
  demandCtaDescription: { fontSize: 13, lineHeight: 19, opacity: 0.9 },
  actionCard: {
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 106,
    padding: 16,
    width: "100%",
  },
  actionCardHalf: { flexBasis: "48%", flexGrow: 1, minWidth: 235 },
  actionIcon: {
    alignItems: "center",
    borderRadius: 15,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  actionCopy: { flex: 1, gap: 4, minWidth: 0 },
  actionTitle: { fontSize: 17, fontWeight: "900", lineHeight: 22 },
  actionDescription: { fontSize: 13, lineHeight: 18 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  legacyContent: { gap: 14, padding: 18, paddingBottom: 32 },
  planCard: { gap: 8 },
  cardLabel: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.3,
    lineHeight: 16,
  },
  planValue: { fontSize: 30, fontWeight: "900", lineHeight: 36 },
  legacyGrid: { gap: 12 },
});
