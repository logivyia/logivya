import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { useSupportStore } from "@/features/support/supportStore";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { SupportStackParamList } from "@/types/navigation";

const ticketTypes = ["TECHNICAL", "BILLING", "SUBSCRIPTION", "WHATSAPP", "OTHER"] as const;

export function CreateTicketScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<SupportStackParamList>>();
  const { saving, error, createTicket } = useSupportStore();
  const [subject, setSubject] = useState("");
  const [type, setType] = useState<(typeof ticketTypes)[number]>("TECHNICAL");
  const [message, setMessage] = useState("");
  const [validation, setValidation] = useState<string | null>(null);

  const submit = async () => {
    if (subject.trim().length < 3 || message.trim().length < 5) {
      setValidation(t("supportValidation"));
      return;
    }
    const ticket = await createTicket({ subject: subject.trim(), type, message: message.trim() });
    if (ticket) navigation.replace("TicketDetail", { ticketId: ticket.id });
  };

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
        <Text style={[styles.title, { color: theme.text }]}>{t("createTicket")}</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>{t("createTicketSubtitle")}</Text>
        <TextField label={t("ticketSubject")} value={subject} onChangeText={setSubject} />
        <View style={styles.block}>
          <Text style={[styles.label, { color: theme.text }]}>{t("ticketCategory")}</Text>
          <View style={styles.chips}>
            {ticketTypes.map((item) => {
              const active = item === type;
              return (
                <Pressable key={item} accessibilityRole="button" onPress={() => setType(item)} style={[styles.chip, { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border }]}>
                  <Text style={[styles.chipText, { color: active ? theme.primaryText : theme.text }]}>{ticketTypeLabel(item, t)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <TextField label={t("ticketDescription")} value={message} onChangeText={setMessage} multiline style={styles.messageInput} />
        {validation ? <Text style={styles.error}>{validation}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton title={t("createTicket")} loading={saving} onPress={submit} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ticketTypeLabel(type: string, t: ReturnType<typeof useTranslation>["t"]) {
  if (type === "BILLING") return t("ticketBilling");
  if (type === "SUBSCRIPTION") return t("ticketSubscription");
  if (type === "WHATSAPP") return t("ticketWhatsapp");
  if (type === "OTHER") return t("ticketOther");
  return t("ticketTechnical");
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, paddingVertical: 16 },
  container: { flex: 1, gap: 16 },
  title: { fontSize: 30, fontWeight: "900" },
  subtitle: { fontSize: 15, lineHeight: 22 },
  block: { gap: 8 },
  label: { fontSize: 14, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  chipText: { fontSize: 13, fontWeight: "800" },
  messageInput: { minHeight: 140, textAlignVertical: "top" },
  error: { color: "#dc2626", fontWeight: "800" }
});
