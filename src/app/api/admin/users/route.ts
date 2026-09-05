import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.users.read", request);
    const params = new URL(request.url).searchParams;
    const page = positiveInteger(params.get("page"), 1);
    const query = params.get("q")?.trim() || "";
    const status = params.get("status")?.trim().toUpperCase();
    const view = params.get("view");
    const where = {
      ...(view === "sessions" ? { sessions: { some: { revokedAt: null, expiresAt: { gt: new Date() } } } } : {}),
      ...(view === "admins" ? { platformAdmin: { is: { isActive: true, role: "SUPER_ADMIN" as const } } } : {}),
      ...(status && ["ACTIVE", "SUSPENDED", "INVITED"].includes(status)
        ? { status: status as "ACTIVE" | "SUSPENDED" | "INVITED" }
        : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { email: { contains: query, mode: "insensitive" as const } },
              { phone: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [users, total, activeUsers, activeSessions, activeSuperAdmins] =
      await Promise.all([
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
            mfaRequired: true,
            createdAt: true,
            memberships: {
              select: {
                role: true,
                status: true,
                company: { select: { name: true } },
              },
            },
            sessions: {
              where: { revokedAt: null, expiresAt: { gt: new Date() } },
              orderBy: { lastActiveAt: "desc" },
              take: 1,
              select: {
                id: true,
                deviceName: true,
                lastActiveAt: true,
                expiresAt: true,
                createdAt: true,
              },
            },
            platformAdmin: {
              select: {
                role: true,
                isActive: true,
                requiresMfa: true,
                createdAt: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * 30,
          take: 30,
        }),
        prisma.user.count({ where }),
        prisma.user.count({ where: { AND: [where, { status: "ACTIVE" }] } }),
        prisma.userSession.count({
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
        }),
        prisma.platformAdmin.count({
          where: { isActive: true, role: "SUPER_ADMIN" },
        }),
      ]);
    const userIds = users.map((user) => user.id);
    const [sessionCounts, trustedDeviceCounts] = userIds.length
      ? await Promise.all([
          prisma.userSession.groupBy({
            by: ["userId"],
            where: {
              userId: { in: userIds },
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            _count: { _all: true },
          }),
          prisma.trustedDevice.groupBy({
            by: ["userId"],
            where: {
              userId: { in: userIds },
              revokedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    return NextResponse.json({
      users: users.map((user) => ({
        ...user,
        activeSessionCount:
          sessionCounts.find((item) => item.userId === user.id)?._count._all ??
          0,
        trustedDeviceCount:
          trustedDeviceCounts.find((item) => item.userId === user.id)?._count
            ._all ?? 0,
      })),
      metrics: {
        totalUsers: total,
        activeUsers,
        activeSessions,
        activeSuperAdmins,
      },
      pagination: { page, total, pages: Math.max(1, Math.ceil(total / 30)) },
      requestId: id,
    });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
