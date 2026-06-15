import { Screen } from "@/components/screen";
import { PlaceholderCard } from "@/components/placeholder-card";
import { useTranslation } from "@/i18n/use-translation";

export function CategoriesScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <PlaceholderCard title={t("categories")} description={t("placeholder")} />
    </Screen>
  );
}
