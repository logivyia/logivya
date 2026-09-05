import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { logout } from "@/auth/auth-service";
import { useAuthStore } from "@/auth/auth-store";
import { ActionRow, Badge, IconBadge, PageHeader, SurfaceCard } from "@/components/ui";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { localeMetadata, type Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import { canManageOwnerProfile, formatRoleLabel } from "@/utils/roles";
import type { ProfileStackParamList } from "@/types/navigation";

export function ProfileScreen() {
  const { t, locale } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const user = useAuthStore((state) => state.user);
  const company = useAuthStore((state) => state.company);
  const permissions = useAuthStore((state) => state.permissions);
  const isPlatformAdmin = useAuthStore((state) => state.isPlatformAdmin);
  const canAccessStandaloneProfile = canManageOwnerProfile(isPlatformAdmin);
  const isOwner = user?.role === "OWNER";

  async function handleLogout() {
    try {
      await logout();
    } catch {
      Alert.alert(t("logout"), t("logoutCompleted"));
    }
  }

  if (!canAccessStandaloneProfile) {
    return (
      <Screen style={styles.screen}>
        <PageHeader eyebrow={t("accountSection")} title={t("profile")} description={t("operationForbiddenError")} />
        <SurfaceCard style={styles.notice}>
          <Text style={[styles.noticeTitle, { color: theme.text }]}>{t("operationForbiddenError")}</Text>
          <Text style={[styles.noticeText, { color: theme.muted }]}>{t("companySettingsDescription")}</Text>
        </SurfaceCard>
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader eyebrow={t("accountSection")} title={t("profile")} description={t("userProfileSubtitle")} />

        <SurfaceCard style={styles.identity}>
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            <Text style={[styles.avatarText, { color: theme.primaryText }]}>{getInitial(user?.name ?? user?.email, locale)}</Text>
          </View>
          <View style={styles.identityBody}>
            <View style={styles.identityTop}>
              <View style={styles.identityText}>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{user?.name ?? t("unknownUser")}</Text>
                <Text style={[styles.meta, { color: theme.muted }]} numberOfLines={1}>{user?.email ?? "-"}</Text>
              </View>
              <Badge label={formatRoleLabel(user?.role, permissions)} tone="primary" />
            </View>
            <View style={styles.profileFacts}>
              <ProfileFact icon="call-outline" label={user?.phone ?? t("phoneNotSet")} />
              <ProfileFact icon="person-circle-outline" label={company?.name ?? t("companySettings")} />
              <ProfileFact icon="shield-checkmark-outline" label={t("sessionSecure")} />
            </View>
          </View>
        </SurfaceCard>

        <View style={styles.menu}>
          {isOwner ? (
            <ActionRow icon="person-circle-outline" title={t("companySettings")} description={t("companySettingsDescription")} onPress={() => navigation.navigate("CompanySettings")} />
          ) : null}
          {isOwner ? (
            <ActionRow icon="people-outline" title={t("users")} description={t("teamUsersMenuDescription")} onPress={() => navigation.navigate("TeamUsers")} />
          ) : null}
          <ActionRow icon="shield-checkmark-outline" title={t("security")} description={t("mfaSecurityDescription")} onPress={() => navigation.navigate("Security")} />
          {isOwner ? (
            <ActionRow icon="card-outline" title={t("subscription")} description={t("subscriptionDescription")} onPress={() => navigation.navigate("Subscription")} />
          ) : null}
          <ActionRow icon="notifications-outline" title={t("notifications")} description={t("notificationsDescription")} onPress={() => navigation.navigate("Notifications")} />
          <ActionRow icon="chatbox-ellipses-outline" title={t("feedback")} description={t("feedbackMenuDescription")} onPress={() => navigation.navigate("Feedback")} />
          <ActionRow icon="settings-outline" title={t("settings")} description={t("settingsDescription")} onPress={() => navigation.navigate("Settings")} />
        </View>

        <SurfaceCard style={styles.notice}>
          <Text style={[styles.noticeTitle, { color: theme.text }]}>{t("profileEditing")}</Text>
          <Text style={[styles.noticeText, { color: theme.muted }]}>{t("profileEditingApiMissing")}</Text>
        </SurfaceCard>

        <PrimaryButton icon="log-out-outline" title={t("logout")} onPress={handleLogout} />
      </ScrollView>
    </Screen>
  );
}

function ProfileFact({ icon, label }: { icon: Parameters<typeof IconBadge>[0]["icon"]; label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.factRow}>
      <IconBadge icon={icon} tone="default" />
      <Text style={[styles.factText, { color: theme.muted }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function getInitial(value: string | undefined, locale: Locale) {
  const clean = value?.trim();
  return clean ? clean[0]?.toLocaleUpperCase(localeMetadata[locale].intlLocale) : "L";
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
    paddingVertical: 16
  },
  content: {
    gap: 14,
    paddingBottom: 32
  },
  identity: {
    gap: 14
  },
  avatar: {
    alignItems: "center",
    borderRadius: 30,
    height: 60,
    justifyContent: "center",
    width: 60
  },
  avatarText: {
    fontSize: 22,
    fontWeight: "900"
  },
  identityBody: {
    gap: 14
  },
  identityTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  identityText: {
    flex: 1,
    gap: 4
  },
  name: {
    fontSize: 24,
    fontWeight: "900"
  },
  meta: {
    fontSize: 14,
    lineHeight: 20
  },
  profileFacts: {
    gap: 10
  },
  factRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  factText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800"
  },
  menu: {
    gap: 10
  },
  notice: {
    gap: 8
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: "900"
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 20
  }
});
