import { z } from "zod";
import { hashOpaqueToken } from "@/server/security/authentication";
import { prisma } from "@/server/db";
import { parseMobilePlatform, type MobileAuthContext } from "@/server/mobile/auth";
import { encryptPushToken } from "@/server/notifications/push-token-security";

export const registerPushDeviceSchema = z.object({
  platform: z.enum(["ios", "android", "web", "IOS", "ANDROID", "WEB"]),
  token: z.string().min(10).max(2048),
  deviceId: z.string().min(3).max(160),
  appVersion: z.string().max(40).optional()
});

export const removePushDeviceSchema = z.object({
  token: z.string().min(10).max(2048).optional(),
  deviceId: z.string().min(3).max(160).optional()
}).refine((value) => value.token || value.deviceId, { message: "token or deviceId is required" });

export async function registerPushDevice(context: MobileAuthContext, input: z.infer<typeof registerPushDeviceSchema>) {
  const tokenHash = hashOpaqueToken(input.token);
  const platform = parseMobilePlatform(input.platform);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const staleTokens = await tx.mobilePushToken.findMany({
      where: {
        companyId: context.company.id,
        userId: context.user.id,
        deviceId: input.deviceId,
        tokenHash: { not: tokenHash },
        revokedAt: null,
      },
      select: { id: true },
    });
    if (staleTokens.length) {
      await tx.mobilePushToken.updateMany({
        where: { id: { in: staleTokens.map((token) => token.id) } },
        data: { revokedAt: now },
      });
      await tx.notificationDevice.updateMany({
        where: { mobilePushTokenId: { in: staleTokens.map((token) => token.id) } },
        data: { enabled: false, invalidatedAt: now },
      });
    }

    const pushToken = await tx.mobilePushToken.upsert({
      where: { tokenHash },
      update: {
        companyId: context.company.id,
        userId: context.user.id,
        deviceId: input.deviceId,
        platform,
        token: encryptPushToken(input.token),
        appVersion: input.appVersion,
        revokedAt: null,
        lastSeenAt: now,
      },
      create: {
        companyId: context.company.id,
        userId: context.user.id,
        deviceId: input.deviceId,
        platform,
        token: encryptPushToken(input.token),
        tokenHash,
        appVersion: input.appVersion,
        lastSeenAt: now,
      },
      select: { id: true, deviceId: true, platform: true, appVersion: true, lastSeenAt: true },
    });
    const profile = await tx.user.findUnique({
      where: { id: context.user.id },
      select: { locale: true, timezone: true },
    });
    await tx.notificationDevice.upsert({
      where: { mobilePushTokenId: pushToken.id },
      update: {
        companyId: context.company.id,
        userId: context.user.id,
        platform,
        locale: profile?.locale || "tr",
        timezone: profile?.timezone || "Europe/Istanbul",
        enabled: true,
        invalidatedAt: null,
        lastSeenAt: now,
      },
      create: {
        companyId: context.company.id,
        userId: context.user.id,
        mobilePushTokenId: pushToken.id,
        platform,
        locale: profile?.locale || "tr",
        timezone: profile?.timezone || "Europe/Istanbul",
        lastSeenAt: now,
      },
    });
    return pushToken;
  });
}

export async function removePushDevice(context: MobileAuthContext, input: z.infer<typeof removePushDeviceSchema>) {
  const selector = input.token ? { tokenHash: hashOpaqueToken(input.token) } : { deviceId: input.deviceId ?? "" };
  const tokens = await prisma.mobilePushToken.findMany({
    where: { companyId: context.company.id, userId: context.user.id, revokedAt: null, ...selector },
    select: { id: true },
  });
  const result = await prisma.mobilePushToken.updateMany({
    where: {
      companyId: context.company.id,
      userId: context.user.id,
      revokedAt: null,
      ...selector
    },
    data: { revokedAt: new Date() }
  });
  if (tokens.length) {
    await prisma.notificationDevice.updateMany({
      where: { mobilePushTokenId: { in: tokens.map((token) => token.id) } },
      data: { enabled: false, invalidatedAt: new Date() },
    });
  }
  return result.count;
}

export async function revokeCurrentSessionPushDevices(context: MobileAuthContext) {
  if (!context.deviceId) return 0;
  const tokens = await prisma.mobilePushToken.findMany({
    where: { companyId: context.company.id, userId: context.user.id, deviceId: context.deviceId, revokedAt: null },
    select: { id: true },
  });
  const result = await prisma.mobilePushToken.updateMany({
    where: {
      companyId: context.company.id,
      userId: context.user.id,
      deviceId: context.deviceId,
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  });
  if (tokens.length) {
    await prisma.notificationDevice.updateMany({
      where: { mobilePushTokenId: { in: tokens.map((token) => token.id) } },
      data: { enabled: false, invalidatedAt: new Date() },
    });
  }
  return result.count;
}
