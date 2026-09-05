import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("admin.systemHealth.read", request);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      activeUsers,
      loginFailures,
      pushTokens,
      whatsappFailures,
      campaignTotal,
      campaignFailed,
      activeSubscriptions,
      trialSubscriptions,
      feedbackOpen,
    ] = await Promise.all([
      prisma.mobileDeviceSession.count({
        where: { revokedAt: null, lastUsedAt: { gte: since } },
      }),
      prisma.loginAttempt.count({
        where: { success: false, createdAt: { gte: since } },
      }),
      prisma.mobilePushToken.count({ where: { revokedAt: null } }),
      prisma.whatsAppAccount.count({ where: { status: "FAILED" } }),
      prisma.messageCampaign.count({ where: { createdAt: { gte: since } } }),
      prisma.messageCampaign.count({
        where: { status: "FAILED", createdAt: { gte: since } },
      }),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.subscription.count({ where: { status: "TRIALING" } }),
      prisma.mobileFeedback.count({ where: { status: "OPEN" } }),
    ]);

    return NextResponse.json({
      window: "24h",
      activeUsers,
      crashRate: null,
      loginFailures,
      pushDeliverySuccess: pushTokens > 0 ? "configured" : "no_active_tokens",
      whatsappConnectionFailures: whatsappFailures,
      subscriptionConversion:
        trialSubscriptions > 0
          ? Math.round(
              (activeSubscriptions /
                (activeSubscriptions + trialSubscriptions)) *
                100,
            )
          : 100,
      campaignFailureRate:
        campaignTotal > 0
          ? Math.round((campaignFailed / campaignTotal) * 100)
          : 0,
      openFeedback: feedbackOpen,
    });
  } catch (error) {
    const safe = safeAdminError(error, requestId(request));
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
