import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function GET() {
  try {
    const context = await requireApiSession();
    const devices = await prisma.trustedDevice.findMany({
      where: { userId: context.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: "desc" },
      select: { id: true, deviceName: true, ipAddress: true, userAgent: true, trustedAt: true, lastUsedAt: true, expiresAt: true },
    });
    return NextResponse.json({ devices });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
