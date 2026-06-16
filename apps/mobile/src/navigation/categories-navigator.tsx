import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { CategoriesScreen } from "@/screens/app/categories-screen";
import { CategoryDetailScreen } from "@/screens/app/category-detail-screen";
import { useTranslation } from "@/i18n/use-translation";
import type { CategoriesStackParamList } from "@/types/navigation";

const Stack = createNativeStackNavigator<CategoriesStackParamList>();

export function CategoriesNavigator() {
  const { t } = useTranslation();

  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen name="CategoriesList" component={CategoriesScreen} options={{ title: t("categories") }} />
      <Stack.Screen name="CategoryDetail" component={CategoryDetailScreen} options={{ title: t("categoryDetail") }} />
    </Stack.Navigator>
  );
}
