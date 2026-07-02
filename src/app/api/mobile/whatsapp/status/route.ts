import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { serializeMobileAccount } from "@/server/mobile/whatsapp";

export async function GET(request: Request) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "manage_accounts");
    const accounts = await prisma.whatsAppAccount.findMany({
      where: { companyId: company.id, userId: user.id, archivedAt: null },
      include: { _count: { select: { groups: true, contacts: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const serialized = accounts.map(serializeMobileAccount);
    return mobileSuccess({
      status: {
        connectedCount: serialized.filter((account) => account.status === "CONNECTED").length,
        reconnectingCount: serialized.filter((account) => ["CONNECTING", "RECONNECTING", "DEGRADED"].includes(account.status)).length,
        healthyCount: serialized.filter((account) => account.healthScore >= 70).length,
        totalGroupCount: serialized.reduce((sum, account) => sum + account.groupCount, 0),
        accounts: serialized,
      },
    });
  } catch (error) {
    return mobileSafeError(error);
  }
}
