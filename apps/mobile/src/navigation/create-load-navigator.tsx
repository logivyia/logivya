import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { CreateLoadScreen } from "@/screens/app/create-load-screen";
import type { CreateLoadStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<CreateLoadStackParamList>();

export function CreateLoadNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CreateLoadHome" component={CreateLoadScreen} />
    </Stack.Navigator>
  );
}
