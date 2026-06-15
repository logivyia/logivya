import { Screen } from "@/components/screen";
import { PlaceholderCard } from "@/components/placeholder-card";
import { useTranslation } from "@/i18n/use-translation";

export function GroupsScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <PlaceholderCard title={t("groups")} description={t("placeholder")} />
    </Screen>
  );
}
