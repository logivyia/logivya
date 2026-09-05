import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  getMobileNotificationPreferences,
  updateMobileNotificationPreferences,
  type MobileNotificationChannel,
  type MobileNotificationPreference,
  type NotificationCategory
} from "@/api/mobileNotifications";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { ErrorState } from "@/components/state/error-state";
import { useTranslation } from "@/i18n/use-translation";
import type { TranslationKey } from "@/i18n/translations";
import { useTheme } from "@/theme/theme-provider";
import type { ProfileStackParamList } from "@/types/navigation";

const visibleChannels: MobileNotificationChannel[] = ["IN_APP", "EMAIL", "ANDROID_PUSH"];

const categoryKeys: Record<NotificationCategory, TranslationKey> = {
  ACCOUNT: "notificationCategoryAccount",
  SECURITY: "notificationCategorySecurity",
  SUPPORT: "notificationCategorySupport",
  SUBSCRIPTION: "notificationCategorySubscription",
  BILLING: "notificationCategoryBilling",
  INVITATION: "notificationCategoryInvitation",
  WHATSAPP: "notificationCategoryWhatsapp",
  MESSAGE: "notificationCategoryMessage",
  MARKETPLACE: "notificationCategoryMarketplace",
  SYSTEM: "notificationCategorySystem",
  MARKETING: "notificationCategoryMarketing",
  COMPLIANCE: "notificationCategoryCompliance",
  ADMINISTRATION: "notificationCategoryAdministration",
  BACKUP: "notificationCategoryBackup",
  INCIDENT: "notificationCategoryIncident"
};

const channelKeys: Record<MobileNotificationChannel, TranslationKey> = {
  IN_APP: "notificationChannelInApp",
  EMAIL: "notificationChannelEmail",
  ANDROID_PUSH: "notificationChannelAndroid",
  IOS_PUSH: "notificationChannelIos",
  WEB_PUSH: "notificationChannelWeb"
};

export function NotificationPreferencesScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const [preferences, setPreferences] = useState<MobileNotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getMobileNotificationPreferences();
      setPreferences(response.preferences);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("notificationsLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<NotificationCategory, MobileNotificationPreference[]>();
    for (const preference of preferences) {
      if (!visibleChannels.includes(preference.channel)) continue;
      const group = map.get(preference.category) ?? [];
      group.push(preference);
      map.set(preference.category, group);
    }
    return Array.from(map.entries());
  }, [preferences]);

  const toggle = (category: NotificationCategory, channel: MobileNotificationChannel, enabled: boolean) => {
    setPreferences((current) => current.map((preference) =>
      preference.category === category && preference.channel === channel && !preference.mandatoryLocked
        ? { ...preference, enabled }
        : preference
    ));
  };

  const updatePreference = (
    category: NotificationCategory,
    channel: MobileNotificationChannel,
    patch: Partial<MobileNotificationPreference>
  ) => {
    setPreferences((current) => current.map((preference) =>
      preference.category === category && preference.channel === channel ? { ...preference, ...patch } : preference
    ));
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await updateMobileNotificationPreferences(preferences);
      setPreferences(response.preferences);
      Alert.alert(t("notificationPreferences"), t("notificationPreferencesSaved"));
    } catch (saveError) {
      Alert.alert(
        t("notificationPreferences"),
        saveError instanceof Error ? saveError.message : t("notificationPreferencesSaveFailed")
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={theme.primary} size="large" />
      </Screen>
    );
  }

  if (error) {
    return <Screen><ErrorState title={error} onRetry={() => void load()} /></Screen>;
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>{t("notificationPreferences")}</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>{t("notificationPreferencesDescription")}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate("NotificationPermissionEducation")}
          style={[styles.permissionButton, { borderColor: theme.border }]}
        >
          <Text style={[styles.permissionTitle, { color: theme.text }]}>{t("notificationPermissionTitle")}</Text>
          <Text style={[styles.permissionText, { color: theme.muted }]}>{t("notificationPermissionDescription")}</Text>
        </Pressable>

        {grouped.map(([category, categoryPreferences]) => (
          <View key={category} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.category, { color: theme.text }]}>{t(categoryKeys[category])}</Text>
            {categoryPreferences.map((preference) => (
              <View key={preference.channel} style={[styles.preference, { borderTopColor: theme.border }]}>
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={[styles.channel, { color: theme.text }]}>{t(channelKeys[preference.channel])}</Text>
                    {preference.mandatoryLocked ? (
                      <Text style={[styles.mandatory, { color: theme.primary }]}>{t("notificationMandatory")}</Text>
                    ) : null}
                  </View>
                  <Switch
                    accessibilityLabel={`${t(categoryKeys[category])} ${t(channelKeys[preference.channel])}`}
                    disabled={preference.mandatoryLocked}
                    onValueChange={(enabled) => toggle(category, preference.channel, enabled)}
                    value={preference.enabled}
                    trackColor={{ false: theme.border, true: theme.primary }}
                    thumbColor={preference.enabled ? theme.primaryText : theme.muted}
                  />
                </View>
                {preference.enabled && preference.channel !== "IN_APP" ? (
                  <View style={styles.deliveryOptions}>
                    <Text style={[styles.optionLabel, { color: theme.muted }]}>{t("notificationDeliveryMode")}</Text>
                    <View style={styles.segments}>
                      {(["IMMEDIATE", "DAILY", "WEEKLY"] as const).map((mode) => (
                        <Pressable
                          key={mode}
                          onPress={() => updatePreference(category, preference.channel, { digestMode: mode })}
                          style={[
                            styles.segment,
                            { borderColor: preference.digestMode === mode ? theme.primary : theme.border, backgroundColor: preference.digestMode === mode ? theme.badge : theme.card }
                          ]}
                        >
                          <Text style={[styles.segmentText, { color: preference.digestMode === mode ? theme.primary : theme.muted }]}>
                            {t(mode === "IMMEDIATE" ? "notificationImmediate" : mode === "DAILY" ? "notificationDailyDigest" : "notificationWeeklyDigest")}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={styles.quietRow}>
                      <View style={styles.timeField}>
                        <Text style={[styles.optionLabel, { color: theme.muted }]}>{t("notificationQuietStart")}</Text>
                        <TextInput
                          accessibilityLabel={t("notificationQuietStart")}
                          keyboardType="numbers-and-punctuation"
                          maxLength={5}
                          onChangeText={(value) => updatePreference(category, preference.channel, { quietHoursStart: /^\d{2}:\d{2}$/.test(value) ? value : null })}
                          placeholder="22:00"
                          placeholderTextColor={theme.muted}
                          style={[styles.timeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                          defaultValue={preference.quietHoursStart || ""}
                        />
                      </View>
                      <View style={styles.timeField}>
                        <Text style={[styles.optionLabel, { color: theme.muted }]}>{t("notificationQuietEnd")}</Text>
                        <TextInput
                          accessibilityLabel={t("notificationQuietEnd")}
                          keyboardType="numbers-and-punctuation"
                          maxLength={5}
                          onChangeText={(value) => updatePreference(category, preference.channel, { quietHoursEnd: /^\d{2}:\d{2}$/.test(value) ? value : null })}
                          placeholder="08:00"
                          placeholderTextColor={theme.muted}
                          style={[styles.timeInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                          defaultValue={preference.quietHoursEnd || ""}
                        />
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ))}

        <PrimaryButton title={t("savePreferences")} loading={saving} onPress={() => void save()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingVertical: 8 },
  centered: { alignItems: "center", justifyContent: "center" },
  content: { gap: 14, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: "900" },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 6 },
  card: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 4 },
  category: { fontSize: 17, fontWeight: "900", marginBottom: 8 },
  preference: { borderTopWidth: 1, paddingVertical: 8 },
  row: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 52 },
  rowText: { flex: 1, gap: 2, paddingRight: 12 },
  channel: { fontSize: 15, fontWeight: "700" },
  mandatory: { fontSize: 12, fontWeight: "800" },
  deliveryOptions: { gap: 10, paddingBottom: 10 },
  optionLabel: { fontSize: 12, fontWeight: "700" },
  segments: { flexDirection: "row", gap: 6 },
  segment: { alignItems: "center", borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 40, paddingHorizontal: 5 },
  segmentText: { fontSize: 11, fontWeight: "800", textAlign: "center" },
  quietRow: { flexDirection: "row", gap: 10 },
  timeField: { flex: 1, gap: 5 },
  timeInput: { borderRadius: 12, borderWidth: 1, fontSize: 15, minHeight: 46, paddingHorizontal: 12 },
  permissionButton: { borderRadius: 16, borderWidth: 1, gap: 4, padding: 14 },
  permissionTitle: { fontSize: 15, fontWeight: "900" },
  permissionText: { fontSize: 13, lineHeight: 18 }
});
