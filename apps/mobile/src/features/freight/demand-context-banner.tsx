import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { SurfaceCard } from "@/components/ui";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";

export function DemandContextBanner({ requestId }: { requestId: string | null }) {
  const theme = useTheme();
  const { t } = useTranslation();
  if (!requestId) return null;

  return (
    <SurfaceCard style={[styles.card, { borderColor: theme.success }]}>
      <Ionicons name="checkmark-circle" size={24} color={theme.success} />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: theme.text }]}>{t("matchingListings")}</Text>
        <Text style={[styles.description, { color: theme.muted }]}>{t("demandMatchesDescription")}</Text>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "flex-start", borderWidth: 1, flexDirection: "row", gap: 10 },
  copy: { flex: 1, gap: 3 },
  title: { fontSize: 14, fontWeight: "900" },
  description: { fontSize: 12, lineHeight: 18 },
});
