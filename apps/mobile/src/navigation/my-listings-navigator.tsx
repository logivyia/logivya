import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { EditLoadScreen } from "@/screens/app/edit-load-screen";
import { OwnedFreightDetailsScreen } from "@/screens/app/freight-details-screen";
import { MyListingsScreen } from "@/screens/app/my-listings-screen";
import type { MyListingsStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<MyListingsStackParamList>();

export function MyListingsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyListingsHome" component={MyListingsScreen} />
      <Stack.Screen name="EditFreightListing" component={EditLoadScreen} />
      <Stack.Screen name="OwnedFreightDetails" component={OwnedFreightDetailsScreen} />
    </Stack.Navigator>
  );
}
