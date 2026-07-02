import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { getCampaignDeleteState } from "@/server/messages/delete-for-everyone";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "view_message_history");
    const { id } = await params;
    const campaign = await prisma.messageCampaign.findFirst({
      where: {
        id,
        companyId: company.id,
        createdById: user.id,
        visibilityRecords: { none: { userId: user.id, deletedForMeAt: { not: null } } },
      },
      select: {
        id: true,
        title: true,
        content: true,
        status: true,
        scheduleType: true,
        scheduledAt: true,
        totalRecipients: true,
        sentCount: true,
        failedCount: true,
        createdAt: true,
        recipients: {
          select: {
            id: true,
            recipientName: true,
            status: true,
            errorMessage: true,
            sentAt: true,
            failedAt: true,
            deleteForEveryoneStatus: true,
            deleteForEveryoneError: true,
          },
          take: 100,
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!campaign) return mobileError("NOT_FOUND", "Mesaj gecmisi bulunamadi.", { status: 404 });
    return mobileSuccess({ campaign: { ...campaign, deleteForEveryone: await getCampaignDeleteState(id) } });
  } catch (error) {
    return mobileSafeError(error);
  }
}
