import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export async function POST(request: Request) {
  try {
    const { company, user } = await requireMobileAuth(request);
    const result = await prisma.notification.updateMany({
      where: { companyId: company.id, userId: user.id, isRead: false },
      data: { isRead: true }
    });
    return mobileSuccess({ updatedCount: result.count });
  } catch (error) {
    return mobileSafeError(error, "Bildirimler okundu olarak işaretlenemedi.");
  }
}
