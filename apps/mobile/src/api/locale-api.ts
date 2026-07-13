import { apiClient } from "@/api/client";
import type { Locale } from "@/i18n/config";

export function updateLocalePreference(locale: Locale) {
  return apiClient.patch<{ locale: Locale }>("/api/mobile/preferences/locale", { locale });
}
