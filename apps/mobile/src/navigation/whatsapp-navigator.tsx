import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { WhatsAppScreen } from "@/screens/app/whatsapp-screen";
import { WhatsAppPhoneConnectScreen } from "@/screens/app/whatsapp-phone-connect-screen";
import { WhatsAppQRScreen } from "@/screens/app/whatsapp-qr-screen";
import { useTranslation } from "@/i18n/use-translation";
import type { WhatsAppStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<WhatsAppStackParamList>();

export function WhatsAppNavigator() {
  const { t } = useTranslation();

  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen name="WhatsAppAccounts" component={WhatsAppScreen} options={{ title: t("whatsappAccounts") }} />
      <Stack.Screen name="WhatsAppQR" component={WhatsAppQRScreen} options={{ title: t("connectWithQr") }} />
      <Stack.Screen name="WhatsAppPhoneConnect" component={WhatsAppPhoneConnectScreen} options={{ title: t("connectWithPhoneCode") }} />
    </Stack.Navigator>
  );
}
