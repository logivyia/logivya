import "server-only";

import { prisma } from "@/server/db";
import { adminAllowsInternalFreight, flagAllowsUser } from "@/server/freight/access-policy";
import { logger } from "@/server/observability/logger";
import { requireMobileAuth, type MobileAuthContext } from "@/server/mobile/auth";
import {
  FREIGHT_INTERNAL_FLAG,
  FREIGHT_PUBLIC_FLAG,
} from "@/server/freight/constants";

type AccessAudience = "public" | "internal";

export type FreightAccessDecision = {
  enabled: boolean;
  audience: AccessAudience | null;
};

export type FreightAccessContext = MobileAuthContext & {
  freightAudience: AccessAudience;
};

export async function resolveFreightMarketplaceAccess(userId: string): Promise<FreightAccessDecision> {
  try {
    const flags = await prisma.featureFlag.findMany({
      where: { key: { in: [FREIGHT_PUBLIC_FLAG, FREIGHT_INTERNAL_FLAG] } },
      select: { key: true, isEnabled: true, rolloutPercentage: true },
    });
    const byKey = new Map(flags.map((flag) => [flag.key, flag]));

    if (flagAllowsUser(byKey.get(FREIGHT_PUBLIC_FLAG), userId)) {
      return { enabled: true, audience: "public" };
    }

    const internalFlag = byKey.get(FREIGHT_INTERNAL_FLAG);
    if (!flagAllowsUser(internalFlag, userId)) return { enabled: false, audience: null };

    const admin = await prisma.platformAdmin.findUnique({
      where: { userId },
      select: { role: true, permissions: true, isActive: true },
    });
    return adminAllowsInternalFreight(admin)
      ? { enabled: true, audience: "internal" }
      : { enabled: false, audience: null };
  } catch (error) {
    logger.warn("freight.access_resolution_failed", { userId, error });
    return { enabled: false, audience: null };
  }
}

export async function requireFreightMarketplaceAccess(request: Request): Promise<FreightAccessContext> {
  const auth = await requireMobileAuth(request);
  const decision = await resolveFreightMarketplaceAccess(auth.user.id);
  if (!decision.enabled || !decision.audience) throw new Error("FREIGHT_MARKETPLACE_NOT_FOUND");
  return { ...auth, freightAudience: decision.audience };
}
