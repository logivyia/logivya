import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { PrimaryButton } from "@/components/primary-button";
import { Screen } from "@/components/screen";
import { TextField } from "@/components/text-field";
import { useSupportStore } from "@/features/support/supportStore";
import { useTranslation } from "@/i18n/use-translation";
import { useTheme } from "@/theme/theme-provider";
import type { SupportStackParamList } from "@/types/navigation";

const ticketTypes = [
  "TECHNICAL",
  "WHATSAPP_CONNECTION",
  "MESSAGE_DELIVERY",
  "DELETE_FOR_EVERYONE",
  "ACCOUNT",
  "SUBSCRIPTION",
  "BILLING",
  "TEAM",
  "SECURITY",
  "FEATURE_REQUEST",
  "OTHER",
] as const;

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
    if (saving) return;
    const normalizedSubject = subject.trim();
    const normalizedMessage = message.trim();
    if (normalizedSubject.length < 3) {
      setValidation(t("subjectMinLength"));
      return;
    }
    if (normalizedMessage.length < 5) {
      setValidation(t("descriptionMinLength"));
      return;
    }
    setValidation(null);
    const ticket = await createTicket({ subject: normalizedSubject, category: type, message: normalizedMessage });
    if (ticket) navigation.replace("TicketDetail", { ticketId: ticket.publicId || ticket.id });
  };

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 96 : 0} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: theme.text }]}>{t("createTicket")}</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>{t("createTicketSubtitle")}</Text>
          <TextField
            label={t("ticketSubject")}
            value={subject}
            onChangeText={(value) => {
              setSubject(value);
              if (validation) setValidation(null);
            }}
            placeholder={t("ticketSubject")}
            returnKeyType="next"
          />
          <View style={styles.block}>
            <Text style={[styles.label, { color: theme.text }]}>{t("ticketCategory")}</Text>
            <View style={styles.chips}>
              {ticketTypes.map((item) => {
                const active = item === type;
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    onPress={() => setType(item)}
                    style={[styles.chip, { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border }]}
                  >
                    <Text style={[styles.chipText, { color: active ? theme.primaryText : theme.text }]}>{ticketTypeLabel(item, t)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <TextField
            label={t("ticketDescription")}
            value={message}
            onChangeText={(value) => {
              setMessage(value);
              if (validation) setValidation(null);
            }}
            placeholder={t("issueDetailsPlaceholder")}
            multiline
            numberOfLines={7}
            style={styles.messageInput}
            textAlignVertical="top"
          />
          {validation ? <Text style={[styles.error, { color: theme.danger }]}>{validation}</Text> : null}
          {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
          <PrimaryButton title={t("createTicket")} loading={saving} disabled={saving} onPress={submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ticketTypeLabel(type: string, t: ReturnType<typeof useTranslation>["t"]) {
  if (type === "BILLING") return t("ticketBilling");
  if (type === "SUBSCRIPTION") return t("ticketSubscription");
  if (type === "WHATSAPP_CONNECTION") return t("ticketWhatsapp");
  if (type === "MESSAGE_DELIVERY") return t("ticketMessageDelivery");
  if (type === "DELETE_FOR_EVERYONE") return t("ticketDeleteForEveryone");
  if (type === "ACCOUNT") return t("ticketAccount");
  if (type === "TEAM") return t("ticketTeam");
  if (type === "SECURITY") return t("ticketSecurity");
  if (type === "FEATURE_REQUEST") return t("ticketFeatureRequest");
  if (type === "OTHER") return t("ticketOther");
  return t("ticketTechnical");
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
    paddingVertical: 16
  },
  container: {
    flex: 1
  },
  content: {
    gap: 16,
    paddingBottom: 42
  },
  title: {
    fontSize: 30,
    fontWeight: "900"
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22
  },
  block: {
    gap: 8
  },
  label: {
    fontSize: 14,
    fontWeight: "800"
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  chipText: {
    fontSize: 13,
    fontWeight: "800"
  },
  messageInput: {
    minHeight: 156,
    paddingTop: 14
  },
  error: {
    fontWeight: "800"
  }
});
