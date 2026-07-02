import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { getCampaignDeleteState } from "@/server/messages/delete-for-everyone";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "view_message_history");

    const campaign = await prisma.messageCampaign.findFirst({ where: { id, companyId: company.id, createdById: user.id }, select: { id: true } });
    if (!campaign) return mobileError("NOT_FOUND", "Mesaj gecmisi bulunamadi.", { status: 404 });

    return mobileSuccess({ deleteForEveryone: await getCampaignDeleteState(id) });
  } catch (error) {
    return mobileSafeError(error);
  }
}
