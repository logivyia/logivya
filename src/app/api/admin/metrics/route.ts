import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("admin.metrics.read", request);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const month = new Date(today.getFullYear(), today.getMonth(), 1);
    const [
      activeCustomers, trials, newToday, newMonth, activeSubscriptions, expiredSubscriptions,
      campaignsToday, sentToday, failedToday, totalToday, loginFailuresToday, securityDenialsToday,
      adminActionsToday, supportTicketsToday, contactSyncCompletedToday, contactSyncFailedToday,
      clientErrorsToday, openOperationalAlerts,
    ] = await Promise.all([
      prisma.company.count({ where: { securityStatus: "ACTIVE" } }),
      prisma.subscription.count({ where: { status: "TRIALING" } }),
      prisma.company.count({ where: { createdAt: { gte: today } } }),
      prisma.company.count({ where: { createdAt: { gte: month } } }),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.subscription.count({ where: { status: "EXPIRED" } }),
      prisma.messageCampaign.count({ where: { createdAt: { gte: today } } }),
      prisma.messageRecipient.count({ where: { status: { in: ["SENT", "DELIVERED"] }, sentAt: { gte: today } } }),
      prisma.messageRecipient.count({ where: { status: "FAILED", failedAt: { gte: today } } }),
      prisma.messageRecipient.count({ where: { createdAt: { gte: today } } }),
      prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: today } } }),
      prisma.securityEvent.count({ where: { result: "DENIED", createdAt: { gte: today } } }),
      prisma.auditLog.count({ where: { actorType: "PLATFORM_ADMIN", createdAt: { gte: today } } }),
      prisma.supportTicket.count({ where: { createdAt: { gte: today } } }),
      prisma.contactSyncRun.count({ where: { status: "COMPLETED", completedAt: { gte: today } } }),
      prisma.contactSyncRun.count({ where: { status: "FAILED", updatedAt: { gte: today } } }),
      prisma.securityEvent.count({ where: { type: "CLIENT_ERROR_REPORTED", createdAt: { gte: today } } }),
      prisma.operationalAlert.count({ where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
    ]);
    return NextResponse.json({ metrics: {
      mrr: null,
      arr: null,
      activeCustomers,
      trials,
      newToday,
      newMonth,
      activeSubscriptions,
      expiredSubscriptions,
      campaignsToday,
      sentToday,
      failedToday,
      averageSuccessRate: totalToday ? Math.round((sentToday / totalToday) * 100) : 100,
      loginFailuresToday,
      securityDenialsToday,
      adminActionsToday,
      supportTicketsToday,
      contactSyncCompletedToday,
      contactSyncFailedToday,
      clientErrorsToday,
      openOperationalAlerts,
      trialConversionRate: null,
      churn: null,
    } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : 403 });
    logger.error("admin.metrics.load_failed", error);
    return NextResponse.json({ error: "METRICS_LOAD_FAILED" }, { status: 500 });
  }
}
