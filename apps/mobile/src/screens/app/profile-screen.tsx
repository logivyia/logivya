import { Alert, StyleSheet, Text, View } from "react-native";

import { logout } from "@/auth/auth-service";
import { useAuthStore } from "@/auth/auth-store";
import { PrimaryButton } from "@/components/primary-button";
import { PlaceholderCard } from "@/components/placeholder-card";
import { Screen } from "@/components/screen";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

export function ProfileScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);

  async function handleLogout() {
    try {
      await logout();
    } catch {
      Alert.alert("Çıkış", "Oturum kapatıldı.");
    }
  }

  return (
    <Screen style={styles.container}>
      <PlaceholderCard title={t("profile")} description={t("placeholder")} />
      <View style={[styles.identity, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.name, { color: theme.text }]}>{user?.name ?? "Logivya Kullanıcısı"}</Text>
        <Text style={{ color: theme.muted }}>{user?.email ?? "Oturum bilgisi hazırlanıyor"}</Text>
      </View>
      <PrimaryButton title="Çıkış yap" onPress={handleLogout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16
  },
  identity: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 4
  },
  name: {
    fontSize: 18,
    fontWeight: "800"
  }
});
