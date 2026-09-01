import type { MobilePlatform } from "@prisma/client";

import { TELEGRAM_INTERNAL_PERMISSION } from "@/server/telegram/constants";

type FlagSnapshot = { isEnabled: boolean; rolloutPercentage: number } | undefined;
type AdminSnapshot = { permissions: string[]; isActive: boolean } | null;

export function telegramInternalAccessAllowed(input: {
  platform: MobilePlatform;
  flag: FlagSnapshot;
  admin: AdminSnapshot;
}) {
  if (input.platform !== "ANDROID" && input.platform !== "IOS" && input.platform !== "WEB") return false;
  if (!input.flag?.isEnabled || input.flag.rolloutPercentage !== 100) return false;
  if (!input.admin?.isActive) return false;
  return input.admin.permissions.includes(TELEGRAM_INTERNAL_PERMISSION);
}
