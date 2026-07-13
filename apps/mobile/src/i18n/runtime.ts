import { useSettingsStore } from "@/auth/settings-store";
import { translate, type TranslationKey } from "@/i18n/translations";

export function translateCurrent(key: TranslationKey, variables: Record<string, string | number> = {}) {
  return translate(useSettingsStore.getState().locale, key, variables);
}
