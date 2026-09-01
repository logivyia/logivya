import "server-only";

import type { MobilePlatform } from "@prisma/client";

import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { requireMobileAuth, type MobileAuthContext } from "@/server/mobile/auth";
import { telegramInternalAccessAllowed } from "@/server/telegram/access-policy";
import { TELEGRAM_INTERNAL_FLAG } from "@/server/telegram/constants";

export type TelegramAccessContext = MobileAuthContext & { telegramAudience: "internal" };

export async function resolveTelegramInternalAccess(userId: string, platform: MobilePlatform) {
  try {
    const [flag, admin] = await Promise.all([
      prisma.featureFlag.findUnique({
        where: { key: TELEGRAM_INTERNAL_FLAG },
        select: { isEnabled: true, rolloutPercentage: true },
      }),
      prisma.platformAdmin.findUnique({
        where: { userId },
        select: { permissions: true, isActive: true },
      }),
    ]);
    return telegramInternalAccessAllowed({ platform, flag: flag ?? undefined, admin });
  } catch (error) {
    logger.warn("telegram.access_resolution_failed", { userId, platform, error });
    return false;
  }
}

export async function requireTelegramInternalAccess(request: Request): Promise<TelegramAccessContext> {
  const auth = await requireMobileAuth(request);
  if (!(await resolveTelegramInternalAccess(auth.user.id, auth.platform))) {
    throw new Error("TELEGRAM_NOT_FOUND");
  }
  return { ...auth, telegramAudience: "internal" };
}

