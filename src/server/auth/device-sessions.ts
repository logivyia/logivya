import "server-only";

import { MobilePlatform } from "@prisma/client";
import { maskIpAddress } from "@logivya/logging";

import { prisma } from "@/server/db";

export type SecuritySessionKind = "WEB" | "MOBILE";

function deviceLabel(userAgent: string | null, platform?: MobilePlatform, appVersion?: string | null) {
  if (platform && platform !== MobilePlatform.UNKNOWN) {
    const version = appVersion ? ` ${appVersion}` : "";
    return `${platform === MobilePlatform.ANDROID ? "Android" : platform === MobilePlatform.IOS ? "iOS" : "Web"}${version}`;
  }
  if (!userAgent) return "Unknown device";
  const browser = userAgent.includes("Edg/") ? "Edge"
    : userAgent.includes("Chrome/") ? "Chrome"
    : userAgent.includes("Firefox/") ? "Firefox"
    : userAgent.includes("Safari/") ? "Safari"
    : "Web";
  const os = userAgent.includes("Windows") ? "Windows"
    : userAgent.includes("Android") ? "Android"
    : userAgent.includes("iPhone") || userAgent.includes("iPad") ? "iOS"
    : userAgent.includes("Mac OS") ? "macOS"
    : userAgent.includes("Linux") ? "Linux"
    : "Device";
  return `${browser} on ${os}`;
}

export async function listUserSecuritySessions(
  userId: string,
  current: { webSessionId?: string; mobileSessionId?: string } = {},
) {
  const now = new Date();
  const [webSessions, mobileSessions] = await Promise.all([
    prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true, deviceName: true, ipAddress: true, userAgent: true, lastActiveAt: true, expiresAt: true, createdAt: true },
      orderBy: { lastActiveAt: "desc" },
    }),
    prisma.mobileDeviceSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true, deviceId: true, platform: true, appVersion: true, userAgent: true, lastUsedAt: true, expiresAt: true, createdAt: true },
      orderBy: { lastUsedAt: "desc" },
    }),
  ]);

  return [
    ...webSessions.map((session) => ({
      id: session.id,
      kind: "WEB" as const,
      deviceName: session.deviceName || deviceLabel(session.userAgent),
      ipAddress: maskIpAddress(session.ipAddress),
      lastActiveAt: session.lastActiveAt,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      current: session.id === current.webSessionId,
    })),
    ...mobileSessions.map((session) => ({
      id: session.id,
      kind: "MOBILE" as const,
      deviceName: deviceLabel(session.userAgent, session.platform, session.appVersion),
      ipAddress: null,
      lastActiveAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      current: session.id === current.mobileSessionId,
    })),
  ].sort((left, right) => right.lastActiveAt.getTime() - left.lastActiveAt.getTime());
}

export async function revokeUserSecuritySession(userId: string, kind: SecuritySessionKind, sessionId: string) {
  const now = new Date();
  const result = kind === "WEB"
    ? await prisma.userSession.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: now } })
    : await prisma.mobileDeviceSession.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: now } });
  return result.count > 0;
}

export async function revokeAllUserSecuritySessions(userId: string) {
  const now = new Date();
  const [web, mobile, push] = await prisma.$transaction([
    prisma.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
    prisma.mobileDeviceSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
    prisma.mobilePushToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
  ]);
  return { web: web.count, mobile: mobile.count, push: push.count };
}
