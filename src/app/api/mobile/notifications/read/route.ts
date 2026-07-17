import { z } from "zod";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";

const schema = z.object({
  id: z.string().min(1).optional(),
  notificationId: z.string().min(1).optional()
}).refine((value) => value.id || value.notificationId, { message: "notification id is required" });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const { company, user } = await requireMobileAuth(request);
    const notificationId = parsed.data.id ?? parsed.data.notificationId ?? "";
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, companyId: company.id, userId: user.id },
      data: { isRead: true, readAt: new Date() }
    });
    if (!result.count) return mobileError("NOT_FOUND", "Bildirim bulunamadı.", { status: 404 });
    return mobileSuccess({ read: true, notificationId });
  } catch (error) {
    return mobileSafeError(error, "Bildirim okundu olarak işaretlenemedi.");
  }
}
