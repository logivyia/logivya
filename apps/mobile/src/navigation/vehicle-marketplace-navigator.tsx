import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useTranslation } from "@/i18n/use-translation";
import { CreateVehicleScreen, EditVehicleScreen, VehicleDetailsScreen, VehicleSearchScreen } from "@/screens/app/vehicle-marketplace-screens";
import type { VehicleMarketplaceStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<VehicleMarketplaceStackParamList>();
const CreateVehicleStack = createNativeStackNavigator<VehicleMarketplaceStackParamList>();

export function VehicleMarketplaceNavigator() {
  const { t } = useTranslation();
  return <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="VehicleSearch" component={VehicleSearchScreen} options={{ title: t("findVehicle") }} />
    <Stack.Screen name="CreateVehicle" component={CreateVehicleScreen} options={{ title: t("shareVehicle") }} />
    <Stack.Screen name="VehicleDetails" component={VehicleDetailsScreen} options={{ title: t("vehicleListing") }} />
    <Stack.Screen name="EditVehicle" component={EditVehicleScreen} options={{ title: t("editVehicleListing") }} />
  </Stack.Navigator>;
}

export function CreateVehicleNavigator() {
  const { t } = useTranslation();
  return <CreateVehicleStack.Navigator initialRouteName="CreateVehicle" screenOptions={{ headerShown: false }}>
    <CreateVehicleStack.Screen name="CreateVehicle" component={CreateVehicleScreen} options={{ title: t("shareVehicle") }} />
    <CreateVehicleStack.Screen name="VehicleSearch" component={VehicleSearchScreen} options={{ title: t("findVehicle") }} />
    <CreateVehicleStack.Screen name="VehicleDetails" component={VehicleDetailsScreen} options={{ title: t("vehicleListing") }} />
    <CreateVehicleStack.Screen name="EditVehicle" component={EditVehicleScreen} options={{ title: t("editVehicleListing") }} />
  </CreateVehicleStack.Navigator>;
}
