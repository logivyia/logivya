import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { listNotificationPreferences, notificationPreferencePatchSchema, updateNotificationPreferences } from "@/server/notifications/preferences";
import { writeAuditLog } from "@/server/security/audit";

export async function GET() {
  try {
    const { company, user } = await requireApiSession();
    return NextResponse.json({ preferences: await listNotificationPreferences(company.id, user.id, user.timezone) });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = notificationPreferencePatchSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "NOTIFICATION_PREFERENCES_INVALID", issues: parsed.error.issues }, { status: 400 });
    const { company, user } = await requireApiSession();
    const preferences = await updateNotificationPreferences({ companyId: company.id, userId: user.id, timezone: user.timezone, preferences: parsed.data.preferences });
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "notification.preferences.updated",
      entityType: "NotificationPreference",
      metadata: { preferenceCount: parsed.data.preferences.length },
    });
    return NextResponse.json({ preferences });
  } catch (error) {
    const code = error instanceof Error ? error.message : "NOTIFICATION_PREFERENCES_UPDATE_FAILED";
    if (code === "NOTIFICATION_CHANNEL_MANDATORY") return NextResponse.json({ error: code }, { status: 409 });
    return NextResponse.json({ error: code === "UNAUTHORIZED" ? code : "NOTIFICATION_PREFERENCES_UPDATE_FAILED" }, { status: code === "UNAUTHORIZED" ? 401 : 500 });
  }
}
