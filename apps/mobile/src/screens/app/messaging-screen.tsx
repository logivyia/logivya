import { Screen } from "@/components/screen";
import { PlaceholderCard } from "@/components/placeholder-card";
import { useTranslation } from "@/i18n/use-translation";

export function MessagingScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <PlaceholderCard title={t("messaging")} description="Mesaj gönderme ve zamanlama API bağlantıları için ekran temeli hazır." />
    </Screen>
  );
}
