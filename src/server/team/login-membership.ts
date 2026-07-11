import { prisma } from "@/server/db";

export async function resolvePreferredLoginMembership(userId: string, deviceId?: string) {
  const [memberships, latestWebSession, latestDeviceSession, latestMobileSession] = await Promise.all([
    prisma.companyUser.findMany({
      where: { userId, status: "ACTIVE" },
      include: { company: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.userSession.findFirst({
      where: { userId },
      select: { companyId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    deviceId ? prisma.mobileDeviceSession.findFirst({
      where: { userId, deviceId },
      select: { companyId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }) : Promise.resolve(null),
    prisma.mobileDeviceSession.findFirst({
      where: { userId },
      select: { companyId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!memberships.length) return null;

  const preferredSessions = [latestDeviceSession, latestWebSession, latestMobileSession]
    .filter((session): session is NonNullable<typeof session> => Boolean(session))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  for (const session of preferredSessions) {
    const membership = memberships.find((candidate) => candidate.companyId === session.companyId);
    if (membership) return membership;
  }

  return memberships.find((membership) => membership.role === "OWNER") ?? memberships[0];
}
