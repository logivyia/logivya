import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";
import { requestCurrentAccountGroupSync, resolveCurrentWhatsAppAccount } from "@/server/whatsapp/account-scope";

export async function POST(request: Request) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "manage_groups");
    const scope = { companyId: company.id, userId: user.id };
    const account = await resolveCurrentWhatsAppAccount(scope);
    if (!account) return mobileError("WHATSAPP_ACCOUNT_REQUIRED", "WhatsApp hesabınızı bağlayın", { status: 409 });

    const job = await requestCurrentAccountGroupSync(scope, account, "mobile-manual-refresh");
    const groupCount = await prisma.whatsAppGroup.count({
      where: { companyId: company.id, userId: user.id, accountId: account.id, isArchived: false },
    });
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "mobile.whatsapp.groups.sync_current.requested",
      entityType: "WhatsAppAccount",
      entityId: account.id,
      after: { jobId: job.id, groupCount },
    }).catch(() => undefined);

    return mobileSuccess({
      message: "WhatsApp grupları yenileniyor",
      accountId: account.id,
      jobId: job.id,
      groupCount,
    });
  } catch (error) {
    return mobileSafeError(error, "Gruplar yenilenemedi.");
  }
}
