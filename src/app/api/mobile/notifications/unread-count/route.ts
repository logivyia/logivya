import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export async function GET(request: Request) {
  try {
    const { company, user } = await requireMobileAuth(request);
    const unreadCount = await prisma.notification.count({
      where: { companyId: company.id, userId: user.id, isRead: false }
    });
    return mobileSuccess({ unreadCount });
  } catch (error) {
    return mobileSafeError(error, "Okunmamış bildirim sayısı alınamadı.");
  }
}
