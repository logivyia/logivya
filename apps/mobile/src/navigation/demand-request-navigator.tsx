import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { DemandRequestMatchesScreen, DemandRequestsScreen } from "@/screens/app/demand-request-screens";
import type { DemandRequestStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<DemandRequestStackParamList>();

export function DemandRequestNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DemandRequestsHome" component={DemandRequestsScreen} />
      <Stack.Screen name="DemandRequestMatches" component={DemandRequestMatchesScreen} />
    </Stack.Navigator>
  );
}
