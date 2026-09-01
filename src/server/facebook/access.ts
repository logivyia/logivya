import "server-only";

import { createHash } from "node:crypto";
import { CompanyRole, type MobilePlatform } from "@prisma/client";

import { prisma } from "@/server/db";
import { FACEBOOK_PAGES_FEATURE_FLAG } from "@/server/facebook/constants";
import { resolveProductFeature } from "@/server/features/product-status";
import { requireMobileAuth, type MobileAuthContext } from "@/server/mobile/auth";
import { logger } from "@/server/observability/logger";

export type FacebookPagesAccessContext = MobileAuthContext & { facebookAudience: "pages" };

function rolloutBucket(userId: string) {
  return createHash("sha256").update(userId).digest().readUInt32BE(0) % 100;
}

export async function resolveFacebookPagesAccess(userId: string, platform: MobilePlatform) {
  void platform;
  const publication = await resolveProductFeature("FACEBOOK_PAGES");
  if (publication.status === "DISABLED" || publication.status === "COMING_SOON") return false;
  const explicit = process.env.FACEBOOK_PAGES_ENABLED?.trim().toLowerCase();
  if (explicit === "false" || explicit === "0") return false;
  const explicitlyEnabled = explicit === "true" || explicit === "1";
  try {
    const [flag, admin] = await Promise.all([
      prisma.featureFlag.findUnique({
        where: { key: FACEBOOK_PAGES_FEATURE_FLAG },
        select: { isEnabled: true, rolloutPercentage: true },
      }),
      publication.status === "INTERNAL"
        ? prisma.platformAdmin.findUnique({ where: { userId }, select: { isActive: true, permissions: true } })
        : Promise.resolve(null),
    ]);
    const percentage = Math.max(0, Math.min(100, flag?.rolloutPercentage ?? (explicitlyEnabled ? 100 : 0)));
    const rolloutEnabled = explicitlyEnabled || Boolean(flag?.isEnabled && (percentage === 100 || rolloutBucket(userId) < percentage));
    if (!rolloutEnabled) return false;
    if (publication.status !== "INTERNAL") return true;
    return Boolean(admin?.isActive && admin.permissions.includes("facebook_pages_internal_access"));
  } catch (error) {
    logger.warn("facebook.access_resolution_failed", { userId, error });
    return false;
  }
}

export async function requireFacebookPagesAccess(request: Request): Promise<FacebookPagesAccessContext> {
  const auth = await requireMobileAuth(request);
  if (!(await resolveFacebookPagesAccess(auth.user.id, auth.platform))) throw new Error("FACEBOOK_NOT_FOUND");
  return { ...auth, facebookAudience: "pages" };
}

export function assertFacebookConnectionManager(context: FacebookPagesAccessContext) {
  if (context.membership.role !== CompanyRole.OWNER && context.membership.role !== CompanyRole.ADMIN) {
    throw new Error("Missing permission: facebook.pages.connect");
  }
}

export function assertFacebookPublisher(context: FacebookPagesAccessContext) {
  if (context.membership.role === CompanyRole.VIEWER) {
    throw new Error("Missing permission: facebook.pages.publish");
  }
}
