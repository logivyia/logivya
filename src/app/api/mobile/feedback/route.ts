import { z } from "zod";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { NOTIFICATION_TYPES, notifyPlatformAdmins } from "@/server/notifications/service";
import { writeAuditLog } from "@/server/security/audit";

const feedbackSchema = z.object({
  type: z.enum(["BUG", "FEATURE"]),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(10).max(5000),
  screenshot: z.string().trim().url().max(2048).optional().or(z.literal("")),
  deviceInfo: z.record(z.string(), z.unknown()).optional(),
  appVersion: z.string().trim().max(40).optional()
});

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const parsed = feedbackSchema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);

    const feedback = await prisma.mobileFeedback.create({
      data: {
        companyId: context.company.id,
        userId: context.user.id,
        type: parsed.data.type,
        subject: parsed.data.subject,
        message: parsed.data.message,
        screenshot: parsed.data.screenshot || null,
        deviceInfo: {
          ...(parsed.data.deviceInfo || {}),
          sessionDeviceId: context.deviceId
        },
        appVersion: parsed.data.appVersion || null,
        platform: context.platform
      },
      select: { id: true, type: true, subject: true, status: true, createdAt: true }
    });

    await notifyPlatformAdmins({
      companyId: context.company.id,
      type: NOTIFICATION_TYPES.ADMIN_HIGH_PRIORITY_SUPPORT_TICKET,
      title: parsed.data.type === "BUG" ? "Yeni mobil hata bildirimi" : "Yeni mobil özellik önerisi",
      message: `${context.company.name}: ${parsed.data.subject}`,
      payload: { feedbackId: feedback.id, feedbackType: parsed.data.type }
    });

    await writeAuditLog(request, {
      companyId: context.company.id,
      userId: context.user.id,
      action: "mobile.feedback.created",
      entityType: "MobileFeedback",
      entityId: feedback.id,
      after: { type: parsed.data.type, appVersion: parsed.data.appVersion || null }
    });

    return mobileSuccess({ feedback }, { status: 201 });
  } catch (error) {
    return mobileSafeError(error, "Geri bildirim gönderilemedi.");
  }
}
