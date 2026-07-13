import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps, BottomTabHeaderProps } from "@react-navigation/bottom-tabs";
import { useState, type ComponentProps } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { AdminModuleKey } from "@/api/mobileAdmin";
import { updateLocalePreference } from "@/api/locale-api";
import { logout } from "@/auth/auth-service";
import { useAuthStore } from "@/auth/auth-store";
import { useSettingsStore } from "@/auth/settings-store";
import { localeMetadata, locales, type Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/use-translation";
import type { TranslationKey } from "@/i18n/translations";
import { colors } from "@/theme/colors";
import { useTheme } from "@/theme/theme-provider";
import type { AppTabParamList } from "@/types/navigation";
import { canSeeAdminHub } from "@/utils/roles";

type IconName = ComponentProps<typeof Ionicons>["name"];
type RouteName = keyof AppTabParamList;

type MainNavItem = {
  name: RouteName;
  labelKey: TranslationKey;
  icon: IconName;
};

type DrawerItem = {
  key: string;
  label: string;
  icon: IconName;
  onPress: () => void;
  active?: boolean;
};

const mainNav: MainNavItem[] = [
  { name: "Dashboard", labelKey: "overview", icon: "grid-outline" },
  { name: "WhatsApp", labelKey: "whatsappAccounts", icon: "logo-whatsapp" },
  { name: "Groups", labelKey: "groups", icon: "people-outline" },
  { name: "Categories", labelKey: "categories", icon: "pricetags-outline" },
  { name: "Messaging", labelKey: "messagingTitle", icon: "send-outline" },
  { name: "MessageHistory", labelKey: "messageHistoryTitle", icon: "time-outline" },
  { name: "Support", labelKey: "support", icon: "help-circle-outline" }
];

const DRAWER_BUILD_MARKER = "DRAWER_SCROLL_FULL_FIX_V1";

export function WebParityTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();
  const isPlatformAdmin = useAuthStore((store) => store.isPlatformAdmin);
  const activeRoute = state.routes[state.index]?.name as RouteName | undefined;
  const showAdmin = canSeeAdminHub(isPlatformAdmin);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.shell}>
      <View style={styles.brand}>
        <Image source={require("../../assets/images/logo.png")} resizeMode="contain" style={styles.logo} />
      </View>

      <ScrollView contentContainerStyle={styles.nav} showsVerticalScrollIndicator={false}>
        {mainNav.map((item) => (
          <SidebarItem key={item.name} icon={item.icon} label={t(item.labelKey)} focused={item.name === activeRoute} onPress={() => navigation.navigate(item.name)} />
        ))}
        {showAdmin ? <SidebarItem icon="shield-checkmark-outline" label={t("adminDashboardModule")} focused={activeRoute === "More"} onPress={() => navigation.navigate("More")} /> : null}
        <SidebarItem
          icon="settings-outline"
          label={t("settings")}
          focused={activeRoute === "Profile"}
          onPress={() => navigation.navigate("Profile", { screen: "CompanySettings" })}
        />
      </ScrollView>

    </SafeAreaView>
  );
}

function SidebarItem({ icon, label, focused, onPress }: { icon: IconName; label: string; focused: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      onPress={onPress}
      style={({ pressed }) => [styles.item, focused ? styles.itemActive : null, pressed ? styles.itemPressed : null]}
    >
      <Ionicons name={icon} size={19} color={focused ? colors.orange : colors.slateSoft} />
      <Text style={[styles.label, focused ? styles.labelActive : null]} numberOfLines={1}>
        {label}
      </Text>
      {focused ? <View style={styles.activeDot} /> : null}
    </Pressable>
  );
}

export function MobileAppHeader({ route, navigation }: BottomTabHeaderProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const isPlatformAdmin = useAuthStore((store) => store.isPlatformAdmin);
  const selectedTheme = useSettingsStore((store) => store.theme);
  const setTheme = useSettingsStore((store) => store.setTheme);
  const locale = useSettingsStore((store) => store.locale);
  const setLocale = useSettingsStore((store) => store.setLocale);
  const showAdmin = canSeeAdminHub(isPlatformAdmin);
  const activeRoute = route.name as RouteName;
  const drawerWidth = Math.min(Math.round(width * 0.82), 360);

  function closeDrawer() {
    setDrawerOpen(false);
  }

  function goToTab(name: RouteName) {
    navigation.navigate(name);
    closeDrawer();
  }

  function goToModule(moduleKey: AdminModuleKey) {
    navigation.navigate("Profile", { screen: "PlatformModule", params: { moduleKey } });
    closeDrawer();
  }

  function toggleTheme() {
    setTheme(selectedTheme === "dark" ? "light" : "dark");
  }

  function selectLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    setLanguageOpen(false);
    void updateLocalePreference(nextLocale).catch(() => undefined);
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      Alert.alert(t("logout"), t("logoutCompleted"));
    }
  }

  const primaryItems: DrawerItem[] = [
    ...mainNav.map((item) => ({
      key: item.name,
      label: t(item.labelKey),
      icon: item.icon,
      active: item.name === activeRoute,
      onPress: () => goToTab(item.name)
    }))
  ];

  const adminItems: DrawerItem[] = showAdmin
    ? [
        {
          key: "Admin",
          label: t("adminDashboardModule"),
          icon: "shield-checkmark-outline",
          active: activeRoute === "More",
          onPress: () => goToTab("More")
        }
      ]
    : [];

  const settingsItems: DrawerItem[] = [
    {
      key: "CompanySettings",
      label: t("companySettings"),
      icon: "business-outline",
      onPress: () => {
        navigation.navigate("Profile", { screen: "CompanySettings" });
        closeDrawer();
      }
    },
    ...(showAdmin
      ? [
          {
            key: "UsersSettings",
            label: t("users"),
            icon: "person-add-outline" as IconName,
            onPress: () => goToModule("users")
          }
        ]
      : []),
    {
      key: "SubscriptionSettings",
      label: t("subscription"),
      icon: "card-outline",
      onPress: () => {
        navigation.navigate("Profile", { screen: "Subscription" });
        closeDrawer();
      }
    },
    {
      key: "DeleteAccount",
      label: t("deleteAccount"),
      icon: "trash-outline",
      onPress: () => {
        navigation.navigate("Profile", { screen: "AccountDeletion" });
        closeDrawer();
      }
    }
  ];

  return (
    <SafeAreaView edges={["top"]} style={[styles.mobileHeaderHost, { backgroundColor: theme.header, borderBottomColor: theme.border }]}>
      <View style={styles.mobileHeader}>
        <Pressable accessibilityLabel={t("openMenu")} accessibilityRole="button" onPress={() => setDrawerOpen(true)} style={[styles.headerButton, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
          <Ionicons name="menu-outline" size={25} color={theme.icon} />
        </Pressable>
        <View style={styles.mobileHeaderSpacer} pointerEvents="none" />
        <View style={styles.headerActions}>
          <Pressable accessibilityLabel={t("notifications")} accessibilityRole="button" onPress={() => navigation.navigate("Profile", { screen: "Notifications" })} style={[styles.headerIconButton, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
            <Ionicons name="notifications-outline" size={20} color={theme.icon} />
          </Pressable>
          <Pressable accessibilityLabel={t("toggleTheme")} accessibilityRole="button" onPress={toggleTheme} style={[styles.headerIconButton, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
            <Ionicons name={theme.mode === "dark" ? "sunny-outline" : "moon-outline"} size={20} color={theme.icon} />
          </Pressable>
          <Pressable accessibilityLabel={t("changeLanguage")} accessibilityRole="button" onPress={() => setLanguageOpen(true)} style={[styles.headerIconButton, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
            <Text style={[styles.languageText, { color: theme.text }]}>{locale.toUpperCase()}</Text>
          </Pressable>
          <Pressable accessibilityLabel={t("logout")} accessibilityRole="button" onPress={handleLogout} style={[styles.headerIconButton, styles.logoutButton]}>
            <Ionicons name="log-out-outline" size={20} color={colors.white} />
          </Pressable>
        </View>
      </View>

      <Modal animationType="fade" onRequestClose={closeDrawer} statusBarTranslucent transparent visible={drawerOpen}>
        <View style={styles.drawerLayer}>
          <Pressable accessibilityLabel={t("closeMenu")} style={styles.drawerBackdrop} onPress={closeDrawer} />
          <SafeAreaView edges={["top", "bottom"]} style={[styles.drawer, { width: drawerWidth }]}>
            <View style={styles.drawerBrand}>
              <Image source={require("../../assets/images/logo.png")} resizeMode="contain" style={styles.drawerLogo} />
              <Pressable accessibilityLabel={t("closeMenu")} accessibilityRole="button" onPress={closeDrawer} style={styles.drawerClose}>
                <Ionicons name="close-outline" size={24} color={colors.white} />
              </Pressable>
            </View>
            <ScrollView
              accessibilityLabel={DRAWER_BUILD_MARKER}
              alwaysBounceVertical={false}
              bounces={false}
              contentContainerStyle={styles.drawerScroll}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              overScrollMode="always"
              scrollEventThrottle={16}
              showsVerticalScrollIndicator
              style={styles.drawerScrollView}
            >
              <DrawerSection items={primaryItems} />
              {adminItems.length ? <DrawerSection title={t("adminDashboardModule")} items={adminItems} /> : null}
              <DrawerSection title={t("settings")} items={settingsItems} compact />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
      <Modal animationType="fade" onRequestClose={() => setLanguageOpen(false)} transparent visible={languageOpen}>
        <View style={styles.languageLayer}>
          <Pressable accessibilityLabel={t("close")} style={styles.languageBackdrop} onPress={() => setLanguageOpen(false)} />
          <View style={[styles.languagePanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.languageTitle, { color: theme.text }]}>{t("language")}</Text>
            <ScrollView contentContainerStyle={styles.languageList}>
              {locales.map((item) => (
                <Pressable
                  key={item}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: item === locale }}
                  onPress={() => selectLocale(item)}
                  style={[styles.languageOption, { borderColor: item === locale ? theme.primary : theme.border, backgroundColor: item === locale ? theme.badge : theme.cardMuted }]}
                >
                  <Text style={[styles.languageOptionText, { color: item === locale ? theme.primary : theme.text }]}>{localeMetadata[item].nativeName}</Text>
                  {item === locale ? <Ionicons name="checkmark-circle" size={20} color={theme.primary} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DrawerSection({ title, items, compact = false }: { title?: string; items: DrawerItem[]; compact?: boolean }) {
  return (
    <View style={styles.drawerSection}>
      {title ? <Text style={styles.drawerSectionTitle}>{title}</Text> : null}
      {items.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityState={item.active ? { selected: true } : {}}
          onPress={item.onPress}
          style={({ pressed }) => [
            styles.drawerItem,
            compact ? styles.drawerItemCompact : null,
            item.active ? styles.drawerItemActive : null,
            pressed ? styles.itemPressed : null
          ]}
        >
          <Ionicons name={item.icon} size={compact ? 19 : 21} color={item.active ? colors.orange : colors.slateSoft} />
          <Text style={[styles.drawerLabel, item.active ? styles.drawerLabelActive : null]} numberOfLines={1}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: colors.navy,
    borderRightColor: colors.borderDark,
    borderRightWidth: 1,
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 16,
    width: 252
  },
  brand: { alignItems: "flex-start", marginBottom: 18, paddingHorizontal: 4 },
  logo: { height: 64, width: 184 },
  nav: { gap: 7, paddingBottom: 18 },
  item: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 9,
    position: "relative"
  },
  itemActive: { backgroundColor: colors.orangeWash },
  itemPressed: { opacity: 0.76 },
  label: { color: colors.slateSoft, flex: 1, fontSize: 14, fontWeight: "800", letterSpacing: 0 },
  labelActive: { color: colors.white },
  activeDot: { backgroundColor: colors.orange, borderRadius: 999, height: 7, position: "absolute", right: 10, width: 7 },
  mobileHeaderHost: {
    borderBottomWidth: 1,
    elevation: 8,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    zIndex: 100
  },
  mobileHeader: { alignItems: "center", flexDirection: "row", minHeight: 72, paddingHorizontal: 12, paddingVertical: 10 },
  headerButton: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  mobileHeaderSpacer: { flex: 1, minWidth: 0 },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 6 },
  headerIconButton: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  languageText: {
    fontSize: 12,
    fontWeight: "900"
  },
  logoutButton: {
    backgroundColor: colors.orange,
    borderColor: colors.orange
  },
  drawerLayer: { elevation: 30, flex: 1, flexDirection: "row", zIndex: 500 },
  drawerBackdrop: { backgroundColor: colors.drawerBackdrop, bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  drawer: { backgroundColor: colors.navy, flex: 1, maxHeight: "100%", paddingHorizontal: 16 },
  drawerBrand: { alignItems: "center", flexDirection: "row", flexShrink: 0, justifyContent: "space-between", marginBottom: 12, minHeight: 64 },
  drawerLogo: { height: 62, width: 176 },
  drawerClose: {
    alignItems: "center",
    backgroundColor: colors.whiteHover,
    borderRadius: 16,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  drawerScrollView: { flex: 1, minHeight: 0 },
  drawerScroll: { flexGrow: 1, gap: 16, paddingBottom: 20 },
  drawerSection: { gap: 7 },
  drawerSectionTitle: {
    color: colors.whiteMuted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 2,
    textTransform: "uppercase"
  },
  drawerItem: { alignItems: "center", borderRadius: 18, flexDirection: "row", gap: 12, minHeight: 52, paddingHorizontal: 14, paddingVertical: 10 },
  drawerItemCompact: { minHeight: 46, paddingVertical: 8 },
  drawerItemActive: { backgroundColor: colors.orangeWash },
  drawerLabel: { color: colors.slateSoft, flex: 1, fontSize: 15, fontWeight: "800" },
  drawerLabelActive: { color: colors.white },
  languageLayer: { alignItems: "center", flex: 1, justifyContent: "center", padding: 20 },
  languageBackdrop: { backgroundColor: colors.drawerBackdrop, bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  languagePanel: { borderRadius: 20, borderWidth: 1, maxHeight: "78%", maxWidth: 440, padding: 18, width: "100%" },
  languageTitle: { fontSize: 18, fontWeight: "900", marginBottom: 12 },
  languageList: { gap: 8 },
  languageOption: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 48, paddingHorizontal: 14, paddingVertical: 10 },
  languageOptionText: { fontSize: 15, fontWeight: "800" }
});
