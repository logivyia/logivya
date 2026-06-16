import { z } from "zod";
import { hashOpaqueToken } from "@/server/security/authentication";
import { prisma } from "@/server/db";
import { parseMobilePlatform, type MobileAuthContext } from "@/server/mobile/auth";

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

  await prisma.mobilePushToken.updateMany({
    where: {
      companyId: context.company.id,
      userId: context.user.id,
      deviceId: input.deviceId,
      tokenHash: { not: tokenHash },
      revokedAt: null
    },
    data: { revokedAt: now }
  });

  return prisma.mobilePushToken.upsert({
    where: { tokenHash },
    update: {
      companyId: context.company.id,
      userId: context.user.id,
      deviceId: input.deviceId,
      platform,
      token: input.token,
      appVersion: input.appVersion,
      revokedAt: null,
      lastSeenAt: now
    },
    create: {
      companyId: context.company.id,
      userId: context.user.id,
      deviceId: input.deviceId,
      platform,
      token: input.token,
      tokenHash,
      appVersion: input.appVersion,
      lastSeenAt: now
    },
    select: { id: true, deviceId: true, platform: true, appVersion: true, lastSeenAt: true }
  });
}

export async function removePushDevice(context: MobileAuthContext, input: z.infer<typeof removePushDeviceSchema>) {
  const selector = input.token ? { tokenHash: hashOpaqueToken(input.token) } : { deviceId: input.deviceId ?? "" };
  const result = await prisma.mobilePushToken.updateMany({
    where: {
      companyId: context.company.id,
      userId: context.user.id,
      revokedAt: null,
      ...selector
    },
    data: { revokedAt: new Date() }
  });
  return result.count;
}

export async function revokeCurrentSessionPushDevices(context: MobileAuthContext) {
  if (!context.deviceId) return 0;
  const result = await prisma.mobilePushToken.updateMany({
    where: {
      companyId: context.company.id,
      userId: context.user.id,
      deviceId: context.deviceId,
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  });
  return result.count;
}
