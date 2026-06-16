import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import { DashboardScreen } from "@/screens/app/dashboard-screen";
import { GroupsScreen } from "@/screens/app/groups-screen";
import { MessagingScreen } from "@/screens/app/messaging-screen";
import { CategoriesNavigator } from "@/navigation/categories-navigator";
import { ProfileNavigator } from "@/navigation/profile-navigator";
import { SupportNavigator } from "@/navigation/support-navigator";
import { WhatsAppNavigator } from "@/navigation/whatsapp-navigator";
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
      <Tab.Screen name="WhatsApp" component={WhatsAppNavigator} options={{ title: t("whatsapp"), headerShown: false }} />
      <Tab.Screen name="Groups" component={GroupsScreen} options={{ title: t("groups") }} />
      <Tab.Screen name="Categories" component={CategoriesNavigator} options={{ title: t("categories"), headerShown: false }} />
      <Tab.Screen name="Messaging" component={MessagingScreen} options={{ title: t("messaging") }} />
      <Tab.Screen name="Support" component={SupportNavigator} options={{ title: t("support"), headerShown: false }} />
      <Tab.Screen name="Profile" component={ProfileNavigator} options={{ title: t("profile"), headerShown: false }} />
    </Tab.Navigator>
  );
}
