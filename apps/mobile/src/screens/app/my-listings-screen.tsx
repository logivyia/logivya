import { useFocusEffect, type NavigationProp } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  getMyDriverListings,
  getMyFreightListings,
  getMyVehicleListings,
  updateDriverListingStatus,
  updateFreightListingStatus,
  updateVehicleListingStatus,
  type FreightListingStatus,
  type LogisticsSector,
  type MobileDriverListing,
  type MobileFreightListing,
  type MobileVehicleListing,
} from "@/api/mobileFreight";
import { FreightListingCard } from "@/components/freight-listing-card";
import {
  DriverListingCard,
  VehicleListingCard,
} from "@/components/marketplace-listing-card";
import { Screen } from "@/components/screen";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { Chip, PageHeader } from "@/components/ui";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type {
  AppTabParamList,
  MyListingsStackParamList,
} from "@/types/navigation";

type Props = NativeStackScreenProps<MyListingsStackParamList, "MyListingsHome">;
type ListingKind = "LOAD" | "VEHICLE" | "DRIVER";
type Listing =
  MobileFreightListing | MobileVehicleListing | MobileDriverListing;
const statuses: FreightListingStatus[] = ["ACTIVE", "COMPLETED", "INACTIVE", "EXPIRED"];
const sectors: Array<LogisticsSector | undefined> = [
  undefined,
  "GENERAL_LOGISTICS",
  "HOME_MOVING",
  "PARTIAL_LOAD",
  "HEAVY_HAUL",
];

export function MyListingsScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [kind, setKind] = useState<ListingKind>("LOAD");
  const [status, setStatus] = useState<FreightListingStatus>("ACTIVE");
  const [sector, setSector] = useState<LogisticsSector | undefined>();
  const [listings, setListings] = useState<Listing[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    async (
      targetKind: ListingKind,
      targetStatus: FreightListingStatus,
      targetSector: LogisticsSector | undefined,
      cursor: string | null,
      mode: "replace" | "refresh" | "append" = "replace",
    ) => {
      if (mode === "append") setLoadingMore(true);
      else if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const response =
          targetKind === "LOAD"
            ? await getMyFreightListings(targetStatus, cursor, 20, route.params?.scope, targetSector)
            : targetKind === "VEHICLE"
              ? await getMyVehicleListings(targetStatus, cursor, 20, route.params?.scope, targetSector)
              : await getMyDriverListings(targetStatus, cursor, 20, route.params?.scope, targetSector);
        setListings((current) =>
          mode === "append"
            ? [...current, ...response.listings]
            : response.listings,
        );
        setNextCursor(response.pageInfo.nextCursor);
        setHasMore(response.pageInfo.hasMore);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : t("freightMyListingsFailed"),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [route.params?.scope, t],
  );
  useFocusEffect(
    useCallback(() => {
      void load(kind, status, sector, null);
    }, [kind, load, sector, status]),
  );
  function changeKind(next: ListingKind) {
    if (next === kind) return;
    setKind(next);
    resetList();
  }
  function changeStatus(next: FreightListingStatus) {
    if (next === status) return;
    setStatus(next);
    resetList();
  }
  function changeSector(next: LogisticsSector | undefined) {
    if (next === sector) return;
    setSector(next);
    resetList();
  }
  function resetList() {
    setListings([]);
    setNextCursor(null);
    setHasMore(false);
  }
  function confirmTransition(
    listing: Listing,
    nextStatus: FreightListingStatus,
  ) {
    const title =
      nextStatus === "COMPLETED"
        ? t("markCompleted")
        : nextStatus === "INACTIVE"
          ? t("deactivate")
          : t("reactivate");
    Alert.alert(title, t("freightStatusConfirmation"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("confirm"),
        style: nextStatus === "INACTIVE" ? "destructive" : "default",
        onPress: () => void transition(listing, nextStatus),
      },
    ]);
  }
  async function transition(
    listing: Listing,
    nextStatus: FreightListingStatus,
  ) {
    setWorkingId(listing.id);
    setError(null);
    try {
      if (kind === "LOAD")
        await updateFreightListingStatus(listing.id, nextStatus);
      else if (kind === "VEHICLE")
        await updateVehicleListingStatus(listing.id, nextStatus);
      else await updateDriverListingStatus(listing.id, nextStatus);
      setListings((current) =>
        current.filter((item) => item.id !== listing.id),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("freightStatusUpdateFailed"),
      );
    } finally {
      setWorkingId(null);
    }
  }
  const parent = navigation.getParent<NavigationProp<AppTabParamList>>();
  function open(listing: Listing) {
    if (kind === "LOAD")
      navigation.navigate("OwnedFreightDetails", { listingId: listing.id });
    else if (kind === "VEHICLE")
      parent?.navigate("VehicleMarketplace", {
        screen: "VehicleDetails",
        params: { listingId: listing.id },
      });
    else
      parent?.navigate("DriverMarketplace", {
        screen: "DriverDetails",
        params: { listingId: listing.id },
      });
  }
  function edit(listing: Listing) {
    if (kind === "LOAD")
      navigation.navigate("EditFreightListing", { listingId: listing.id });
    else if (kind === "VEHICLE")
      parent?.navigate("VehicleMarketplace", {
        screen: "EditVehicle",
        params: { listingId: listing.id },
      });
    else
      parent?.navigate("DriverMarketplace", {
        screen: "EditDriver",
        params: { listingId: listing.id },
      });
  }
  function actions(listing: Listing) {
    return listing.status === "COMPLETED" || listing.status === "EXPIRED" ? undefined : (
      <>
        <Action
          label={t("edit")}
          disabled={workingId === listing.id}
          onPress={() => edit(listing)}
        />
        {listing.status === "ACTIVE" ? (
          <Action
            label={t("markCompleted")}
            disabled={workingId === listing.id}
            onPress={() => confirmTransition(listing, "COMPLETED")}
          />
        ) : null}
        {listing.status === "ACTIVE" ? (
          <Action
            label={t("deactivate")}
            danger
            disabled={workingId === listing.id}
            onPress={() => confirmTransition(listing, "INACTIVE")}
          />
        ) : null}
        {listing.status === "INACTIVE" ? (
          <Action
            label={t("reactivate")}
            disabled={workingId === listing.id}
            onPress={() => confirmTransition(listing, "ACTIVE")}
          />
        ) : null}
      </>
    );
  }
  const header = (
    <View style={styles.header}>
      <PageHeader
        eyebrow={t("logisticsMarketplace")}
        title={t("myListings")}
        description={t("myListingsUnifiedDescription")}
      />
      <View>
        <Text style={[styles.tabLabel, { color: theme.muted }]}>
          {t("sectorFilter")}
        </Text>
        <View style={styles.tabs}>
          {sectors.map((item) => (
            <Chip
              key={item ?? "ALL"}
              label={
                item === undefined
                  ? t("all")
                  : item === "GENERAL_LOGISTICS"
                    ? t("generalLogistics")
                    : item === "HOME_MOVING"
                      ? t("homeMovingMarketplace")
                      : item === "PARTIAL_LOAD"
                        ? t("partialLoadMarketplace")
                        : t("heavyHaulMarketplace")
              }
              active={sector === item}
              onPress={() => changeSector(item)}
            />
          ))}
        </View>
      </View>
      <View>
        <Text style={[styles.tabLabel, { color: theme.muted }]}>
          {t("listingType")}
        </Text>
        <View style={styles.tabs}>
          <Chip
            label={t("load")}
            active={kind === "LOAD"}
            onPress={() => changeKind("LOAD")}
          />
          <Chip
            label={t("vehicle")}
            active={kind === "VEHICLE"}
            onPress={() => changeKind("VEHICLE")}
          />
          <Chip
            label={t("driver")}
            active={kind === "DRIVER"}
            onPress={() => changeKind("DRIVER")}
          />
        </View>
      </View>
      <View>
        <Text style={[styles.tabLabel, { color: theme.muted }]}>
          {t("status")}
        </Text>
        <View style={styles.tabs}>
          {statuses.map((item) => (
            <Chip
              key={item}
              label={
                item === "ACTIVE"
                  ? t("freightStatusActive")
                  : item === "COMPLETED"
                    ? t("freightStatusCompleted")
                    : item === "EXPIRED"
                      ? t("freightStatusExpired")
                      : t("freightStatusInactive")
              }
              active={status === item}
              onPress={() => changeStatus(item)}
            />
          ))}
        </View>
      </View>
      {error && listings.length ? (
        <Text
          style={[
            styles.inlineError,
            { backgroundColor: theme.dangerSoft, color: theme.danger },
          ]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
  if (loading)
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={{ color: theme.muted }}>
            {t("freightLoadingListings")}
          </Text>
        </View>
      </Screen>
    );
  if (error && !listings.length)
    return (
      <Screen>
        <ErrorState
          title={error}
          onRetry={() => void load(kind, status, sector, null)}
        />
      </Screen>
    );
  return (
    <Screen style={styles.screen}>
      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) =>
          kind === "LOAD" ? (
            <FreightListingCard
              listing={item as MobileFreightListing}
              onPress={() => open(item)}
              actions={actions(item)}
            />
          ) : kind === "VEHICLE" ? (
            <VehicleListingCard
              listing={item as MobileVehicleListing}
              onPress={() => open(item)}
              actions={actions(item)}
            />
          ) : (
            <DriverListingCard
              listing={item as MobileDriverListing}
              onPress={() => open(item)}
              actions={actions(item)}
            />
          )
        }
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            title={t("noListingsInThisSection")}
            description={t("noListingsInThisSectionDescription")}
          />
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator
              color={theme.primary}
              style={styles.footerLoader}
            />
          ) : null
        }
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(kind, status, sector, null, "refresh")}
            tintColor={theme.primary}
          />
        }
        onEndReached={() => {
          if (hasMore && nextCursor && !loadingMore)
            void load(kind, status, sector, nextCursor, "append");
        }}
        onEndReachedThreshold={0.35}
      />
    </Screen>
  );
}

function Action({
  label,
  onPress,
  disabled,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.action,
        {
          borderColor: danger ? theme.danger : theme.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: danger ? theme.danger : theme.text,
          fontSize: 12,
          fontWeight: "900",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingTop: 0 },
  list: { gap: 14, padding: 18, paddingBottom: 44 },
  header: { gap: 16 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 2, marginTop: 7 },
  tabLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  inlineError: {
    borderRadius: 14,
    fontSize: 13,
    fontWeight: "800",
    padding: 12,
  },
  center: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center" },
  action: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 12,
  },
  footerLoader: { marginVertical: 18 },
});
