import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "delete_campaigns");

    const deletedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.messageCampaign.updateMany({
        where: { id, companyId: company.id, createdById: user.id },
        data: { deletedAt, platformDeletedAt: deletedAt, status: "DELETED" },
      });
      if (!updated.count) return updated;
      await tx.messageRecipient.updateMany({
        where: { campaignId: id, campaign: { companyId: company.id, createdById: user.id } },
        data: { platformDeletedAt: deletedAt },
      });
      return updated;
    });
    if (!result.count) return mobileError("NOT_FOUND", "Mesaj gecmisi bulunamadi.", { status: 404 });

    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "campaign.platform_deleted",
      entityType: "MessageCampaign",
      entityId: id,
    });

    return mobileSuccess({ ok: true });
  } catch (error) {
    return mobileSafeError(error);
  }
}
