import { z } from "zod";
import { hashOpaqueToken } from "@/server/security/authentication";
import { prisma } from "@/server/db";
import { requireMobileAuth, parseMobilePlatform } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";

const schema = z.object({
  platform: z.enum(["ios", "android", "IOS", "ANDROID"]),
  token: z.string().min(10).max(2048),
  deviceId: z.string().min(3).max(160),
  appVersion: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const { user, company } = await requireMobileAuth(request);
    const tokenHash = hashOpaqueToken(parsed.data.token);
    const pushToken = await prisma.mobilePushToken.upsert({
      where: { tokenHash },
      update: { userId: user.id, companyId: company.id, deviceId: parsed.data.deviceId, platform: parseMobilePlatform(parsed.data.platform), token: parsed.data.token, appVersion: parsed.data.appVersion, revokedAt: null, lastSeenAt: new Date() },
      create: { userId: user.id, companyId: company.id, deviceId: parsed.data.deviceId, platform: parseMobilePlatform(parsed.data.platform), token: parsed.data.token, tokenHash, appVersion: parsed.data.appVersion },
      select: { id: true, platform: true, lastSeenAt: true },
    });
    return mobileSuccess({ pushToken });
  } catch (error) {
    return mobileSafeError(error, "Bildirim tokenı kaydedilemedi.");
  }
}
