import { useCallback } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { useSupportStore } from "@/features/support/supportStore";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { MobileTicketListItem } from "@/api/mobileSupport";
import type { SupportStackParamList } from "@/types/navigation";

export function SupportScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<SupportStackParamList>>();
  const { tickets, loading, refreshing, error, load, refresh } = useSupportStore();

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (loading && tickets.length === 0) {
    return (
      <Screen>
        <LoadingState label={t("loadingSupport")} />
      </Screen>
    );
  }

  if (error && tickets.length === 0) {
    return (
      <Screen>
        <ErrorState title={error} onRetry={load} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <FlatList
        data={tickets}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.eyebrow, { color: theme.primary }]}>{t("supportCenter")}</Text>
            <Text style={[styles.title, { color: theme.text }]}>{t("supportTickets")}</Text>
            <Text style={[styles.subtitle, { color: theme.muted }]}>{t("supportSubtitle")}</Text>
            <PrimaryButton title={t("createTicket")} onPress={() => navigation.navigate("CreateTicket")} />
          </View>
        }
        ListEmptyComponent={<EmptyState title={t("noTicketsFound")} description={t("noTicketsFoundDescription")} />}
        renderItem={({ item }) => <TicketCard ticket={item} onPress={() => navigation.navigate("TicketDetail", { ticketId: item.id })} />}
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

function TicketCard({ ticket, onPress }: { ticket: MobileTicketListItem; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const latest = ticket.messages?.[0]?.message;

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.rowBetween}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{ticket.subject}</Text>
        <Text style={[styles.status, { color: statusColor(ticket.status) }]}>{supportStatusLabel(ticket.status, t)}</Text>
      </View>
      <Text style={[styles.meta, { color: theme.muted }]}>{ticket.type}</Text>
      {latest ? <Text style={[styles.preview, { color: theme.muted }]} numberOfLines={2}>{latest}</Text> : null}
      <Text style={[styles.meta, { color: theme.muted }]}>{new Date(ticket.lastMessageAt ?? ticket.createdAt).toLocaleDateString()}</Text>
    </Pressable>
  );
}

function supportStatusLabel(status: string, t: ReturnType<typeof useTranslation>["t"]) {
  if (status === "CLOSED") return t("supportClosed");
  if (status === "IN_PROGRESS") return t("supportInProgress");
  if (status === "RESOLVED") return t("supportResolved");
  return t("supportOpen");
}

function statusColor(status: string) {
  if (status === "CLOSED") return "#64748b";
  if (status === "RESOLVED") return "#059669";
  return "#f97316";
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  list: { gap: 14, paddingBottom: 32 },
  header: { gap: 14 },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 3, textTransform: "uppercase" },
  title: { fontSize: 30, fontWeight: "900" },
  subtitle: { fontSize: 15, lineHeight: 22 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 10 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  cardTitle: { flex: 1, fontSize: 18, fontWeight: "900" },
  status: { fontSize: 12, fontWeight: "900" },
  meta: { fontSize: 13, fontWeight: "700" },
  preview: { fontSize: 14, lineHeight: 20 }
});
