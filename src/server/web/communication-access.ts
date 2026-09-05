import "server-only";

import { MobilePlatform } from "@prisma/client";

import { requireApiSession } from "@/server/auth/session";
import { resolveFacebookPagesAccess } from "@/server/facebook/access";
import { resolveTelegramAccessAudience } from "@/server/telegram/access";

/**
 * Cookie-session equivalents of the mobile communication access guards.
 * Provider feature flags still remain the source of truth; this adapter only
 * changes how the already-authenticated web user is resolved.
 */
export async function requireWebTelegramAccess() {
  const context = await requireApiSession();
  const audience = await resolveTelegramAccessAudience(context.user.id, MobilePlatform.WEB);
  if (!audience) {
    throw new Error("TELEGRAM_NOT_FOUND");
  }
  return { ...context, telegramAudience: audience };
}

export async function requireWebFacebookAccess() {
  const context = await requireApiSession();
  if (!(await resolveFacebookPagesAccess(context.user.id, MobilePlatform.WEB))) {
    throw new Error("FACEBOOK_NOT_FOUND");
  }
  return { ...context, facebookAudience: "pages" as const };
}
