import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { AppState, Keyboard, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getMyDriverListings, getMyFreightListings, getMyVehicleListings } from "@/api/mobileFreight";
import { useTranslation } from "@/i18n/use-translation";
import type { TranslationKey } from "@/i18n/translations";
import { useTheme } from "@/theme/theme-provider";

type IconName = ComponentProps<typeof Ionicons>["name"];
type MarketplaceRoute = "CreateLoad" | "FindLoads" | "MyListings" | "VehicleMarketplace" | "DriverMarketplace";

const items: Array<{ route: MarketplaceRoute; labelKey: TranslationKey; icon: IconName }> = [
  { route: "CreateLoad", labelKey: "createLoad", icon: "add-circle-outline" },
  { route: "FindLoads", labelKey: "findLoads", icon: "search-outline" },
  { route: "MyListings", labelKey: "myListings", icon: "clipboard-outline" },
  { route: "VehicleMarketplace", labelKey: "findAndShareVehicle", icon: "bus-outline" },
  { route: "DriverMarketplace", labelKey: "findDriver", icon: "person-outline" },
];

export function MarketplaceBottomTabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [activeListingCount, setActiveListingCount] = useState(0);
  const activeRoute = state.routes[state.index]?.name;

  const refreshCount = useCallback(async () => {
    const pages = await Promise.all([
      getMyFreightListings("ACTIVE", null, 50),
      getMyVehicleListings("ACTIVE", null, 50),
      getMyDriverListings("ACTIVE", null, 50),
    ]).catch(() => null);
    if (pages) setActiveListingCount(pages.reduce((total, page) => total + page.listings.length, 0));
  }, []);

  useEffect(() => {
    void refreshCount();
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardVisible(false));
    const app = AppState.addEventListener("change", (next) => { if (next === "active") void refreshCount(); });
    return () => { show.remove(); hide.remove(); app.remove(); };
  }, [refreshCount]);

  const currentRoute = state.routes[state.index];
  const adminSectionOpen = activeRoute === "More" && currentRoute &&
    (getFocusedRouteNameFromRoute(currentRoute) ?? "AdminSections") !== "AdminSections";
  if (keyboardVisible || activeRoute === "Profile" || adminSectionOpen) return null;
  return (
    <View accessibilityRole="tablist" style={[styles.container, { backgroundColor: theme.card, borderColor: theme.border, paddingBottom: Math.max(insets.bottom, 7) }]}>
      {items.map((item, index) => {
        const active = activeRoute === item.route;
        const center = index === 2;
        return (
          <Pressable
            key={item.route}
            accessibilityRole="tab"
            accessibilityLabel={center && activeListingCount > 0
              ? `${t(item.labelKey)}, ${activeListingCount > 99 ? "99+" : activeListingCount} ${t("freightStatusActive")}`
              : t(item.labelKey)}
            accessibilityState={{ selected: active }}
            onPress={() => navigation.navigate(item.route)}
            style={[styles.item, center ? styles.centerItem : null]}
          >
            <View style={[
              styles.iconWrap,
              center ? styles.centerIconWrap : null,
              {
                backgroundColor: center ? theme.primary : active ? theme.badge : "transparent",
                borderColor: center ? theme.primary : "transparent",
              },
            ]}>
              <Ionicons
                name={center && active ? "clipboard" : item.icon}
                size={center ? 26 : 23}
                color={center ? theme.primaryText : active ? theme.primary : theme.iconMuted}
              />
              {center && activeListingCount > 0 ? (
                <View style={[styles.badge, { backgroundColor: theme.danger, borderColor: theme.card }]}>
                  <Text style={styles.badgeText}>{activeListingCount > 99 ? "99+" : activeListingCount}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, { color: center || active ? theme.primary : theme.muted }]}>{t(item.labelKey)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-end",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 70,
    paddingHorizontal: 4,
    paddingTop: 7,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 14,
  },
  item: { alignItems: "center", flex: 1, gap: 3, justifyContent: "flex-end", minWidth: 0 },
  centerItem: { marginTop: 0 },
  iconWrap: { alignItems: "center", borderRadius: 18, height: 38, justifyContent: "center", width: 44 },
  centerIconWrap: { borderRadius: 25, borderWidth: 3, height: 50, width: 50 },
  label: { alignSelf: "stretch", fontSize: 10, fontWeight: "800", minHeight: 28, paddingHorizontal: 2, textAlign: "center" },
  badge: { alignItems: "center", borderRadius: 10, borderWidth: 2, justifyContent: "center", minHeight: 19, minWidth: 19, paddingHorizontal: 4, position: "absolute", right: -7, top: -7 },
  badgeText: { color: "white", fontSize: 9, fontWeight: "900" },
});
