import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";

import { submitMobileFeedback, type MobileFeedbackType, type SubmitMobileFeedbackInput } from "@/api/mobileFeedback";
import { getCurrentAppVersion } from "@/api/mobileRelease";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

export function FeedbackScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const [type, setType] = useState<MobileFeedbackType>("BUG");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const cleanedSubject = subject.trim();
    const cleanedMessage = message.trim();
    if (cleanedSubject.length < 3 || cleanedMessage.length < 10) {
      Alert.alert(t("feedback"), t("feedbackValidation"));
      return;
    }

    setLoading(true);
    try {
      const payload: SubmitMobileFeedbackInput = {
        type,
        subject: cleanedSubject,
        message: cleanedMessage,
        appVersion: getCurrentAppVersion(),
        deviceInfo: {
          platform: Platform.OS,
          osVersion: Device.osVersion,
          modelName: Device.modelName,
          brand: Device.brand,
          manufacturer: Device.manufacturer,
          deviceName: Device.deviceName,
          appOwnership: Constants.appOwnership,
          channel: Constants.expoConfig?.extra?.environment || "development"
        }
      };
      const cleanedScreenshot = screenshot.trim();
      if (cleanedScreenshot) payload.screenshot = cleanedScreenshot;
      await submitMobileFeedback(payload);
      setSubject("");
      setMessage("");
      setScreenshot("");
      Alert.alert(t("feedbackSent"), t("feedbackSentDescription"));
    } catch (error) {
      Alert.alert(t("feedbackFailed"), error instanceof Error ? error.message : t("actionFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.eyebrow, { color: theme.primary }]}>{t("closedBeta")}</Text>
            <Text style={[styles.title, { color: theme.text }]}>{t("feedbackTitle")}</Text>
            <Text style={[styles.description, { color: theme.muted }]}>{t("feedbackDescription")}</Text>
            <View style={styles.typeRow}>
              <Choice label={t("reportBug")} active={type === "BUG"} onPress={() => setType("BUG")} />
              <Choice label={t("suggestFeature")} active={type === "FEATURE"} onPress={() => setType("FEATURE")} />
            </View>
          </View>

          <TextField label={t("feedbackSubject")} value={subject} onChangeText={setSubject} placeholder={t("feedbackSubjectPlaceholder")} />
          <TextField label={t("feedbackMessage")} value={message} onChangeText={setMessage} placeholder={t("feedbackMessagePlaceholder")} multiline numberOfLines={6} textAlignVertical="top" style={styles.textArea} />
          <TextField label={t("screenshotUrl")} value={screenshot} onChangeText={setScreenshot} placeholder="https://..." autoCapitalize="none" keyboardType="url" />

          <View style={[styles.deviceCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.deviceTitle, { color: theme.text }]}>{t("deviceInformation")}</Text>
            <Text style={[styles.deviceText, { color: theme.muted }]}>
              {Device.modelName || "Unknown"} · {Platform.OS} {Device.osVersion || ""} · {t("appVersion")} {getCurrentAppVersion()}
            </Text>
          </View>

          <PrimaryButton title={t("sendFeedback")} loading={loading} onPress={handleSubmit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.choice, { backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border }]}>
      <Text style={[styles.choiceText, { color: active ? theme.primaryText : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  content: { gap: 14, paddingBottom: 32 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 10 },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 2, textTransform: "uppercase" },
  title: { fontSize: 26, fontWeight: "900" },
  description: { fontSize: 14, lineHeight: 21 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  choice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  choiceText: { fontSize: 14, fontWeight: "900" },
  textArea: { minHeight: 132, paddingTop: 14 },
  deviceCard: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 6 },
  deviceTitle: { fontSize: 16, fontWeight: "900" },
  deviceText: { fontSize: 13, lineHeight: 20 }
});
