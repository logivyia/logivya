import type { ReactNode } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { logout } from "@/auth/auth-service";
import { useSettingsStore } from "@/auth/settings-store";
import { getCurrentAppVersion, getCurrentBuildChannel } from "@/api/mobileRelease";
import { updateLocalePreference } from "@/api/locale-api";
import { Screen } from "@/components/screen";
import { useTranslation } from "@/i18n/use-translation";
import { localeMetadata, locales, type Locale } from "@/i18n/config";
import { useTheme } from "@/theme/theme-provider";
import type { ProfileStackParamList } from "@/types/navigation";

export function SettingsScreen() {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { theme: selectedTheme, setTheme, setLocale, notificationsEnabled, setNotificationsEnabled, biometricEnabled, setBiometricEnabled } = useSettingsStore();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      Alert.alert(t("logout"), t("logoutCompleted"));
    }
  }

  function handleLocaleChange(nextLocale: Locale) {
    setLocale(nextLocale);
    void updateLocalePreference(nextLocale).catch(() => undefined);
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsSection title={t("language")}>
          {locales.map((item) => (
            <Chip
              key={item}
              label={localeMetadata[item].nativeName}
              active={locale === item}
              onPress={() => handleLocaleChange(item)}
            />
          ))}
        </SettingsSection>
        <SettingsSection title={t("theme")}>
          <Chip label={t("lightTheme")} active={selectedTheme === "light"} onPress={() => setTheme("light")} />
          <Chip label={t("darkTheme")} active={selectedTheme === "dark"} onPress={() => setTheme("dark")} />
          <Chip label={t("systemTheme")} active={selectedTheme === "system"} onPress={() => setTheme("system")} />
        </SettingsSection>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ToggleRow title={t("notifications")} value={notificationsEnabled} onValueChange={setNotificationsEnabled} />
          <ToggleRow title={t("biometricReady")} value={biometricEnabled} onValueChange={setBiometricEnabled} />
        </View>
        <SettingsSection title={t("accountSection")}>
          <MenuButton title={t("security")} description={t("mfaSecurityDescription")} onPress={() => navigation.navigate("Security")} />
          <MenuButton title={t("privacyData")} description={t("privacyDataDescription")} onPress={() => navigation.navigate("PrivacyData")} />
          <MenuButton title={t("deleteAccount")} description={t("deleteAccountDescription")} onPress={() => navigation.navigate("AccountDeletion")} tone="danger" />
        </SettingsSection>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("about")}</Text>
          <Text style={[styles.description, { color: theme.muted }]}>Logivya Mobile {getCurrentAppVersion()}</Text>
          <Text style={[styles.description, { color: theme.muted }]}>{t("releaseChannel")}: {String(getCurrentBuildChannel())}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={handleLogout} style={[styles.logout, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={[styles.logoutText, { color: theme.danger }]}>{t("logout")}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function MenuButton({ title, description, onPress, tone }: { title: string; description: string; onPress: () => void; tone?: "danger" }) {
  const theme = useTheme();
  const titleColor = tone === "danger" ? theme.danger : theme.text;

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.menuButton, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
      <View style={styles.menuButtonText}>
        <Text style={[styles.menuButtonTitle, { color: titleColor }]}>{title}</Text>
        <Text style={[styles.description, { color: theme.muted }]}>{description}</Text>
      </View>
      <Text style={[styles.chevron, { color: titleColor }]}>›</Text>
    </Pressable>
  );
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.chip, { backgroundColor: active ? theme.primary : theme.cardMuted, borderColor: active ? theme.primary : theme.border }]}>
      <Text style={[styles.chipText, { color: active ? theme.primaryText : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

function ToggleRow({ title, value, onValueChange }: { title: string; value: boolean; onValueChange: (value: boolean) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  content: { gap: 14, paddingBottom: 32 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "900" },
  description: { fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  chipText: { fontSize: 14, fontWeight: "900" },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  menuButton: { alignItems: "center", borderRadius: 18, borderWidth: 1, flexDirection: "row", gap: 12, padding: 14 },
  menuButtonText: { flex: 1, gap: 4 },
  menuButtonTitle: { fontSize: 15, fontWeight: "900" },
  chevron: { fontSize: 28, fontWeight: "500" },
  logout: { borderWidth: 1, borderRadius: 18, minHeight: 54, alignItems: "center", justifyContent: "center" },
  logoutText: { fontSize: 16, fontWeight: "900" }
});
