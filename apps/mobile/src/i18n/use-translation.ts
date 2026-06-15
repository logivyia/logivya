import { useSettingsStore } from "@/auth/settings-store";
import { translations, type TranslationKey } from "@/i18n/translations";

export function useTranslation() {
  const locale = useSettingsStore((state) => state.locale);

  return {
    locale,
    t: (key: TranslationKey) => translations[locale][key] ?? translations.tr[key]
  };
}
