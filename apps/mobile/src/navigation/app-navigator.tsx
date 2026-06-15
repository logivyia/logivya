import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import { CategoriesScreen } from "@/screens/app/categories-screen";
import { DashboardScreen } from "@/screens/app/dashboard-screen";
import { GroupsScreen } from "@/screens/app/groups-screen";
import { MessagingScreen } from "@/screens/app/messaging-screen";
import { ProfileScreen } from "@/screens/app/profile-screen";
import { SupportScreen } from "@/screens/app/support-screen";
import { WhatsAppScreen } from "@/screens/app/whatsapp-screen";
import { useTranslation } from "@/i18n/use-translation";
import type { AppTabParamList } from "@/types/navigation";

const Tab = createBottomTabNavigator<AppTabParamList>();

export function AppNavigator() {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarHideOnKeyboard: true
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: t("dashboard") }} />
      <Tab.Screen name="WhatsApp" component={WhatsAppScreen} options={{ title: t("whatsapp") }} />
      <Tab.Screen name="Groups" component={GroupsScreen} options={{ title: t("groups") }} />
      <Tab.Screen name="Categories" component={CategoriesScreen} options={{ title: t("categories") }} />
      <Tab.Screen name="Messaging" component={MessagingScreen} options={{ title: t("messaging") }} />
      <Tab.Screen name="Support" component={SupportScreen} options={{ title: t("support") }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: t("profile") }} />
    </Tab.Navigator>
  );
}
