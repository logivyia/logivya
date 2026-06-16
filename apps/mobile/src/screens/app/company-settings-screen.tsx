import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useAuthStore } from "@/auth/auth-store";
import { Screen } from "@/components/screen";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

export function CompanySettingsScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const company = useAuthStore((state) => state.company);

  const rows = [
    [t("companyName"), company?.name],
    [t("companyPhone"), null],
    [t("companyAddress"), null],
    [t("taxOffice"), null],
    [t("taxNumber"), null],
    [t("city"), null],
    [t("district"), null],
    [t("country"), null],
    [t("postalCode"), null]
  ] as const;

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>{t("companySettings")}</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>{t("companySettingsReadonly")}</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
              <Text style={[styles.value, { color: theme.text }]}>{value || t("notProvided")}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  content: { gap: 14, paddingBottom: 32 },
  title: { fontSize: 30, fontWeight: "900" },
  subtitle: { fontSize: 15, lineHeight: 22 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 14 },
  row: { gap: 4 },
  label: { fontSize: 13, fontWeight: "800" },
  value: { fontSize: 16, fontWeight: "800" }
});
