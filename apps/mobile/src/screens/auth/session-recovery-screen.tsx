import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { restoreSession } from "@/auth/auth-service";
import { useAuthStore } from "@/auth/auth-store";
import { clearMobileSessionState } from "@/auth/session-cleanup";
import { BrandHeader } from "@/components/brand-header";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { useTranslation } from "@/i18n/use-translation";
import { captureAppError } from "@/services/crash-reporting";
import { useTheme } from "@/theme/theme-provider";

export function SessionRecoveryScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    try {
      await restoreSession();
    } catch (error) {
      captureAppError(error, { source: "auth-recovery-retry" });
      useAuthStore.getState().setRecovering();
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    await clearMobileSessionState();
  }

  return (
    <Screen style={styles.screen}>
      <BrandHeader />
      <View style={[styles.panel, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={[styles.icon, { backgroundColor: theme.badge }]}>
          <Ionicons name="cloud-offline-outline" size={30} color={theme.primary} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>{t("loginFailed")}</Text>
        <Text style={[styles.description, { color: theme.muted }]}>{t("serverUnreachableError")}</Text>
        <PrimaryButton title={t("retry")} icon="refresh-outline" loading={busy} onPress={() => void retry()} />
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void signOut()} style={styles.logoutButton}>
          <Text style={[styles.logoutText, { color: theme.danger }]}>{t("logout")}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: "center" },
  panel: { borderRadius: 8, borderWidth: 1, gap: 16, padding: 20 },
  icon: { alignItems: "center", alignSelf: "center", borderRadius: 8, height: 56, justifyContent: "center", width: 56 },
  title: { fontSize: 22, fontWeight: "900", textAlign: "center" },
  description: { fontSize: 14, lineHeight: 21, textAlign: "center" },
  logoutButton: { alignItems: "center", minHeight: 48, justifyContent: "center" },
  logoutText: { fontSize: 15, fontWeight: "800" },
});
