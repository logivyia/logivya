import "server-only";
import { prisma } from "@/server/db";
import { resolveCompanyEntitlements } from "@/server/billing/company-entitlements";

/** Contact access follows an active membership and its current trial/subscription. */
export async function canReadMarketplaceContact(userId: string | null | undefined) {
  if (!userId) return false;
  const memberships = await prisma.companyUser.findMany({
    where: { userId, status: "ACTIVE", lifecycleState: { in: ["INDEPENDENT_OWNER", "ACTIVE_SHARED_MEMBER"] }, user: { status: "ACTIVE" } },
    select: { companyId: true },
    take: 20,
  });
  for (const membership of memberships) {
    const current = await resolveCompanyEntitlements(membership.companyId);
    if (current?.valid) return true;
  }
  return false;
}
