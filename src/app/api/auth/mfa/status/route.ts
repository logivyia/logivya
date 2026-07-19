import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { pendingMfaEnrollmentStatus } from "@/server/security/mfa";

export async function GET() {
  try {
    const context = await requireApiSession();
    const [credential, trustedDevices, recentEvents, setup] = await Promise.all([
      prisma.mfaCredential.findFirst({
        where: { userId: context.user.id, verifiedAt: { not: null }, revokedAt: null },
        orderBy: { verifiedAt: "desc" },
        include: { recoveryCodes: { where: { usedAt: null }, select: { id: true } } },
      }),
      prisma.trustedDevice.findMany({
        where: { userId: context.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastUsedAt: "desc" },
        select: { id: true, deviceName: true, ipAddress: true, userAgent: true, trustedAt: true, lastUsedAt: true, expiresAt: true },
      }),
      prisma.securityEvent.findMany({
        where: { userId: context.user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, type: true, severity: true, message: true, ipAddress: true, createdAt: true },
      }),
      pendingMfaEnrollmentStatus(context.user.id),
    ]);
    return NextResponse.json({
      enabled: Boolean(credential),
      required: context.user.mfaRequired,
      enabledAt: credential?.verifiedAt,
      recoveryCodesRemaining: credential?.recoveryCodes.length ?? 0,
      ...setup,
      trustedDevices,
      recentEvents,
    });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
