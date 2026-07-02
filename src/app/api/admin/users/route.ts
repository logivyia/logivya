import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("admin.users.read", request);
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page") || 1));
    const query = params.get("q") || "";
    const where = query ? {
      OR: [
        { name: { contains: query, mode: "insensitive" as const } },
        { email: { contains: query, mode: "insensitive" as const } },
        { phone: { contains: query, mode: "insensitive" as const } },
      ],
    } : undefined;
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          locale: true,
          timezone: true,
          country: true,
          createdAt: true,
          memberships: { select: { role: true, status: true, company: { select: { name: true } } } },
          sessions: {
            where: { revokedAt: null },
            orderBy: { lastActiveAt: "desc" },
            take: 5,
            select: { id: true, deviceName: true, ipAddress: true, lastActiveAt: true, expiresAt: true, createdAt: true },
          },
          trustedDevices: {
            where: { revokedAt: null },
            take: 5,
            select: { id: true, deviceName: true, ipAddress: true, trustedAt: true, createdAt: true },
          },
          platformAdmin: { select: { role: true, isActive: true, requiresMfa: true, createdAt: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 30,
        take: 30,
      }),
      prisma.user.count({ where }),
    ]);
    return NextResponse.json({ users, pagination: { page, total, pages: Math.ceil(total / 30) } });
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}
