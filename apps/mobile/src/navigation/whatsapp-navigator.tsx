import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { FeatureErrorBoundary } from "@/components/feature-error-boundary";
import { WhatsAppScreen } from "@/screens/app/whatsapp-screen";
import { WhatsAppPhoneConnectScreen } from "@/screens/app/whatsapp-phone-connect-screen";
import { WhatsAppQRScreen } from "@/screens/app/whatsapp-qr-screen";
import { useTranslation } from "@/i18n/use-translation";
import type { WhatsAppStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<WhatsAppStackParamList>();

function WhatsAppPhoneConnectFeatureScreen() {
  return <FeatureErrorBoundary feature="whatsapp-phone-connect"><WhatsAppPhoneConnectScreen /></FeatureErrorBoundary>;
}

export function WhatsAppNavigator() {
  const { t } = useTranslation();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WhatsAppAccounts" component={WhatsAppScreen} options={{ title: t("whatsappAccounts") }} />
      <Stack.Screen name="WhatsAppQR" component={WhatsAppQRScreen} options={{ title: t("connectWithQr") }} />
      <Stack.Screen name="WhatsAppPhoneConnect" component={WhatsAppPhoneConnectFeatureScreen} options={{ title: t("connectWithPhoneCode") }} />
    </Stack.Navigator>
  );
}
