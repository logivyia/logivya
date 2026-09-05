import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { FindLoadsScreen } from "@/screens/app/find-loads-screen";
import { FreightDetailsScreen } from "@/screens/app/freight-details-screen";
import type { FindLoadsStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<FindLoadsStackParamList>();

export function FindLoadsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FindLoadsHome" component={FindLoadsScreen} />
      <Stack.Screen name="FreightDetails" component={FreightDetailsScreen} />
    </Stack.Navigator>
  );
}
