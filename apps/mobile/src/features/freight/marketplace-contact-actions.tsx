import { productJourneyCopy } from "../../../../../shared/product-journey-copy";
import { Ionicons } from "@expo/vector-icons";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { useSettingsStore } from "@/auth/settings-store";
import { useTheme } from "@/theme/theme-provider";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { AppTabParamList } from "@/types/navigation";

type Props = {
  phone: string | null;
  canCall: boolean;
  canOpenWhatsApp: boolean;
  whatsappPrefilledMessage: string | null;
  contactAccess?: string | undefined;
  telegramHref?: string | null | undefined;
};

export function MarketplaceContactActions({
  phone,
  canCall,
  canOpenWhatsApp,
  whatsappPrefilledMessage,
  contactAccess,
  telegramHref,
}: Props) {
  const navigation = useNavigation<BottomTabNavigationProp<AppTabParamList>>();
  const theme = useTheme();
  const locale = useSettingsStore((state) => state.locale);
  const copy = productJourneyCopy(locale);
  const telegramReady = Boolean(telegramHref && /^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegramHref));
  const callable = Boolean(phone && /^\+[1-9]\d{6,14}$/.test(phone) && canCall);
  const whatsappReady = Boolean(phone && /^\+[1-9]\d{6,14}$/.test(phone) && canOpenWhatsApp && whatsappPrefilledMessage);

  async function callAdvertiser() {
    if (!phone || !callable) return;
    Alert.alert(
      copy.callAdvertiser,
      phone,
      [
        { text: copy.cancel, style: "cancel" },
        { text: copy.call, onPress: () => void Linking.openURL(`tel:${phone}`).catch(() => Alert.alert(copy.openError)) },
      ],
    );
  }

  async function openWhatsApp() {
    if (!phone || !whatsappReady || !whatsappPrefilledMessage) return;
    const digits = whatsappPhoneDigits(phone);
    if (!digits) {
      Alert.alert(copy.openError);
      return;
    }
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(whatsappPrefilledMessage)}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        copy.openError,
        "WhatsApp",
      );
    }
  }

  if (!callable && !whatsappReady && !telegramReady) {
    if (contactAccess === "SUBSCRIPTION_REQUIRED") return <View style={{ gap: 12 }}><Text style={[styles.unavailable, { color: theme.muted }]}>{copy.contactRequired}</Text><Pressable onPress={() => navigation.navigate("Profile", { screen: "Subscription" })} style={[styles.button, { backgroundColor: theme.primary, borderColor: theme.primary, flex: undefined }]}><Text style={[styles.buttonText, { color: theme.primaryText }]}>{copy.subscribe}</Text></Pressable></View>;
    return <Text style={[styles.unavailable, { color: theme.muted }]}>{copy.contactMissing}</Text>;
  }

  return (
    <View style={styles.row}>
      {telegramReady && <ContactButton icon="paper-plane-outline" label="Telegram" onPress={() => void Linking.openURL(telegramHref!).catch(() => Alert.alert(copy.openError))} backgroundColor={theme.card} borderColor={theme.border} color={theme.text} />}
      {callable ? (
        <ContactButton
          icon="call-outline"
          label={copy.call}
          onPress={() => void callAdvertiser()}
          backgroundColor={theme.primary}
          borderColor={theme.primary}
          color={theme.primaryText}
        />
      ) : null}
      {whatsappReady ? (
        <ContactButton
          icon="logo-whatsapp"
          label="WhatsApp"
          onPress={() => void openWhatsApp()}
          backgroundColor={theme.card}
          borderColor={theme.border}
          color={theme.text}
        />
      ) : null}
    </View>
  );
}

function ContactButton({
  icon,
  label,
  onPress,
  backgroundColor,
  borderColor,
  color,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  backgroundColor: string;
  borderColor: string;
  color: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor, borderColor, opacity: pressed ? 0.82 : 1 }]}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function whatsappPhoneDigits(phone: string) {
  const digits = phone.replace(/\D/gu, "");
  if (digits.startsWith("00")) return digits.slice(2);

  return digits;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  button: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexGrow: 1,
    flexBasis: "40%",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 16,
  },
  buttonText: { fontSize: 16, fontWeight: "900" },
  unavailable: { fontSize: 13, fontWeight: "700", textAlign: "center" },
});
