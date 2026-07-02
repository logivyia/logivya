import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "view_message_history");

    const campaign = await prisma.messageCampaign.findFirst({ where: { id, companyId: company.id, createdById: user.id }, select: { id: true } });
    if (!campaign) return mobileError("NOT_FOUND", "Mesaj gecmisi bulunamadi.", { status: 404 });

    await prisma.userMessageVisibility.upsert({
      where: { userId_campaignId: { userId: user.id, campaignId: id } },
      create: { userId: user.id, campaignId: id, deletedForMeAt: new Date() },
      update: { deletedForMeAt: new Date() },
    });

    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "campaign.deleted_for_me",
      entityType: "MessageCampaign",
      entityId: id,
    });

    return mobileSuccess({ ok: true });
  } catch (error) {
    return mobileSafeError(error);
  }
}
