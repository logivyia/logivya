import { useCallback } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { Badge, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { EmptyState } from "@/components/state/empty-state";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { useSupportStore } from "@/features/support/supportStore";
import { useTranslation } from "@/i18n/use-translation";
import { formatDate } from "@/i18n/format";
import { useTheme } from "@/theme/theme-provider";
import type { MobileTicketListItem } from "@/api/mobileSupport";
import type { SupportStackParamList } from "@/types/navigation";

export function SupportScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<SupportStackParamList>>();
  const { tickets, loading, refreshing, error, hasMore, load, loadMore, refresh } = useSupportStore();
  const openTickets = tickets.filter((ticket) => ticket.status !== "CLOSED" && ticket.status !== "RESOLVED").length;

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void refresh(), 20_000);
      return () => clearInterval(timer);
    }, [load, refresh])
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
            <PageHeader eyebrow={t("supportCenter")} title={t("supportTickets")} description={t("supportSubtitle")} />

            <View style={styles.grid}>
              <StatCard icon="ticket-outline" label={t("openTickets")} value={openTickets} tone="warning" />
              <StatCard icon="chatbubbles-outline" label={t("conversations")} value={tickets.length} />
              <StatCard icon="pulse-outline" label={t("system")} value={t("active")} tone="success" />
            </View>

            <PrimaryButton icon="add-circle-outline" title={t("createTicket")} onPress={() => navigation.navigate("CreateTicket")} />

            <SectionTitle title={t("tickets")} />
          </View>
        }
        ListEmptyComponent={<EmptyState title={t("noTicketsFound")} description={t("noTicketsFoundDescription")} />}
        ListFooterComponent={hasMore ? <PrimaryButton title={t("loadMore")} loading={loading} disabled={loading} onPress={loadMore} /> : null}
        onEndReached={() => {
          if (hasMore && !loading) void loadMore();
        }}
        onEndReachedThreshold={0.35}
        renderItem={({ item }) => <TicketCard ticket={item} onPress={() => navigation.navigate("TicketDetail", { ticketId: item.publicId || item.id })} />}
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

function TicketCard({ ticket, onPress }: { ticket: MobileTicketListItem; onPress: () => void }) {
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const latest = ticket.messages?.[0]?.message;
  const unread = ticket.unreadReplyCount || ticket.userUnreadCount || 0;

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.rowBetween}>
        <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>{ticket.subject}</Text>
        <View style={styles.badges}>
          {unread ? <Badge label={`${t("unreadReplies")}: ${unread}`} tone="warning" /> : null}
          <Badge label={supportStatusLabel(ticket.status, t)} tone={statusTone(ticket.status)} />
        </View>
      </View>
      <Text style={[styles.meta, { color: theme.muted }]}>{ticket.publicId || ticket.id} · {ticketCategoryLabel(ticket.category || ticket.type, t)}</Text>
      {latest ? <Text style={[styles.preview, { color: theme.muted }]} numberOfLines={2}>{latest}</Text> : null}
      <Text style={[styles.meta, { color: theme.muted }]}>{formatDate(ticket.lastMessageAt ?? ticket.createdAt, locale)}</Text>
    </Pressable>
  );
}

function supportStatusLabel(status: string, t: ReturnType<typeof useTranslation>["t"]) {
  if (status === "CLOSED") return t("supportClosed");
  if (status === "IN_PROGRESS") return t("supportInProgress");
  if (status === "WAITING_FOR_USER" || status === "ANSWERED") return t("supportWaitingForUser");
  if (status === "WAITING_FOR_ADMIN" || status === "PENDING") return t("supportWaitingForAdmin");
  if (status === "RESOLVED") return t("supportResolved");
  return t("supportOpen");
}

function ticketCategoryLabel(category: string, t: ReturnType<typeof useTranslation>["t"]) {
  if (category === "WHATSAPP_CONNECTION" || category === "WHATSAPP") return t("ticketWhatsapp");
  if (category === "MESSAGE_DELIVERY") return t("ticketMessageDelivery");
  if (category === "DELETE_FOR_EVERYONE") return t("ticketDeleteForEveryone");
  if (category === "ACCOUNT") return t("ticketAccount");
  if (category === "SUBSCRIPTION") return t("ticketSubscription");
  if (category === "BILLING") return t("ticketBilling");
  if (category === "TEAM") return t("ticketTeam");
  if (category === "SECURITY") return t("ticketSecurity");
  if (category === "FEATURE_REQUEST") return t("ticketFeatureRequest");
  if (category === "OTHER") return t("ticketOther");
  return t("ticketTechnical");
}

function statusTone(status: string) {
  if (status === "CLOSED") return "default" as const;
  if (status === "RESOLVED" || status === "ANSWERED") return "success" as const;
  return "warning" as const;
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
    paddingVertical: 16
  },
  list: {
    gap: 14,
    paddingBottom: 32
  },
  header: {
    gap: 14
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 18
  },
  rowBetween: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  badges: {
    alignItems: "flex-end",
    gap: 6
  },
  cardTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "900"
  },
  meta: {
    fontSize: 13,
    fontWeight: "700"
  },
  preview: {
    fontSize: 14,
    lineHeight: 20
  }
});
