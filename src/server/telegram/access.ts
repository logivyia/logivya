import "server-only";

import type { MobilePlatform } from "@prisma/client";

import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { requireMobileAuth, type MobileAuthContext } from "@/server/mobile/auth";
import { telegramAccessAudience, type TelegramAudience } from "@/server/telegram/access-policy";
import { TELEGRAM_INTERNAL_FLAG, TELEGRAM_PUBLIC_FLAG } from "@/server/telegram/constants";

export type TelegramAccessContext = MobileAuthContext & { telegramAudience: TelegramAudience };

export async function resolveTelegramAccessAudience(userId: string, platform: MobilePlatform) {
  try {
    const [flags, admin] = await Promise.all([
      prisma.featureFlag.findMany({
        where: { key: { in: [TELEGRAM_INTERNAL_FLAG, TELEGRAM_PUBLIC_FLAG] } },
        select: { key: true, isEnabled: true, rolloutPercentage: true },
      }),
      prisma.platformAdmin.findUnique({
        where: { userId },
        select: { permissions: true, isActive: true },
      }),
    ]);
    return telegramAccessAudience({
      platform, admin,
      publicFlag: flags.find((flag) => flag.key === TELEGRAM_PUBLIC_FLAG),
      internalFlag: flags.find((flag) => flag.key === TELEGRAM_INTERNAL_FLAG),
    });
  } catch (error) {
    logger.warn("telegram.access_resolution_failed", { userId, platform, error });
    return null;
  }
}

// Retain the existing guard entry point for all web and mobile Telegram routes.
export async function resolveTelegramInternalAccess(userId: string, platform: MobilePlatform) {
  return (await resolveTelegramAccessAudience(userId, platform)) !== null;
}

export async function requireTelegramInternalAccess(request: Request): Promise<TelegramAccessContext> {
  const auth = await requireMobileAuth(request);
  const audience = await resolveTelegramAccessAudience(auth.user.id, auth.platform);
  if (!audience) {
    throw new Error("TELEGRAM_NOT_FOUND");
  }
  return { ...auth, telegramAudience: audience };
}
