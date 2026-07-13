import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useWindowDimensions } from "react-native";

import { MobileAppHeader, WebParityTabBar } from "@/components/web-parity-tab-bar";
import { CategoriesNavigator } from "@/navigation/categories-navigator";
import { ProfileNavigator } from "@/navigation/profile-navigator";
import { SupportNavigator } from "@/navigation/support-navigator";
import { WhatsAppNavigator } from "@/navigation/whatsapp-navigator";
import { DashboardScreen } from "@/screens/app/dashboard-screen";
import { GroupsScreen } from "@/screens/app/groups-screen";
import { MessageHistoryScreen } from "@/screens/app/message-history-screen";
import { MessagingScreen } from "@/screens/app/messaging-screen";
import { MoreScreen } from "@/screens/app/more-screen";
import { colors } from "@/theme/colors";
import { useTranslation } from "@/i18n/use-translation";
import type { AppTabParamList } from "@/types/navigation";

const Tab = createBottomTabNavigator<AppTabParamList>();

export function AppNavigator() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const usePermanentSidebar = width >= 900;

  return (
    <Tab.Navigator
      tabBar={usePermanentSidebar ? (props) => <WebParityTabBar {...props} /> : () => null}
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
          display: usePermanentSidebar ? "flex" : "none",
          width: usePermanentSidebar ? 252 : 0
        }
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: t("dashboard"), tabBarLabel: t("overview") }} />
      <Tab.Screen name="WhatsApp" component={WhatsAppNavigator} options={{ title: t("whatsapp"), tabBarLabel: t("accounts") }} />
      <Tab.Screen name="Groups" component={GroupsScreen} options={{ title: t("groups"), tabBarLabel: t("groups") }} />
      <Tab.Screen name="Messaging" component={MessagingScreen} options={{ title: t("messaging"), tabBarLabel: t("messaging") }} />
      <Tab.Screen name="MessageHistory" component={MessageHistoryScreen} options={{ title: t("messageHistoryTitle"), tabBarLabel: t("history") }} />
      <Tab.Screen name="More" component={MoreScreen} options={{ title: t("more"), tabBarLabel: t("more") }} />
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
  );
}
