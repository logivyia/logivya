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
import type { TranslationKey } from "@/i18n/translations";
import { useTheme } from "@/theme/theme-provider";
import type { SupportStackParamList } from "@/types/navigation";

const SUPPORT_STATUS_KEYS: Record<string, TranslationKey> = {
  OPEN: "supportOpen",
  IN_PROGRESS: "supportInProgress",
  RESOLVED: "supportResolved",
  CLOSED: "supportClosed"
};

function supportStatusLabel(status: string, t: (key: TranslationKey) => string) {
  const key = SUPPORT_STATUS_KEYS[status];
  return key ? t(key) : t("unknown");
}

export function TicketDetailScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const route = useRoute<RouteProp<SupportStackParamList, "TicketDetail">>();
  const { ticketId } = route.params;
  const { selectedTicket, loading, saving, error, loadTicket, reply } = useSupportStore();
  const [message, setMessage] = useState("");

  useFocusEffect(
    useCallback(() => {
      void loadTicket(ticketId);
    }, [loadTicket, ticketId])
  );

  const submit = async () => {
    if (!message.trim()) return;
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
            <View style={[styles.headerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.title, { color: theme.text }]}>{selectedTicket.subject}</Text>
              <Text style={[styles.meta, { color: theme.muted }]}>{selectedTicket.type} · {supportStatusLabel(selectedTicket.status, t)}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.senderType === "CUSTOMER";
            return (
              <View style={[styles.bubble, { alignSelf: mine ? "flex-end" : "flex-start", backgroundColor: mine ? theme.primary : theme.card, borderColor: theme.border }]}>
                <Text style={[styles.message, { color: mine ? theme.primaryText : theme.text }]}>{item.message}</Text>
                <Text style={[styles.messageDate, { color: mine ? theme.primaryText : theme.muted }]}>{new Date(item.createdAt).toLocaleString()}</Text>
              </View>
            );
          }}
          contentContainerStyle={styles.list}
        />
        <View style={styles.replyBox}>
          <TextField label={t("reply")} value={message} onChangeText={setMessage} multiline />
          <PrimaryButton title={t("sendReply")} loading={saving} disabled={!message.trim()} onPress={submit} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  list: { gap: 12, paddingBottom: 18 },
  headerCard: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 8 },
  title: { fontSize: 24, fontWeight: "900" },
  meta: { fontSize: 13, fontWeight: "700" },
  bubble: { maxWidth: "86%", borderWidth: 1, borderRadius: 20, padding: 14, gap: 6 },
  message: { fontSize: 15, lineHeight: 21 },
  messageDate: { fontSize: 11, fontWeight: "700" },
  replyBox: { gap: 10 }
});
