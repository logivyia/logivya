import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import type { AdminModuleKey } from "@/api/mobileAdmin";
import { logout } from "@/auth/auth-service";
import { useAuthStore } from "@/auth/auth-store";
import { ActionRow, Badge, PageHeader, SectionTitle, SurfaceCard } from "@/components/ui";
import { Screen } from "@/components/screen";
import { localeMetadata, type Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/use-translation";
import type { TranslationKey } from "@/i18n/translations";
import { useTheme } from "@/theme/theme-provider";
import { canSeeAdminHub, formatRoleLabel } from "@/utils/roles";
import type { AppTabParamList } from "@/types/navigation";

type AppNavigation = BottomTabNavigationProp<AppTabParamList>;
type IconName = ComponentProps<typeof Ionicons>["name"];

type AdminRow = {
  key: AdminModuleKey;
  icon: IconName;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
};

const adminRows: AdminRow[] = [
  { key: "dashboard", icon: "speedometer-outline", titleKey: "adminDashboardModule", descriptionKey: "adminDashboardDescription" },
  { key: "companies", icon: "business-outline", titleKey: "adminCompaniesModule", descriptionKey: "adminCompaniesDescription" },
  { key: "users", icon: "people-circle-outline", titleKey: "adminUsersModule", descriptionKey: "adminUsersDescription" },
  { key: "roles", icon: "key-outline", titleKey: "adminRolesModule", descriptionKey: "adminRolesDescription" },
  { key: "billing", icon: "cash-outline", titleKey: "adminBillingModule", descriptionKey: "adminBillingDescription" },
  { key: "subscriptions", icon: "file-tray-full-outline", titleKey: "adminSubscriptionsModule", descriptionKey: "adminSubscriptionsDescription" },
  { key: "invoices", icon: "document-text-outline", titleKey: "adminInvoicesModule", descriptionKey: "adminInvoicesDescription" },
  { key: "payments", icon: "card-outline", titleKey: "adminPaymentsModule", descriptionKey: "adminPaymentsDescription" },
  { key: "whatsappAccounts", icon: "logo-whatsapp", titleKey: "adminWhatsAppModule", descriptionKey: "adminWhatsAppDescription" },
  { key: "campaigns", icon: "send-outline", titleKey: "adminCampaignsModule", descriptionKey: "adminCampaignsDescription" },
  { key: "support", icon: "ticket-outline", titleKey: "adminSupportModule", descriptionKey: "adminSupportDescription" },
  { key: "security", icon: "shield-checkmark-outline", titleKey: "adminSecurityModule", descriptionKey: "adminSecurityDescription" },
  { key: "compliance", icon: "checkmark-done-outline", titleKey: "adminComplianceModule", descriptionKey: "adminComplianceDescription" },
  { key: "audit", icon: "document-text-outline", titleKey: "adminAuditModule", descriptionKey: "adminAuditDescription" },
  { key: "activity", icon: "pulse-outline", titleKey: "adminActivityModule", descriptionKey: "adminActivityDescription" },
  { key: "notifications", icon: "notifications-outline", titleKey: "adminNotificationsModule", descriptionKey: "adminNotificationsDescription" },
  { key: "dataRequests", icon: "folder-open-outline", titleKey: "adminDataRequestsModule", descriptionKey: "adminDataRequestsDescription" },
  { key: "metrics", icon: "analytics-outline", titleKey: "adminMetricsModule", descriptionKey: "adminMetricsDescription" },
  { key: "systemHealth", icon: "heart-outline", titleKey: "adminSystemHealthModule", descriptionKey: "adminSystemHealthDescription" },
  { key: "backups", icon: "server-outline", titleKey: "adminBackupsModule", descriptionKey: "adminBackupsDescription" },
  { key: "disasterRecovery", icon: "cloud-done-outline", titleKey: "adminDisasterRecoveryModule", descriptionKey: "adminDisasterRecoveryDescription" },
  { key: "settings", icon: "settings-outline", titleKey: "adminSettingsModule", descriptionKey: "adminSettingsDescription" },
  { key: "featureFlags", icon: "flag-outline", titleKey: "adminFeatureFlagsModule", descriptionKey: "adminFeatureFlagsDescription" },
  { key: "announcements", icon: "megaphone-outline", titleKey: "adminAnnouncementsModule", descriptionKey: "adminAnnouncementsDescription" },
  { key: "apiUsage", icon: "flash-outline", titleKey: "adminApiUsageModule", descriptionKey: "adminApiUsageDescription" },
  { key: "webhooks", icon: "git-network-outline", titleKey: "adminWebhooksModule", descriptionKey: "adminWebhooksDescription" },
  { key: "platformSettings", icon: "settings-outline", titleKey: "adminPlatformSettingsModule", descriptionKey: "adminPlatformSettingsDescription" }
];

export function MoreScreen() {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const navigation = useNavigation<AppNavigation>();
  const user = useAuthStore((state) => state.user);
  const company = useAuthStore((state) => state.company);
  const permissions = useAuthStore((state) => state.permissions);
  const isPlatformAdmin = useAuthStore((state) => state.isPlatformAdmin);
  const canSeeAdmin = canSeeAdminHub(isPlatformAdmin);

  function openModule(moduleKey: AdminModuleKey) {
    navigation.navigate("Profile", {
      screen: "PlatformModule",
      params: { moduleKey }
    });
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      Alert.alert(t("logout"), t("logoutCompleted"));
    }
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader
          eyebrow={canSeeAdmin ? t("adminDashboardModule") : "Logivya"}
          title={canSeeAdmin ? t("adminControlCenter") : t("myAccount")}
          description={canSeeAdmin ? t("adminMobileDescription") : t("myAccountDescription")}
        />

        <SurfaceCard style={styles.identityCard}>
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            <Text style={[styles.avatarText, { color: theme.primaryText }]}>{getInitial(user?.name ?? user?.email, locale)}</Text>
          </View>
          <View style={styles.identityText}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {user?.name ?? t("unknownUser")}
            </Text>
            <Text style={[styles.meta, { color: theme.muted }]} numberOfLines={1}>
              {user?.email ?? "-"}
            </Text>
            <Text style={[styles.meta, { color: theme.muted }]} numberOfLines={1}>
              {company?.name ?? t("company")}
            </Text>
          </View>
          <Badge label={formatRoleLabel(user?.role, permissions)} tone={canSeeAdmin ? "success" : "primary"} />
        </SurfaceCard>

        <View style={styles.menuGroup}>
          <SectionTitle title={t("mainMenu")} />
          <ActionRow icon="grid-outline" title={t("overview")} description={t("overviewDescription")} onPress={() => navigation.navigate("Dashboard")} />
          <ActionRow icon="phone-portrait-outline" title={t("whatsappAccounts")} description={t("accountsDescription")} onPress={() => navigation.navigate("WhatsApp", { screen: "WhatsAppAccounts" })} />
          <ActionRow icon="people-outline" title={t("groups")} description={t("groupsMenuDescription")} onPress={() => navigation.navigate("Groups")} />
          <ActionRow icon="cube-outline" title={t("categories")} description={t("categoriesMenuDescription")} onPress={() => navigation.navigate("Categories", { screen: "CategoriesList" })} />
          <ActionRow icon="send-outline" title={t("messagingTitle")} description={t("messagingMenuDescription")} onPress={() => navigation.navigate("Messaging")} />
          <ActionRow icon="time-outline" title={t("messageHistoryTitle")} description={t("historyMenuDescription")} onPress={() => navigation.navigate("MessageHistory")} />
          <ActionRow icon="help-circle-outline" title={t("support")} description={t("supportMenuDescription")} onPress={() => navigation.navigate("Support", { screen: "SupportTickets" })} />
        </View>

        {canSeeAdmin ? (
          <View style={styles.menuGroup}>
            <SectionTitle title={t("adminSections")} />
            {adminRows.map((item) => (
              <ActionRow key={item.key} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)} onPress={() => openModule(item.key)} />
            ))}
          </View>
        ) : null}

        <View style={styles.menuGroup}>
          <SectionTitle title={t("settings")} />
          <ActionRow icon="business-outline" title={t("companySettings")} description={t("companyInfoDescription")} onPress={() => navigation.navigate("Profile", { screen: "CompanySettings" })} />
          {canSeeAdmin ? (
            <ActionRow icon="person-add-outline" title={t("adminUsersModule")} description={t("teamUsersMenuDescription")} onPress={() => navigation.navigate("Profile", { screen: "TeamUsers" })} />
          ) : null}
          <ActionRow icon="card-outline" title={t("adminSubscriptionsModule")} description={t("subscriptionMenuDescription")} onPress={() => navigation.navigate("Profile", { screen: "Subscription" })} />
          <ActionRow icon="trash-outline" title={t("deleteAccount")} description={t("deleteAccountMenuDescription")} tone="danger" onPress={() => navigation.navigate("Profile", { screen: "AccountDeletion" })} />
          <ActionRow icon="log-out-outline" title={t("logout")} description={t("logoutDeviceDescription")} tone="danger" onPress={handleLogout} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function getInitial(value: string | undefined, locale: Locale) {
  const clean = value?.trim();
  return clean ? clean[0]?.toLocaleUpperCase(localeMetadata[locale].intlLocale) : "L";
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  content: {
    gap: 18,
    paddingBottom: 44
  },
  identityCard: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14
  },
  avatar: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "900"
  },
  identityText: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  name: {
    fontSize: 18,
    fontWeight: "900"
  },
  meta: {
    fontSize: 13,
    lineHeight: 18
  },
  menuGroup: {
    gap: 10
  }
});
