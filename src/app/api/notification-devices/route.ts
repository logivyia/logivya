import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { hashOpaqueToken } from "@/server/security/authentication";
import { encryptPushToken } from "@/server/notifications/push-token-security";
import { writeAuditLog } from "@/server/security/audit";
import { getWebPushConfiguration } from "@/server/notifications/web-push";

const registerSchema = z.object({
  token: z.string().min(10).max(4096),
  deviceId: z.string().min(3).max(160),
  appVersion: z.string().max(40).optional(),
});

const removeSchema = z.object({
  token: z.string().min(10).max(4096).optional(),
  deviceId: z.string().min(3).max(160).optional(),
}).refine((value) => value.token || value.deviceId, { message: "token or deviceId is required" });

export async function GET() {
  try {
    const { company, user } = await requireApiSession();
    const configuration = getWebPushConfiguration();
    const activeDevices = await prisma.notificationDevice.count({
      where: { companyId: company.id, userId: user.id, platform: "WEB", enabled: true },
    });
    return NextResponse.json({ configured: configuration.configured, publicKey: configuration.configured ? configuration.publicKey : null, activeDevices });
  } catch {
    return NextResponse.json({ error: "NOTIFICATION_DEVICE_STATUS_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { company, user } = await requireApiSession();
    const parsed = registerSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "NOTIFICATION_DEVICE_INVALID", issues: parsed.error.issues }, { status: 400 });
    const now = new Date();
    const tokenHash = hashOpaqueToken(parsed.data.token);
    const device = await prisma.$transaction(async (tx) => {
      const stale = await tx.mobilePushToken.findMany({
        where: { companyId: company.id, userId: user.id, deviceId: parsed.data.deviceId, tokenHash: { not: tokenHash }, revokedAt: null },
        select: { id: true },
      });
      if (stale.length) {
        await tx.mobilePushToken.updateMany({ where: { id: { in: stale.map((item) => item.id) } }, data: { revokedAt: now } });
        await tx.notificationDevice.updateMany({ where: { mobilePushTokenId: { in: stale.map((item) => item.id) } }, data: { enabled: false, invalidatedAt: now } });
      }
      const token = await tx.mobilePushToken.upsert({
        where: { tokenHash },
        update: { companyId: company.id, userId: user.id, deviceId: parsed.data.deviceId, platform: "WEB", token: encryptPushToken(parsed.data.token), appVersion: parsed.data.appVersion, revokedAt: null, lastSeenAt: now },
        create: { companyId: company.id, userId: user.id, deviceId: parsed.data.deviceId, platform: "WEB", token: encryptPushToken(parsed.data.token), tokenHash, appVersion: parsed.data.appVersion, lastSeenAt: now },
      });
      return tx.notificationDevice.upsert({
        where: { mobilePushTokenId: token.id },
        update: { companyId: company.id, userId: user.id, platform: "WEB", locale: user.locale || "tr", timezone: user.timezone, enabled: true, invalidatedAt: null, lastSeenAt: now },
        create: { companyId: company.id, userId: user.id, mobilePushTokenId: token.id, platform: "WEB", locale: user.locale || "tr", timezone: user.timezone, lastSeenAt: now },
        select: { id: true, platform: true, enabled: true, lastSeenAt: true },
      });
    });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "notification.device.registered", entityType: "NotificationDevice", entityId: device.id, metadata: { platform: "WEB" } });
    return NextResponse.json({ device }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "NOTIFICATION_DEVICE_REGISTER_FAILED" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { company, user } = await requireApiSession();
    const parsed = removeSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "NOTIFICATION_DEVICE_INVALID", issues: parsed.error.issues }, { status: 400 });
    const selector = parsed.data.token ? { tokenHash: hashOpaqueToken(parsed.data.token) } : { deviceId: parsed.data.deviceId! };
    const tokens = await prisma.mobilePushToken.findMany({ where: { companyId: company.id, userId: user.id, platform: "WEB", revokedAt: null, ...selector }, select: { id: true } });
    if (tokens.length) {
      const now = new Date();
      await prisma.$transaction([
        prisma.mobilePushToken.updateMany({ where: { id: { in: tokens.map((token) => token.id) } }, data: { revokedAt: now } }),
        prisma.notificationDevice.updateMany({ where: { mobilePushTokenId: { in: tokens.map((token) => token.id) } }, data: { enabled: false, invalidatedAt: now } }),
      ]);
    }
    return NextResponse.json({ removed: true, revokedCount: tokens.length });
  } catch {
    return NextResponse.json({ error: "NOTIFICATION_DEVICE_REMOVE_FAILED" }, { status: 500 });
  }
}
