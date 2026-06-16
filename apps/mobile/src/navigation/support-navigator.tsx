import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { CreateTicketScreen } from "@/screens/app/create-ticket-screen";
import { SupportScreen } from "@/screens/app/support-screen";
import { TicketDetailScreen } from "@/screens/app/ticket-detail-screen";
import { useTranslation } from "@/i18n/use-translation";
import type { SupportStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<SupportStackParamList>();

export function SupportNavigator() {
  const { t } = useTranslation();

  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen name="SupportTickets" component={SupportScreen} options={{ title: t("support") }} />
      <Stack.Screen name="CreateTicket" component={CreateTicketScreen} options={{ title: t("createTicket") }} />
      <Stack.Screen name="TicketDetail" component={TicketDetailScreen} options={{ title: t("ticketDetail") }} />
    </Stack.Navigator>
  );
}
