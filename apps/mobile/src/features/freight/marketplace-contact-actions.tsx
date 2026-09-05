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
};

export function MarketplaceContactActions({
  phone,
  canCall,
  canOpenWhatsApp,
  whatsappPrefilledMessage,
  contactAccess,
}: Props) {
  const navigation = useNavigation<BottomTabNavigationProp<AppTabParamList>>();
  const theme = useTheme();
  const locale = useSettingsStore((state) => state.locale);
  const isTurkish = locale === "tr";
  const callable = Boolean(phone && canCall);
  const whatsappReady = Boolean(phone && canOpenWhatsApp && whatsappPrefilledMessage);

  async function callAdvertiser() {
    if (!phone || !callable) return;
    Alert.alert(
      isTurkish ? "İlan vereni ara" : "Call advertiser",
      isTurkish ? `${phone} numarası aranacak.` : `${phone} will be called.`,
      [
        { text: isTurkish ? "Vazgeç" : "Cancel", style: "cancel" },
        { text: isTurkish ? "Ara" : "Call", onPress: () => void Linking.openURL(`tel:${phone}`) },
      ],
    );
  }

  async function openWhatsApp() {
    if (!phone || !whatsappReady || !whatsappPrefilledMessage) return;
    const digits = whatsappPhoneDigits(phone);
    if (!digits) {
      Alert.alert(isTurkish ? "WhatsApp açılamadı" : "Could not open WhatsApp");
      return;
    }
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(whatsappPrefilledMessage)}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        isTurkish ? "WhatsApp açılamadı" : "Could not open WhatsApp",
        isTurkish ? "WhatsApp'ın kurulu olduğundan emin olun." : "Make sure WhatsApp is installed.",
      );
    }
  }

  if (!callable && !whatsappReady) {
    if (contactAccess === "SUBSCRIPTION_REQUIRED") return <View style={{ gap: 12 }}><Text style={[styles.unavailable, { color: theme.muted }]}>{isTurkish ? "İletişim için geçerli deneme veya abonelik gerekir." : "Contact requires an active trial or subscription."}</Text><Pressable onPress={() => navigation.navigate("Profile", { screen: "Subscription" })} style={[styles.button, { backgroundColor: theme.primary, borderColor: theme.primary, flex: undefined }]}><Text style={[styles.buttonText, { color: theme.primaryText }]}>{isTurkish ? "Aboneliği görüntüle" : "View subscription"}</Text></Pressable></View>;
    return <Text style={[styles.unavailable, { color: theme.muted }]}>{isTurkish ? "İletişim bilgisi paylaşılmamış." : "Contact information is unavailable."}</Text>;
  }

  return (
    <View style={styles.row}>
      {callable ? (
        <ContactButton
          icon="call-outline"
          label={isTurkish ? "Ara" : "Call"}
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
  if (digits.length === 11 && digits.startsWith("0")) return `90${digits.slice(1)}`;
  return digits;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  button: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 16,
  },
  buttonText: { fontSize: 16, fontWeight: "900" },
  unavailable: { fontSize: 13, fontWeight: "700", textAlign: "center" },
});
