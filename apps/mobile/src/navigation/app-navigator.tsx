import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useEffect } from "react";
import { AppState, useWindowDimensions } from "react-native";

import { useAuthStore } from "@/auth/auth-store";
import { MobileAppHeader, WebParityTabBar } from "@/components/web-parity-tab-bar";
import { MarketplaceBottomTabBar } from "@/components/marketplace-bottom-tab-bar";
import { ScreenBottomInsetContext } from "@/components/screen-bottom-inset-context";
import { useFreightAccessEnabled, useFreightAccessStore } from "@/features/freight/freightAccessStore";
import { useFacebookAccessStore, useFacebookPagesEnabled } from "@/features/facebook/facebookAccessStore";
import { useProductFeatureStore, useProductFeatureVisible } from "@/features/product/productFeatureStore";
import { useTelegramAccessEnabled, useTelegramAccessStore } from "@/features/telegram/telegramAccessStore";
import { CategoriesNavigator } from "@/navigation/categories-navigator";
import { CreateLoadNavigator } from "@/navigation/create-load-navigator";
import { DriverMarketplaceNavigator } from "@/navigation/driver-marketplace-navigator";
import { FindLoadsNavigator } from "@/navigation/find-loads-navigator";
import { MyListingsNavigator } from "@/navigation/my-listings-navigator";
import { ProfileNavigator } from "@/navigation/profile-navigator";
import { SupportNavigator } from "@/navigation/support-navigator";
import { WhatsAppNavigator } from "@/navigation/whatsapp-navigator";
import { VehicleMarketplaceNavigator } from "@/navigation/vehicle-marketplace-navigator";
import { DashboardScreen } from "@/screens/app/dashboard-screen";
import { DemandRequestNavigator } from "@/navigation/demand-request-navigator";
import { GroupsScreen } from "@/screens/app/groups-screen";
import { MessageHistoryScreen } from "@/screens/app/message-history-screen";
import { MessagingScreen } from "@/screens/app/messaging-screen";
import { MoreNavigator } from "@/navigation/more-navigator";
import { TelegramScreen } from "@/screens/app/telegram-screen";
import { FacebookPagesScreen } from "@/screens/app/facebook-pages-screen";
import { SectorMarketplaceScreen } from "@/screens/app/sector-marketplace-screen";
import { colors } from "@/theme/colors";
import { useTranslation } from "@/i18n/use-translation";
import type { AppTabParamList } from "@/types/navigation";

const Tab = createBottomTabNavigator<AppTabParamList>();

export function AppNavigator() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const loadFreightAccess = useFreightAccessStore((state) => state.load);
  const freightEnabled = useFreightAccessEnabled();
  const loadTelegramAccess = useTelegramAccessStore((state) => state.load);
  const telegramEnabled = useTelegramAccessEnabled();
  const loadFacebookAccess = useFacebookAccessStore((state) => state.load);
  const facebookEnabled = useFacebookPagesEnabled();
  const loadProductFeatures = useProductFeatureStore((state) => state.load);
  const homeMovingVisible = useProductFeatureVisible("HOME_MOVING");
  const partialLoadVisible = useProductFeatureVisible("PARTIAL_LOAD");
  const heavyHaulVisible = useProductFeatureVisible("HEAVY_HAUL");
  const usePermanentSidebar = width >= 900;

  useEffect(() => {
    if (!userId) return;
    void loadFreightAccess(userId, true);
    void loadTelegramAccess(userId, true);
    void loadFacebookAccess(userId, true);
    void loadProductFeatures(true);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void loadFreightAccess(userId, true);
      if (state === "active") void loadTelegramAccess(userId, true);
      if (state === "active") void loadFacebookAccess(userId, true);
      if (state === "active") void loadProductFeatures(true);
    });
    return () => subscription.remove();
  }, [loadFacebookAccess, loadFreightAccess, loadProductFeatures, loadTelegramAccess, userId]);

  return (
    <ScreenBottomInsetContext.Provider value={!usePermanentSidebar && freightEnabled}>
    <Tab.Navigator
      backBehavior="fullHistory"
      tabBar={usePermanentSidebar
        ? (props) => <WebParityTabBar {...props} />
        : freightEnabled
          ? (props) => <MarketplaceBottomTabBar {...props} />
          : () => null}
      screenOptions={{
        headerShown: !usePermanentSidebar,
        ...(usePermanentSidebar ? {} : { header: (props) => <MobileAppHeader {...props} /> }),
        tabBarPosition: usePermanentSidebar ? "left" : "bottom",
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.orange,
        tabBarInactiveTintColor: colors.slate,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "800"
        },
        tabBarItemStyle: {
          paddingVertical: 4
        },
        tabBarStyle: {
          backgroundColor: colors.navySoft,
          borderTopColor: colors.borderDark,
          display: "flex",
          width: usePermanentSidebar ? 252 : undefined
        }
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: t("dashboard"), tabBarLabel: t("overview") }} />
      {freightEnabled && homeMovingVisible ? <Tab.Screen name="HomeMoving" component={SectorMarketplaceScreen} options={{ title: t("homeMovingMarketplace") }} /> : null}
      {freightEnabled && partialLoadVisible ? <Tab.Screen name="PartialLoad" component={SectorMarketplaceScreen} options={{ title: t("partialLoadMarketplace") }} /> : null}
      {freightEnabled && heavyHaulVisible ? <Tab.Screen name="HeavyHaul" component={SectorMarketplaceScreen} options={{ title: t("heavyHaulMarketplace") }} /> : null}
      {freightEnabled ? <Tab.Screen name="CreateLoad" component={CreateLoadNavigator} options={{ title: t("createLoad"), tabBarLabel: t("createLoad") }} /> : null}
      {freightEnabled ? <Tab.Screen name="FindLoads" component={FindLoadsNavigator} options={{ title: t("findLoads"), tabBarLabel: t("findLoads") }} /> : null}
      {freightEnabled ? <Tab.Screen name="VehicleMarketplace" component={VehicleMarketplaceNavigator} options={{ title: t("vehicleMarketplace"), tabBarLabel: t("vehicleMarketplace") }} /> : null}
      {freightEnabled ? <Tab.Screen name="DriverMarketplace" component={DriverMarketplaceNavigator} options={{ title: t("driverMarketplace"), tabBarLabel: t("driverMarketplace") }} /> : null}
      {freightEnabled ? <Tab.Screen name="MyListings" component={MyListingsNavigator} options={{ title: t("myListings"), tabBarLabel: t("myListings") }} /> : null}
      {freightEnabled ? <Tab.Screen name="DemandRequests" component={DemandRequestNavigator} options={{ title: t("demandCenter"), tabBarLabel: t("demandCenter") }} /> : null}
      <Tab.Screen name="WhatsApp" component={WhatsAppNavigator} options={{ title: t("whatsappAccounts"), tabBarLabel: t("whatsappAccounts") }} />
      {telegramEnabled ? <Tab.Screen name="Telegram" component={TelegramScreen} options={{ title: t("telegramAccounts"), tabBarLabel: t("telegramAccounts") }} /> : null}
      {facebookEnabled ? <Tab.Screen name="FacebookPages" component={FacebookPagesScreen} options={{ title: t("facebookPages"), tabBarLabel: t("facebookPages") }} /> : null}
      <Tab.Screen name="Groups" component={GroupsScreen} options={{ title: t("groups"), tabBarLabel: t("groups") }} />
      <Tab.Screen name="Messaging" component={MessagingScreen} options={{ title: t("messaging"), tabBarLabel: t("messaging") }} />
      <Tab.Screen name="MessageHistory" component={MessageHistoryScreen} options={{ title: t("messageHistoryTitle"), tabBarLabel: t("history") }} />
      <Tab.Screen name="More" component={MoreNavigator} options={{ title: t("more"), tabBarLabel: t("more") }} />
      <Tab.Screen name="Categories" component={CategoriesNavigator} options={{ title: t("categories"), tabBarLabel: t("categories") }} />
      <Tab.Screen name="Support" component={SupportNavigator} options={{ title: t("support"), tabBarLabel: t("support") }} />
      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{
          title: t("profile"),
          tabBarButton: () => null,
          tabBarItemStyle: { display: "none" }
        }}
      />
    </Tab.Navigator>
    </ScreenBottomInsetContext.Provider>
  );
}
