import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { serializeMobileAccount } from "@/server/mobile/whatsapp";

export async function GET(request: Request) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "manage_accounts");
    const showArchived = new URL(request.url).searchParams.get("archived") === "true";
    const accounts = await prisma.whatsAppAccount.findMany({
      where: { companyId: company.id, userId: user.id, ...(showArchived ? {} : { archivedAt: null }) },
      include: { _count: { select: { groups: true, contacts: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return mobileSuccess({ accounts: accounts.map(serializeMobileAccount) });
  } catch (error) {
    return mobileSafeError(error);
  }
}
