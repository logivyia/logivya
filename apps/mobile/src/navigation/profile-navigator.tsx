import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { CompanySettingsScreen } from "@/screens/app/company-settings-screen";
import { FeedbackScreen } from "@/screens/app/feedback-screen";
import { NotificationsScreen } from "@/screens/app/notifications-screen";
import { ProfileScreen } from "@/screens/app/profile-screen";
import { SettingsScreen } from "@/screens/app/settings-screen";
import { SubscriptionScreen } from "@/screens/app/subscription-screen";
import { useTranslation } from "@/i18n/use-translation";
import type { ProfileStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileNavigator() {
  const { t } = useTranslation();

  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen name="ProfileHome" component={ProfileScreen} options={{ title: t("profile") }} />
      <Stack.Screen name="CompanySettings" component={CompanySettingsScreen} options={{ title: t("companySettings") }} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{ title: t("subscription") }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: t("notifications") }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: t("feedback") }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t("settings") }} />
    </Stack.Navigator>
  );
}
