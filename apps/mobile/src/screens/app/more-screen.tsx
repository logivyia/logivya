import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useState, type ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

import { canReadAdminModule, type AdminModuleKey } from "@/api/mobileAdmin";
import { logout } from "@/auth/auth-service";
import { useAuthStore } from "@/auth/auth-store";
import {
  ActionRow,
  Badge,
  PageHeader,
  SectionTitle,
  SurfaceCard,
} from "@/components/ui";
import { LowbedIcon } from "@/components/lowbed-icon";
import { Screen } from "@/components/screen";
import { useFreightAccessEnabled } from "@/features/freight/freightAccessStore";
import { useFacebookPagesEnabled } from "@/features/facebook/facebookAccessStore";
import { useProductFeatureVisible } from "@/features/product/productFeatureStore";
import { useTelegramAccessEnabled } from "@/features/telegram/telegramAccessStore";
import { localeMetadata, type Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/use-translation";
import type { TranslationKey } from "@/i18n/translations";
import { useTheme } from "@/theme/theme-provider";
import {
  canManageOwnerProfile,
  canSeeAdminHub,
  formatRoleLabel,
} from "@/utils/roles";
import type { AppTabParamList, MoreStackParamList } from "@/types/navigation";

type AppNavigation = CompositeNavigationProp<
  NativeStackNavigationProp<MoreStackParamList, "AdminSections">,
  BottomTabNavigationProp<AppTabParamList>
>;
type IconName = ComponentProps<typeof Ionicons>["name"];

type AdminRow = {
  key: AdminModuleKey;
  icon: IconName;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
};

const adminRows: AdminRow[] = [
  {
    key: "dashboard",
    icon: "speedometer-outline",
    titleKey: "adminDashboardModule",
    descriptionKey: "adminDashboardDescription",
  },
  {
    key: "companies",
    icon: "grid-outline",
    titleKey: "adminCompaniesModule",
    descriptionKey: "adminCompaniesDescription",
  },
  {
    key: "users",
    icon: "people-circle-outline",
    titleKey: "adminUsersModule",
    descriptionKey: "adminUsersDescription",
  },
  {
    key: "roles",
    icon: "key-outline",
    titleKey: "adminRolesModule",
    descriptionKey: "adminRolesDescription",
  },
  {
    key: "billing",
    icon: "cash-outline",
    titleKey: "adminBillingModule",
    descriptionKey: "adminBillingDescription",
  },
  {
    key: "subscriptions",
    icon: "file-tray-full-outline",
    titleKey: "adminSubscriptionsModule",
    descriptionKey: "adminSubscriptionsDescription",
  },
  {
    key: "invoices",
    icon: "document-text-outline",
    titleKey: "adminInvoicesModule",
    descriptionKey: "adminInvoicesDescription",
  },
  {
    key: "payments",
    icon: "card-outline",
    titleKey: "adminPaymentsModule",
    descriptionKey: "adminPaymentsDescription",
  },
  {
    key: "whatsappAccounts",
    icon: "logo-whatsapp",
    titleKey: "adminWhatsAppModule",
    descriptionKey: "adminWhatsAppDescription",
  },
  {
    key: "campaigns",
    icon: "send-outline",
    titleKey: "adminCampaignsModule",
    descriptionKey: "adminCampaignsDescription",
  },
  {
    key: "support",
    icon: "ticket-outline",
    titleKey: "adminSupportModule",
    descriptionKey: "adminSupportDescription",
  },
  {
    key: "security",
    icon: "shield-checkmark-outline",
    titleKey: "adminSecurityModule",
    descriptionKey: "adminSecurityDescription",
  },
  {
    key: "trialRisk",
    icon: "warning-outline",
    titleKey: "adminTrialRiskModule",
    descriptionKey: "adminTrialRiskDescription",
  },
  {
    key: "compliance",
    icon: "checkmark-done-outline",
    titleKey: "adminComplianceModule",
    descriptionKey: "adminComplianceDescription",
  },
  {
    key: "privacy",
    icon: "lock-closed-outline",
    titleKey: "adminPrivacyModule",
    descriptionKey: "adminPrivacyDescription",
  },
  {
    key: "audit",
    icon: "document-text-outline",
    titleKey: "adminAuditModule",
    descriptionKey: "adminAuditDescription",
  },
  {
    key: "activity",
    icon: "pulse-outline",
    titleKey: "adminActivityModule",
    descriptionKey: "adminActivityDescription",
  },
  {
    key: "notifications",
    icon: "notifications-outline",
    titleKey: "adminNotificationsModule",
    descriptionKey: "adminNotificationsDescription",
  },
  {
    key: "dataRequests",
    icon: "folder-open-outline",
    titleKey: "adminDataRequestsModule",
    descriptionKey: "adminDataRequestsDescription",
  },
  {
    key: "metrics",
    icon: "analytics-outline",
    titleKey: "adminMetricsModule",
    descriptionKey: "adminMetricsDescription",
  },
  {
    key: "systemHealth",
    icon: "heart-outline",
    titleKey: "adminSystemHealthModule",
    descriptionKey: "adminSystemHealthDescription",
  },
  {
    key: "backups",
    icon: "server-outline",
    titleKey: "adminBackupsModule",
    descriptionKey: "adminBackupsDescription",
  },
  {
    key: "disasterRecovery",
    icon: "cloud-done-outline",
    titleKey: "adminDisasterRecoveryModule",
    descriptionKey: "adminDisasterRecoveryDescription",
  },
  {
    key: "releases",
    icon: "rocket-outline",
    titleKey: "adminReleasesModule",
    descriptionKey: "adminReleasesDescription",
  },
  {
    key: "settings",
    icon: "settings-outline",
    titleKey: "adminSettingsModule",
    descriptionKey: "adminSettingsDescription",
  },
  {
    key: "featureFlags",
    icon: "flag-outline",
    titleKey: "adminFeatureFlagsModule",
    descriptionKey: "adminFeatureFlagsDescription",
  },
  {
    key: "announcements",
    icon: "megaphone-outline",
    titleKey: "adminAnnouncementsModule",
    descriptionKey: "adminAnnouncementsDescription",
  },
  {
    key: "apiUsage",
    icon: "flash-outline",
    titleKey: "adminApiUsageModule",
    descriptionKey: "adminApiUsageDescription",
  },
  {
    key: "webhooks",
    icon: "git-network-outline",
    titleKey: "adminWebhooksModule",
    descriptionKey: "adminWebhooksDescription",
  },
  {
    key: "platformSettings",
    icon: "settings-outline",
    titleKey: "adminPlatformSettingsModule",
    descriptionKey: "adminPlatformSettingsDescription",
  },
];

export function MoreScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { t, locale } = useTranslation();
  const navigation = useNavigation<AppNavigation>();
  const user = useAuthStore((state) => state.user);
  const company = useAuthStore((state) => state.company);
  const permissions = useAuthStore((state) => state.permissions);
  const adminPermissions = useAuthStore((state) => state.adminPermissions);
  const platformAdminRole = useAuthStore((state) => state.platformAdminRole);
  const isPlatformAdmin = useAuthStore((state) => state.isPlatformAdmin);
  const freightEnabled = useFreightAccessEnabled();
  const telegramEnabled = useTelegramAccessEnabled();
  const facebookEnabled = useFacebookPagesEnabled();
  const homeMovingVisible = useProductFeatureVisible("HOME_MOVING");
  const partialLoadVisible = useProductFeatureVisible("PARTIAL_LOAD");
  const heavyHaulVisible = useProductFeatureVisible("HEAVY_HAUL");
  const canSeeAdmin = canSeeAdminHub(isPlatformAdmin, adminPermissions);
  const canManageProfile = canManageOwnerProfile(isPlatformAdmin);
  const visibleAdminRows = adminRows.filter((item) =>
    canReadAdminModule(item.key, adminPermissions),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  function openModule(moduleKey: AdminModuleKey) {
    if (moduleKey === "notifications" || moduleKey === "announcements") {
      navigation.push("AdminNotificationOperations", {
        initialTab: moduleKey === "announcements" ? "announcements" : "dashboard",
      });
      return;
    }
    navigation.push("PlatformModule", { moduleKey });
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
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          eyebrow={canSeeAdmin ? t("adminDashboardModule") : "Logivya"}
          title={canSeeAdmin ? t("adminControlCenter") : t("myAccount")}
          description={
            canSeeAdmin
              ? t("adminMobileDescription")
              : t("myAccountDescription")
          }
        />

        <SurfaceCard style={styles.identityCard}>
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            <Text style={[styles.avatarText, { color: theme.primaryText }]}>
              {getInitial(user?.name ?? user?.email, locale)}
            </Text>
          </View>
          <View style={styles.identityText}>
            <Text
              style={[styles.name, { color: theme.text }]}
              numberOfLines={1}
            >
              {user?.name ?? t("unknownUser")}
            </Text>
            <Text
              style={[styles.meta, { color: theme.muted }]}
              numberOfLines={1}
            >
              {user?.email ?? "-"}
            </Text>
            <Text
              style={[styles.meta, { color: theme.muted }]}
              numberOfLines={1}
            >
              {company?.name ?? t("company")}
            </Text>
          </View>
          <Badge
            label={formatRoleLabel(
              canSeeAdmin ? (platformAdminRole ?? user?.role) : user?.role,
              canSeeAdmin ? adminPermissions : permissions,
            )}
            tone={canSeeAdmin ? "success" : "primary"}
          />
        </SurfaceCard>

        {freightEnabled ? (
          <View style={styles.menuGroup}>
            <SectionTitle title={t("freightMarketplace")} />
            <ActionRow
              icon="add-circle-outline"
              title={t("createLoad")}
              description={t("createLoadDescription")}
              onPress={() => navigation.navigate("CreateLoad")}
            />
            <ActionRow
              icon="search-outline"
              title={t("findLoads")}
              description={t("findLoadsDescription")}
              onPress={() => navigation.navigate("FindLoads")}
            />
            <ActionRow
              icon="clipboard-outline"
              title={t("myListings")}
              description={t("myListingsDescription")}
              onPress={() => navigation.navigate("MyListings")}
            />
          </View>
        ) : null}

        <View style={styles.menuGroup}>
          <SectionTitle title={t("mainMenu")} />
          <ActionRow
            icon="grid-outline"
            title={t("overview")}
            description={t("overviewDescription")}
            onPress={() => navigation.navigate("Dashboard")}
          />
          <ActionRow
            icon="phone-portrait-outline"
            title={t("whatsappAccounts")}
            description={t("accountsDescription")}
            onPress={() =>
              navigation.navigate("WhatsApp", { screen: "WhatsAppAccounts" })
            }
          />
          {telegramEnabled ? (
            <ActionRow
              icon="paper-plane-outline"
              title={t("telegramAccounts")}
              description={t("telegramAccountsDescription")}
              onPress={() => navigation.navigate("Telegram")}
            />
          ) : null}
          {facebookEnabled ? (
            <ActionRow
              icon="logo-facebook"
              title={t("facebookPages")}
              description={t("facebookPagesMenuDescription")}
              onPress={() => navigation.navigate("FacebookPages")}
            />
          ) : null}
          {homeMovingVisible ? (
            <ActionRow
              icon="home-outline"
              title={t("homeMovingMarketplace")}
              description={t("homeMovingMarketplaceDescription")}
              onPress={() => navigation.navigate("HomeMoving")}
            />
          ) : null}
          {partialLoadVisible ? (
            <ActionRow
              icon="layers-outline"
              title={t("partialLoadMarketplace")}
              description={t("partialLoadMarketplaceDescription")}
              onPress={() => navigation.navigate("PartialLoad")}
            />
          ) : null}
          {heavyHaulVisible ? (
            <ActionRow
              iconElement={
                <View
                  style={[styles.lowbedBadge, { backgroundColor: theme.badge }]}
                >
                  <LowbedIcon color={theme.primary} size={24} />
                </View>
              }
              title={t("heavyHaulMarketplace")}
              description={t("heavyHaulMarketplaceDescription")}
              onPress={() => navigation.navigate("HeavyHaul")}
            />
          ) : null}
          <ActionRow
            icon="people-outline"
            title={t("groups")}
            description={t("groupsMenuDescription")}
            onPress={() => navigation.navigate("Groups")}
          />
          <ActionRow
            icon="cube-outline"
            title={t("categories")}
            description={t("categoriesMenuDescription")}
            onPress={() =>
              navigation.navigate("Categories", { screen: "CategoriesList" })
            }
          />
          <ActionRow
            icon="help-circle-outline"
            title={t("support")}
            description={t("supportMenuDescription")}
            onPress={() =>
              navigation.navigate("Support", { screen: "SupportTickets" })
            }
          />
          <ActionRow
            icon="card-outline"
            title={t("subscription")}
            description={t("subscriptionMenuDescription")}
            onPress={() =>
              navigation.navigate("Profile", { screen: "Subscription" })
            }
          />
        </View>

        <ActionRow icon="person-add-outline" title={t("teamAddUser")}
          onPress={() => navigation.navigate("Profile", { screen: "TeamUsers" })} />

        {canSeeAdmin ? (
          <View style={styles.menuGroup}>
            <SectionTitle title={t("adminSections")} />
            <View style={styles.adminGrid}>
              {visibleAdminRows.map((item) => (
                <View
                  key={item.key}
                  style={[
                    styles.adminGridItem,
                    width < 600 ? styles.adminGridItemSingleColumn : null,
                  ]}
                >
                  <ActionRow
                    compact
                    icon={item.icon}
                    title={t(item.titleKey)}
                    onPress={() => openModule(item.key)}
                  />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.menuGroup}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: settingsOpen }}
            onPress={() => setSettingsOpen((value) => !value)}
            style={({ pressed }) => [
              styles.settingsToggle,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <Ionicons name="settings-outline" size={22} color={theme.primary} />
            <Text style={[styles.settingsToggleText, { color: theme.text }]}>
              {t("settings")}
            </Text>
            <Ionicons
              name={
                settingsOpen ? "chevron-up-outline" : "chevron-down-outline"
              }
              size={20}
              color={theme.iconMuted}
            />
          </Pressable>
          {settingsOpen ? (
            <View style={styles.settingsChildren}>
              {canManageProfile ? (
                <ActionRow
                  icon="person-circle-outline"
                  title={t("profile")}
                  description={t("userProfileSubtitle")}
                  onPress={() =>
                    navigation.navigate("Profile", { screen: "ProfileHome" })
                  }
                />
              ) : null}
              <ActionRow
                icon="id-card-outline"
                title={t("companySettings")}
                description={t("companyInfoDescription")}
                onPress={() =>
                  navigation.navigate("Profile", { screen: "CompanySettings" })
                }
              />
              <ActionRow
                icon="shield-checkmark-outline"
                title={t("security")}
                description={t("mfaSecurityDescription")}
                onPress={() =>
                  navigation.navigate("Profile", { screen: "Security" })
                }
              />
              <ActionRow
                icon="trash-outline"
                title={t("deleteAccount")}
                description={t("deleteAccountMenuDescription")}
                tone="danger"
                onPress={() =>
                  navigation.navigate("Profile", { screen: "AccountDeletion" })
                }
              />
            </View>
          ) : null}
        </View>
        <ActionRow
          icon="log-out-outline"
          title={t("logout")}
          description={t("logoutDeviceDescription")}
          tone="danger"
          onPress={handleLogout}
        />
      </ScrollView>
    </Screen>
  );
}

function getInitial(value: string | undefined, locale: Locale) {
  const clean = value?.trim();
  return clean
    ? clean[0]?.toLocaleUpperCase(localeMetadata[locale].intlLocale)
    : "L";
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  content: {
    gap: 18,
    paddingBottom: 44,
  },
  identityCard: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
  },
  avatar: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "900",
  },
  identityText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  name: {
    fontSize: 18,
    fontWeight: "900",
  },
  meta: {
    fontSize: 13,
    lineHeight: 18,
  },
  menuGroup: {
    gap: 10,
  },
  adminGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  adminGridItem: {
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 0,
  },
  adminGridItemSingleColumn: {
    flexBasis: "100%",
  },
  lowbedBadge: {
    alignItems: "center",
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  settingsToggle: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  settingsToggleText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
  },
  settingsChildren: {
    gap: 10,
    paddingStart: 12,
  },
});
