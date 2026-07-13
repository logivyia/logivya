import { useCallback, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";

import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { ErrorState } from "@/components/state/error-state";
import { LoadingState } from "@/components/state/loading-state";
import { TextField } from "@/components/text-field";
import { useSupportStore } from "@/features/support/supportStore";
import { useTranslation } from "@/i18n/use-translation";
import { formatDateTime } from "@/i18n/format";
import type { TranslationKey } from "@/i18n/translations";
import { useTheme } from "@/theme/theme-provider";
import type { SupportStackParamList } from "@/types/navigation";

const SUPPORT_STATUS_KEYS: Record<string, TranslationKey> = {
  OPEN: "supportOpen",
  PENDING: "supportWaitingForAdmin",
  IN_PROGRESS: "supportInProgress",
  WAITING_FOR_ADMIN: "supportWaitingForAdmin",
  ANSWERED: "supportWaitingForUser",
  WAITING_FOR_USER: "supportWaitingForUser",
  RESOLVED: "supportResolved",
  CLOSED: "supportClosed"
};

function supportStatusLabel(status: string, t: (key: TranslationKey) => string) {
  const key = SUPPORT_STATUS_KEYS[status];
  return key ? t(key) : t("unknown");
}

export function TicketDetailScreen() {
  const theme = useTheme();
  const { locale, t } = useTranslation();
  const route = useRoute<RouteProp<SupportStackParamList, "TicketDetail">>();
  const { ticketId } = route.params;
  const { selectedTicket, loading, saving, error, success, hasOlderMessages, clearFeedback, loadTicket, loadOlderMessages, reply } = useSupportStore();
  const [message, setMessage] = useState("");
  const isClosed = selectedTicket?.status === "CLOSED";

  useFocusEffect(
    useCallback(() => {
      void loadTicket(ticketId);
      return () => clearFeedback();
    }, [clearFeedback, loadTicket, ticketId])
  );

  const submit = async () => {
    if (saving || !message.trim()) return;
    const ok = await reply(ticketId, message.trim());
    if (ok) setMessage("");
  };

  if (loading && !selectedTicket) {
    return (
      <Screen>
        <LoadingState label={t("loadingSupport")} />
      </Screen>
    );
  }

  if (error && !selectedTicket) {
    return (
      <Screen>
        <ErrorState title={error} onRetry={() => void loadTicket(ticketId)} />
      </Screen>
    );
  }

  if (!selectedTicket) return null;

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <FlatList
          data={selectedTicket.messages ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void loadTicket(ticketId)} tintColor={theme.primary} />}
          ListHeaderComponent={
            <View style={styles.header}>
              {success ? <Text style={[styles.feedback, { backgroundColor: theme.successSoft, color: theme.success }]}>{success}</Text> : null}
              {error ? <Text style={[styles.feedback, { backgroundColor: theme.dangerSoft, color: theme.danger }]}>{error}</Text> : null}
              <View style={[styles.headerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.title, { color: theme.text }]}>{selectedTicket.subject}</Text>
                <Text style={[styles.meta, { color: theme.muted }]}>{t("ticketNumber")}: {selectedTicket.publicId || selectedTicket.id}</Text>
                <Text style={[styles.meta, { color: theme.muted }]}>{selectedTicket.category || selectedTicket.type} · {supportStatusLabel(selectedTicket.status, t)}</Text>
                {selectedTicket.createdBy?.email ? <Text style={[styles.meta, { color: theme.muted }]}>{selectedTicket.createdBy.email}</Text> : null}
              </View>
              {hasOlderMessages ? <PrimaryButton title={t("loadOlderMessages")} loading={loading} disabled={loading} onPress={() => void loadOlderMessages(ticketId)} /> : null}
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.senderType === "USER" || item.senderType === "CUSTOMER";
            return (
              <View style={[styles.bubble, { alignSelf: mine ? "flex-end" : "flex-start", backgroundColor: mine ? theme.primary : theme.card, borderColor: theme.border }]}>
                <Text style={[styles.messageAuthor, { color: mine ? theme.primaryText : theme.muted }]}>{mine ? t("you") : t("logivyaSupport")}</Text>
                <Text style={[styles.message, { color: mine ? theme.primaryText : theme.text }]}>{item.message}</Text>
                <Text style={[styles.messageDate, { color: mine ? theme.primaryText : theme.muted }]}>{formatDateTime(item.createdAt, locale)}</Text>
              </View>
            );
          }}
          contentContainerStyle={styles.list}
        />
        <View style={styles.replyBox}>
          {isClosed ? <Text style={[styles.closedNotice, { color: theme.muted, backgroundColor: theme.badge }]}>{t("ticketClosedReplyDisabled")}</Text> : null}
          <TextField label={t("reply")} value={message} onChangeText={setMessage} multiline editable={!isClosed} />
          <PrimaryButton title={t("sendReply")} loading={saving} disabled={saving || !message.trim() || isClosed} onPress={submit} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  header: { gap: 10 },
  list: { gap: 12, paddingBottom: 18 },
  headerCard: { borderWidth: 1, borderRadius: 8, padding: 18, gap: 8 },
  title: { fontSize: 24, fontWeight: "900" },
  meta: { fontSize: 13, fontWeight: "700" },
  feedback: { borderRadius: 14, fontSize: 13, fontWeight: "800", padding: 12 },
  bubble: { maxWidth: "86%", borderWidth: 1, borderRadius: 8, padding: 14, gap: 6 },
  messageAuthor: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  message: { fontSize: 15, lineHeight: 21 },
  messageDate: { fontSize: 11, fontWeight: "700" },
  replyBox: { gap: 10 },
  closedNotice: { borderRadius: 14, fontSize: 13, fontWeight: "800", padding: 12 }
});
