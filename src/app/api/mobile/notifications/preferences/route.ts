import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { listNotificationPreferences, notificationPreferencePatchSchema, updateNotificationPreferences } from "@/server/notifications/preferences";
import { writeAuditLog } from "@/server/security/audit";

export async function GET(request: Request) {
  try {
    const { company, user } = await requireMobileAuth(request);
    return mobileSuccess({ preferences: await listNotificationPreferences(company.id, user.id, user.timezone) });
  } catch (error) {
    return mobileSafeError(error, "Bildirim tercihleri alınamadı.");
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = notificationPreferencePatchSchema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const { company, user } = await requireMobileAuth(request);
    const preferences = await updateNotificationPreferences({ companyId: company.id, userId: user.id, timezone: user.timezone, preferences: parsed.data.preferences });
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "notification.preferences.updated",
      entityType: "NotificationPreference",
      clientPlatform: "mobile",
      metadata: { preferenceCount: parsed.data.preferences.length },
    });
    return mobileSuccess({ preferences });
  } catch (error) {
    if (error instanceof Error && error.message === "NOTIFICATION_CHANNEL_MANDATORY") {
      return mobileError(error.message, "Zorunlu güvenlik bildirimleri kapatılamaz.", { status: 409 });
    }
    return mobileSafeError(error, "Bildirim tercihleri güncellenemedi.");
  }
}
