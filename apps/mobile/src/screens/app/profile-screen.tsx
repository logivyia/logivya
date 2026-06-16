import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { logout } from "@/auth/auth-service";
import { useAuthStore } from "@/auth/auth-store";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { ProfileStackParamList } from "@/types/navigation";

export function ProfileScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const user = useAuthStore((state) => state.user);
  const company = useAuthStore((state) => state.company);

  async function handleLogout() {
    try {
      await logout();
    } catch {
      Alert.alert(t("logout"), t("logoutCompleted"));
    }
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.identity, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.name, { color: theme.text }]}>{user?.name ?? t("unknownUser")}</Text>
          <Text style={[styles.meta, { color: theme.muted }]}>{user?.email ?? "-"}</Text>
          <Text style={[styles.meta, { color: theme.muted }]}>{user?.phone ?? t("phoneNotSet")}</Text>
          <Text style={[styles.role, { color: theme.primary }]}>{user?.role ?? t("unknownRole")}</Text>
          <Text style={[styles.meta, { color: theme.muted }]}>{company?.name ?? t("company")}</Text>
        </View>
        <ProfileMenuItem title={t("companySettings")} description={t("companySettingsDescription")} onPress={() => navigation.navigate("CompanySettings")} />
        <ProfileMenuItem title={t("subscription")} description={t("subscriptionDescription")} onPress={() => navigation.navigate("Subscription")} />
        <ProfileMenuItem title={t("notifications")} description={t("notificationsDescription")} onPress={() => navigation.navigate("Notifications")} />
        <ProfileMenuItem title={t("feedback")} description={t("feedbackMenuDescription")} onPress={() => navigation.navigate("Feedback")} />
        <ProfileMenuItem title={t("settings")} description={t("settingsDescription")} onPress={() => navigation.navigate("Settings")} />
        <View style={[styles.notice, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.noticeTitle, { color: theme.text }]}>{t("profileEditing")}</Text>
          <Text style={[styles.noticeText, { color: theme.muted }]}>{t("profileEditingApiMissing")}</Text>
        </View>
        <PrimaryButton title={t("logout")} onPress={handleLogout} />
      </ScrollView>
    </Screen>
  );
}

function ProfileMenuItem({ title, description, onPress }: { title: string; description: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.menuItem, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.menuText}>
        <Text style={[styles.menuTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.menuDescription, { color: theme.muted }]}>{description}</Text>
      </View>
      <Text style={[styles.chevron, { color: theme.primary }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  content: { gap: 14, paddingBottom: 32 },
  identity: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 6 },
  name: { fontSize: 26, fontWeight: "900" },
  meta: { fontSize: 14, lineHeight: 20 },
  role: { fontSize: 13, fontWeight: "900", textTransform: "uppercase" },
  menuItem: { borderWidth: 1, borderRadius: 20, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  menuText: { flex: 1, gap: 4 },
  menuTitle: { fontSize: 17, fontWeight: "900" },
  menuDescription: { fontSize: 13, lineHeight: 19 },
  chevron: { fontSize: 30, fontWeight: "400" },
  notice: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 6 },
  noticeTitle: { fontSize: 16, fontWeight: "900" },
  noticeText: { fontSize: 13, lineHeight: 20 }
});
