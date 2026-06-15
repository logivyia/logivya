import { Screen } from "@/components/screen";
import { PlaceholderCard } from "@/components/placeholder-card";
import { useTranslation } from "@/i18n/use-translation";

export function SupportScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <PlaceholderCard title={t("support")} description={t("placeholder")} />
    </Screen>
  );
}
