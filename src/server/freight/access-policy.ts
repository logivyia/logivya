import { createHash } from "node:crypto";
import type { FeatureFlag, PlatformAdminRole } from "@prisma/client";

import { FREIGHT_INTERNAL_PERMISSION } from "@/server/freight/constants";

type FlagSnapshot = Pick<FeatureFlag, "key" | "isEnabled" | "rolloutPercentage">;
type AdminSnapshot = { role: PlatformAdminRole; permissions: string[]; isActive: boolean };

function rolloutBucket(userId: string, key: string) {
  const digest = createHash("sha256").update(`${key}:${userId}`).digest("hex").slice(0, 8);
  return Number.parseInt(digest, 16) % 100;
}

export function flagAllowsUser(flag: FlagSnapshot | undefined, userId: string) {
  if (!flag?.isEnabled) return false;
  const percentage = Math.max(0, Math.min(100, flag.rolloutPercentage));
  if (percentage === 100) return true;
  if (percentage === 0) return false;
  return rolloutBucket(userId, flag.key) < percentage;
}

export function adminAllowsInternalFreight(admin: AdminSnapshot | null) {
  if (!admin?.isActive) return false;
  return admin.role === "SUPER_ADMIN" || admin.permissions.includes(FREIGHT_INTERNAL_PERMISSION);
}
