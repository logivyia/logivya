import { useCallback } from "react";
import { useSettingsStore } from "@/auth/settings-store";
import { translate, type TranslationKey } from "@/i18n/translations";

export function useTranslation() {
  const locale = useSettingsStore((state) => state.locale);
  const t = useCallback((key: TranslationKey, variables: Record<string, string | number> = {}) => {
    return translate(locale, key, variables);
  }, [locale]);

  return { locale, t };
}
