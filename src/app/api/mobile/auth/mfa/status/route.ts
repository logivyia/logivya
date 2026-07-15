import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";

export async function GET(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const [credential, trustedDevices, recentEvents] = await Promise.all([
      prisma.mfaCredential.findFirst({
        where: { userId: context.user.id, verifiedAt: { not: null }, revokedAt: null },
        orderBy: { verifiedAt: "desc" },
        include: { recoveryCodes: { where: { usedAt: null }, select: { id: true } } },
      }),
      prisma.trustedDevice.findMany({
        where: { userId: context.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastUsedAt: "desc" },
        select: { id: true, deviceName: true, ipAddress: true, trustedAt: true, lastUsedAt: true, expiresAt: true },
      }),
      prisma.securityEvent.findMany({
        where: { userId: context.user.id }, orderBy: { createdAt: "desc" }, take: 20,
        select: { id: true, type: true, severity: true, message: true, ipAddress: true, createdAt: true },
      }),
    ]);
    return mobileSuccess({ enabled: Boolean(credential), required: context.user.mfaRequired, enabledAt: credential?.verifiedAt, recoveryCodesRemaining: credential?.recoveryCodes.length ?? 0, trustedDevices, recentEvents });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return mobileError("UNAUTHORIZED", "Oturum gecersiz.", { status: 401 });
    return mobileSafeError(error);
  }
}
