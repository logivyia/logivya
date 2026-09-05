import type { MobilePlatform } from "@prisma/client";

import { TELEGRAM_INTERNAL_PERMISSION } from "@/server/telegram/constants";

type FlagSnapshot = { isEnabled: boolean; rolloutPercentage: number } | undefined;
type AdminSnapshot = { permissions: string[]; isActive: boolean } | null;

export type TelegramAudience = "public" | "internal";

export function telegramAccessAudience(input: {
  platform: MobilePlatform;
  publicFlag: FlagSnapshot;
  internalFlag: FlagSnapshot;
  admin: AdminSnapshot;
}): TelegramAudience | null {
  if (!["ANDROID", "IOS", "WEB"].includes(input.platform)) return null;
  // Public availability never grants administrator privileges or bypasses
  // the authenticated user's account, company and subscription checks.
  if (input.publicFlag?.isEnabled && input.publicFlag.rolloutPercentage === 100) return "public";
  return telegramInternalAccessAllowed({ platform: input.platform, flag: input.internalFlag, admin: input.admin })
    ? "internal" : null;
}

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
