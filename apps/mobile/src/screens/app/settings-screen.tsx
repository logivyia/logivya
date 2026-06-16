import type { ReactNode } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { logout } from "@/auth/auth-service";
import { useSettingsStore } from "@/auth/settings-store";
import { getCurrentAppVersion, getCurrentBuildChannel } from "@/api/mobileRelease";
import { Screen } from "@/components/screen";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

export function SettingsScreen() {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const { theme: selectedTheme, setTheme, setLocale, notificationsEnabled, setNotificationsEnabled, biometricEnabled, setBiometricEnabled } = useSettingsStore();

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
        <SettingsSection title={t("language")}>
          <Chip label="Türkçe" active={locale === "tr"} onPress={() => setLocale("tr")} />
          <Chip label="English" active={locale === "en"} onPress={() => setLocale("en")} />
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
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("about")}</Text>
          <Text style={[styles.description, { color: theme.muted }]}>Logivya Mobile {getCurrentAppVersion()}</Text>
          <Text style={[styles.description, { color: theme.muted }]}>{t("releaseChannel")}: {String(getCurrentBuildChannel())}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={handleLogout} style={[styles.logout, { borderColor: theme.border }]}>
          <Text style={styles.logoutText}>{t("logout")}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
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
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.chip, { backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border }]}>
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
  logout: { borderWidth: 1, borderRadius: 18, minHeight: 54, alignItems: "center", justifyContent: "center" },
  logoutText: { color: "#dc2626", fontSize: 16, fontWeight: "900" }
});
