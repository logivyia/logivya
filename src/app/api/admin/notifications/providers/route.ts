import { NextResponse } from "next/server";
import { getEmailProviderStatus } from "@/lib/email/email-provider";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { getWebPushConfiguration } from "@/server/notifications/web-push";
import { requestId, safeAdminError } from "@/server/security/admin-request";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("admin.notifications.read", request);
    const [androidDevices, iosDevices, webDevices, recentWebhooks] =
      await Promise.all([
        prisma.notificationDevice.count({
          where: { platform: "ANDROID", enabled: true },
        }),
        prisma.notificationDevice.count({
          where: { platform: "IOS", enabled: true },
        }),
        prisma.notificationDevice.count({
          where: { platform: "WEB", enabled: true },
        }),
        prisma.notificationProviderWebhook.count({
          where: {
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
          },
        }),
      ]);
    const webPush = getWebPushConfiguration();
    return NextResponse.json({
      providers: {
        email: getEmailProviderStatus(),
        androidPush: {
          provider: "expo",
          configured: androidDevices > 0,
          activeDevices: androidDevices,
        },
        iosPush: {
          provider: "expo",
          configured: false,
          activeDevices: iosDevices,
          readiness: "FUTURE",
        },
        webPush: { configured: webPush.configured, activeDevices: webDevices },
      },
      recentWebhooks,
    });
  } catch (error) {
    const safe = safeAdminError(error, requestId(request));
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
