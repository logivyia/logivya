import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { ScreenBottomInsetContext } from "@/components/screen-bottom-inset-context";
import { useTranslation } from "@/i18n/use-translation";
import { AdminNotificationOperationsScreen } from "@/screens/app/admin-notification-operations-screen";
import { MoreScreen } from "@/screens/app/more-screen";
import { PlatformModuleScreen } from "@/screens/app/platform-module-screen";
import type { MoreStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<MoreStackParamList>();

function AdminModuleScreen() {
  return <ScreenBottomInsetContext.Provider value={false}><PlatformModuleScreen /></ScreenBottomInsetContext.Provider>;
}

function AdminNotificationsScreen() {
  return <ScreenBottomInsetContext.Provider value={false}><AdminNotificationOperationsScreen /></ScreenBottomInsetContext.Provider>;
}

export function MoreNavigator() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator initialRouteName="AdminSections" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminSections" component={MoreScreen} options={{ title: t("adminSections") }} />
      <Stack.Screen name="PlatformModule" component={AdminModuleScreen} options={({ route }) => ({ title: route.params.title ?? t("module") })} />
      <Stack.Screen name="AdminNotificationOperations" component={AdminNotificationsScreen} options={{ title: t("adminNotificationsModule") }} />
    </Stack.Navigator>
  );
}
