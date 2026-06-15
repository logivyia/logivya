import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, membership } = await requireMobileAuth(request);
    requirePermission(membership.role, "view_message_history");
    const { id } = await params;
    const campaign = await prisma.messageCampaign.findFirst({
      where: { id, companyId: company.id },
      select: {
        id: true, title: true, content: true, status: true, scheduleType: true, scheduledAt: true, totalRecipients: true, sentCount: true, failedCount: true, createdAt: true,
        recipients: { select: { id: true, recipientName: true, status: true, errorMessage: true, sentAt: true, failedAt: true }, take: 100, orderBy: { createdAt: "asc" } },
      },
    });
    if (!campaign) return mobileError("NOT_FOUND", "Mesaj geçmişi bulunamadı.", { status: 404 });
    return mobileSuccess({ campaign });
  } catch (error) {
    return mobileSafeError(error);
  }
}
