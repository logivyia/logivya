import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useTranslation } from "@/i18n/use-translation";
import { CreateDriverScreen, DriverDetailsScreen, DriverSearchScreen, EditDriverScreen } from "@/screens/app/driver-marketplace-screens";
import type { DriverMarketplaceStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<DriverMarketplaceStackParamList>();

export function DriverMarketplaceNavigator() {
  const { t } = useTranslation();
  return <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="DriverSearch" component={DriverSearchScreen} options={{ title: t("findDriver") }} />
    <Stack.Screen name="CreateDriver" component={CreateDriverScreen} options={{ title: t("postDriverListing") }} />
    <Stack.Screen name="DriverDetails" component={DriverDetailsScreen} options={{ title: t("driverListing") }} />
    <Stack.Screen name="EditDriver" component={EditDriverScreen} options={{ title: t("editDriverListing") }} />
  </Stack.Navigator>;
}
