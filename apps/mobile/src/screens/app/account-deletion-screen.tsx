import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { deleteAccountRequest } from "@/api/account-api";
import { clearMobileSessionState } from "@/auth/session-cleanup";
import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { colors } from "@/theme/colors";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

export function AccountDeletionScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const confirmationText = t("accountClosurePhrase");
  const canSubmit = confirmation === confirmationText;

  async function submit() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await deleteAccountRequest(confirmation);
      await clearMobileSessionState();
      Alert.alert(t("requestReceived"), t("accountDisabledDescription"));
    } catch (error) {
      Alert.alert(t("accountDeleteFailed"), error instanceof Error ? error.message : t("operationFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.warningCard, { backgroundColor: theme.card, borderColor: colors.danger }]}>
          <Text style={[styles.title, { color: theme.text }]}>{t("deleteAccount")}</Text>
          <Text style={[styles.description, { color: theme.muted }]}>{t("accountDeleteFullWarning")}</Text>
          <Text style={[styles.confirmationLabel, { color: theme.text }]}>{t("confirmationPrompt")}</Text>
          <Text style={[styles.confirmationText, { color: colors.danger }]}>{confirmationText}</Text>
          <TextField label={t("confirmationTextLabel")} value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" />
        </View>
        <PrimaryButton title={t("closeAccount")} loading={loading} disabled={!canSubmit} onPress={submit} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  content: { gap: 16, paddingBottom: 32 },
  warningCard: { borderWidth: 1, borderRadius: 24, gap: 14, padding: 18 },
  title: { fontSize: 26, fontWeight: "900" },
  description: { fontSize: 14, lineHeight: 21 },
  confirmationLabel: { fontSize: 14, fontWeight: "900" },
  confirmationText: { fontSize: 15, fontWeight: "900" }
});
