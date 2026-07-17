import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { useTranslation } from "@/i18n/use-translation";
import { getNotificationPermissionStatus, requestNotificationPermissionAndRegister } from "@/services/notifications";
import { useTheme } from "@/theme/theme-provider";

export function NotificationPermissionEducationScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const [granted, setGranted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getNotificationPermissionStatus().then(setGranted).catch(() => setGranted(false));
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const result = await requestNotificationPermissionAndRegister();
      setGranted(result.registered);
      Alert.alert(t("notificationPermissionTitle"), result.registered ? t("notificationPermissionEnabled") : t("notificationPermissionDenied"));
    } catch (error) {
      Alert.alert(t("notificationPermissionTitle"), error instanceof Error ? error.message : t("operationFailedError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <View style={[styles.icon, { backgroundColor: theme.badge }]}>
        <Ionicons name="notifications-outline" size={38} color={theme.primary} />
      </View>
      <Text style={[styles.title, { color: theme.text }]}>{t("notificationPermissionTitle")}</Text>
      <Text style={[styles.description, { color: theme.muted }]}>{t("notificationPermissionEducation")}</Text>
      <View style={[styles.status, { borderColor: granted ? theme.success : theme.border, backgroundColor: theme.card }]}>
        <Text style={[styles.statusText, { color: granted ? theme.success : theme.text }]}>
          {granted ? t("notificationPermissionEnabled") : t("notificationPermissionDisabled")}
        </Text>
      </View>
      <PrimaryButton
        title={granted ? t("notificationPermissionEnabled") : t("notificationPermissionEnable")}
        disabled={granted}
        loading={busy}
        onPress={() => void enable()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: "center", gap: 16 },
  icon: { alignItems: "center", alignSelf: "center", borderRadius: 36, height: 72, justifyContent: "center", width: 72 },
  title: { fontSize: 28, fontWeight: "900", textAlign: "center" },
  description: { fontSize: 15, lineHeight: 23, textAlign: "center" },
  status: { alignItems: "center", borderRadius: 16, borderWidth: 1, padding: 14 },
  statusText: { fontSize: 14, fontWeight: "800" }
});
