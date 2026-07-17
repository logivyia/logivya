import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { AccountDeletionScreen } from "@/screens/app/account-deletion-screen";
import { AdminNotificationOperationsScreen } from "@/screens/app/admin-notification-operations-screen";
import { CompanySettingsScreen } from "@/screens/app/company-settings-screen";
import { FeedbackScreen } from "@/screens/app/feedback-screen";
import { NotificationsScreen } from "@/screens/app/notifications-screen";
import { NotificationPreferencesScreen } from "@/screens/app/notification-preferences-screen";
import { NotificationPermissionEducationScreen } from "@/screens/app/notification-permission-education-screen";
import { PlatformModuleScreen } from "@/screens/app/platform-module-screen";
import { ProfileScreen } from "@/screens/app/profile-screen";
import { SettingsScreen } from "@/screens/app/settings-screen";
import { SecurityScreen } from "@/screens/app/security-screen";
import { PrivacyDataScreen } from "@/screens/app/privacy-data-screen";
import { SubscriptionScreen } from "@/screens/app/subscription-screen";
import { TeamUsersScreen } from "@/screens/app/team-users-screen";
import { useTranslation } from "@/i18n/use-translation";
import type { ProfileStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileNavigator() {
  const { t } = useTranslation();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileHome" component={ProfileScreen} options={{ title: t("profile") }} />
      <Stack.Screen name="CompanySettings" component={CompanySettingsScreen} options={{ title: t("companySettings") }} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{ title: t("subscription") }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: t("notifications") }} />
      <Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} options={{ title: t("notificationPreferences") }} />
      <Stack.Screen name="NotificationPermissionEducation" component={NotificationPermissionEducationScreen} options={{ title: t("notificationPermissionTitle") }} />
      <Stack.Screen name="Feedback" component={FeedbackScreen} options={{ title: t("feedback") }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t("settings") }} />
      <Stack.Screen name="Security" component={SecurityScreen} options={{ title: t("security") }} />
      <Stack.Screen name="PrivacyData" component={PrivacyDataScreen} options={{ title: t("privacyData") }} />
      <Stack.Screen name="TeamUsers" component={TeamUsersScreen} options={{ title: t("users") }} />
      <Stack.Screen name="AccountDeletion" component={AccountDeletionScreen} options={{ title: t("deleteAccount") }} />
      <Stack.Screen name="AdminNotificationOperations" component={AdminNotificationOperationsScreen} options={{ title: t("adminNotificationsModule") }} />
      <Stack.Screen name="PlatformModule" component={PlatformModuleScreen} options={({ route }) => ({ title: route.params.title ?? t("module") })} />
    </Stack.Navigator>
  );
}
