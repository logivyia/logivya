import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const windowStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const [sessions, refreshEvents, feedback, pushTokens] = await Promise.all([
    prisma.mobileDeviceSession.findMany({
      where: { platform: "ANDROID", lastUsedAt: { gte: windowStart } },
      select: {
        userId: true,
        deviceId: true,
        appVersion: true,
        lastUsedAt: true,
      },
    }),
    prisma.mobileRefreshTokenHistory.count({
      where: {
        createdAt: { gte: windowStart },
        session: { platform: "ANDROID" },
      },
    }),
    prisma.mobileFeedback.findMany({
      where: { createdAt: { gte: windowStart } },
      select: {
        userId: true,
        platform: true,
        type: true,
        status: true,
        appVersion: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.mobilePushToken.findMany({
      where: {
        platform: "ANDROID",
        revokedAt: null,
        lastSeenAt: { gte: windowStart },
      },
      select: { userId: true, deviceId: true },
    }),
  ]);

  const latestActivity = sessions.reduce<Date | null>(
    (latest, session) =>
      !latest || session.lastUsedAt > latest ? session.lastUsedAt : latest,
    null,
  );

  console.log(
    JSON.stringify(
      {
        windowStart,
        activeAndroidUsers: new Set(sessions.map((session) => session.userId))
          .size,
        activeAndroidDevices: new Set(
          sessions.map((session) => session.deviceId),
        ).size,
        activeSessionRows: sessions.length,
        refreshEvents,
        appVersions: [
          ...new Set(
            sessions.map((session) => session.appVersion).filter(Boolean),
          ),
        ].sort(),
        latestActivity,
        feedbackSubmissions: feedback.length,
        feedbackUsers: new Set(feedback.map((item) => item.userId)).size,
        feedbackByPlatform: Object.fromEntries(
          ["ANDROID", "IOS", "UNKNOWN"].map((platform) => [
            platform,
            feedback.filter((item) => item.platform === platform).length,
          ]),
        ),
        latestFeedback: feedback[0]
          ? {
              platform: feedback[0].platform,
              type: feedback[0].type,
              status: feedback[0].status,
              appVersion: feedback[0].appVersion,
              createdAt: feedback[0].createdAt,
            }
          : null,
        activePushUsers: new Set(pushTokens.map((token) => token.userId)).size,
        activePushDevices: new Set(pushTokens.map((token) => token.deviceId))
          .size,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
