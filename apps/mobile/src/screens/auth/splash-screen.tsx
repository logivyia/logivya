import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { BrandHeader } from "@/components/brand-header";
import { Screen } from "@/components/screen";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

export function SplashScreen() {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Screen style={styles.container}>
      <BrandHeader />
      <View style={styles.loading}>
        <ActivityIndicator color={theme.primary} />
        <Text style={[styles.text, { color: theme.muted }]}>{t("appPreparing")}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center"
  },
  loading: {
    alignItems: "center",
    gap: 12
  },
  text: {
    fontSize: 14,
    fontWeight: "600"
  }
});
