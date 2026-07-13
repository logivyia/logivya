import { StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

export function ErrorState({ title, onRetry }: { title: string; onRetry: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.container, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.description, { color: theme.muted }]}>{t("actionFailed")}</Text>
      <PrimaryButton title={t("retry")} onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    gap: 14
  },
  title: {
    fontSize: 20,
    fontWeight: "800"
  },
  description: {
    fontSize: 15,
    lineHeight: 22
  }
});
