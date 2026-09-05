import { NextResponse } from "next/server";

import { adminSecurityEventPrivacyWhere } from "@/server/admin/message-privacy";
import { hasAdminPermission } from "@/server/auth/admin-permissions";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";

export async function GET(request: Request) {
  try {
    const admin = await requirePlatformAdmin("admin.dashboard.read", request);
    const can = (permission: string) =>
      hasAdminPermission(
        admin.platformAdmin.role,
        admin.platformAdmin.permissions,
        permission,
      );
    const canCompanies = can("admin.companies.read");
    const canUsers = can("admin.users.read");
    const canBilling = can("admin.billing.read") || can("admin.payments.read");
    const canWhatsApp = can("admin.whatsapp.read");
    const canCampaigns = can("admin.campaignMetrics.read");
    const canSupport = can("admin.support.read");
    const canSecurity = can("admin.security.read");
    const canAudit = can("admin.audit.read");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const month = new Date(today.getFullYear(), today.getMonth(), 1);
    const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60_000);

    const [
      companyStates,
      userStates,
      subscriptionStates,
      pendingSubscriptionRequests,
      expiringInSevenDays,
      monthlyPayments,
      allPayments,
      accountStates,
      campaignStates,
      messages,
      supportStates,
      urgentTickets,
      criticalSecurityAlerts,
      securityEvents,
      tickets,
      billingEvents,
      recentAdminActions,
    ] = await Promise.all([
      canCompanies
        ? prisma.company.groupBy({
            by: ["securityStatus"],
            _count: { _all: true },
          })
        : Promise.resolve([]),
      canUsers
        ? prisma.user.groupBy({ by: ["status"], _count: { _all: true } })
        : Promise.resolve([]),
      canBilling
        ? prisma.subscription.groupBy({
            by: ["status"],
            _count: { _all: true },
          })
        : Promise.resolve([]),
      canBilling
        ? prisma.subscriptionRequest.count({
            where: {
              status: {
                in: [
                  "AWAITING_PAYMENT",
                  "UNDER_REVIEW",
                  "CLARIFICATION_REQUIRED",
                ],
              },
            },
          })
        : Promise.resolve(0),
      canBilling
        ? prisma.subscription.count({
            where: {
              status: "ACTIVE",
              OR: [
                { endsAt: { gte: today, lte: inSevenDays } },
                {
                  endsAt: null,
                  currentPeriodEndsAt: { gte: today, lte: inSevenDays },
                },
              ],
            },
          })
        : Promise.resolve(0),
      canBilling
        ? prisma.payment.groupBy({
            by: ["currency", "status"],
            where: {
              status: { in: ["PAID", "SUCCEEDED", "MANUALLY_CONFIRMED"] },
              paidAt: { gte: month },
            },
            _sum: { amount: true },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      canBilling
        ? prisma.payment.groupBy({ by: ["status"], _count: { _all: true } })
        : Promise.resolve([]),
      canWhatsApp
        ? prisma.whatsAppAccount.groupBy({
            by: ["status"],
            where: { archivedAt: null },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      canCampaigns
        ? prisma.messageCampaign.groupBy({
            by: ["status"],
            where: { deletedAt: null },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      canCampaigns
        ? prisma.messageRecipient.count({
            where: { status: { in: ["SENT", "DELIVERED"] } },
          })
        : Promise.resolve(0),
      canSupport
        ? prisma.supportTicket.groupBy({
            by: ["status"],
            _count: { _all: true },
          })
        : Promise.resolve([]),
      canSupport
        ? prisma.supportTicket.count({
            where: {
              priority: "URGENT",
              status: { notIn: ["RESOLVED", "CLOSED"] },
            },
          })
        : Promise.resolve(0),
      canSecurity
        ? prisma.securityEvent.count({
            where: { severity: "CRITICAL", resolvedAt: null },
          })
        : Promise.resolve(0),
      canSecurity
        ? prisma.securityEvent.findMany({
            where: adminSecurityEventPrivacyWhere({
              severity: { in: ["HIGH", "CRITICAL"] },
            }),
            select: {
              id: true,
              severity: true,
              type: true,
              result: true,
              status: true,
              errorCode: true,
              source: true,
              createdAt: true,
              resolvedAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 5,
          })
        : Promise.resolve([]),
      canSupport
        ? prisma.supportTicket.findMany({
            orderBy: { lastMessageAt: "desc" },
            take: 5,
            select: {
              id: true,
              publicId: true,
              title: true,
              status: true,
              priority: true,
              lastMessageAt: true,
            },
          })
        : Promise.resolve([]),
      canBilling
        ? prisma.subscriptionEvent.findMany({
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              type: true,
              message: true,
              createdAt: true,
              company: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      canAudit
        ? prisma.adminAccessLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              path: true,
              method: true,
              permission: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const metrics: Record<string, string | number> = {
      companies: totalGroups(companyStates),
      activeCompanies: groupCount(companyStates, "securityStatus", "ACTIVE"),
      suspendedCompanies: groupCount(
        companyStates,
        "securityStatus",
        "DISABLED",
      ),
      companiesUnderInvestigation: groupCount(
        companyStates,
        "securityStatus",
        "UNDER_INVESTIGATION",
      ),
      users: totalGroups(userStates),
      activeUsers: groupCount(userStates, "status", "ACTIVE"),
      suspendedUsers: groupCount(userStates, "status", "SUSPENDED"),
      activeSubscriptions: groupCount(subscriptionStates, "status", "ACTIVE"),
      trials: groupCount(subscriptionStates, "status", "TRIALING"),
      expiredSubscriptions: groupCount(subscriptionStates, "status", "EXPIRED"),
      suspendedSubscriptions: groupCount(
        subscriptionStates,
        "status",
        "SUSPENDED",
      ),
      pendingSubscriptionRequests,
      expiringInSevenDays,
      successfulPayments: ["PAID", "SUCCEEDED", "MANUALLY_CONFIRMED"].reduce(
        (sum, status) => sum + groupCount(allPayments, "status", status),
        0,
      ),
      failedPayments: groupCount(allPayments, "status", "FAILED"),
      pendingPayments: groupCount(allPayments, "status", "PENDING"),
      refundedPayments: groupCount(allPayments, "status", "REFUNDED"),
      accounts: totalGroups(accountStates),
      connectedAccounts: groupCount(accountStates, "status", "CONNECTED"),
      reconnectingAccounts:
        groupCount(accountStates, "status", "CONNECTING") +
        groupCount(accountStates, "status", "RECONNECT_REQUIRED"),
      failedAccounts:
        groupCount(accountStates, "status", "FAILED") +
        groupCount(accountStates, "status", "ERROR"),
      campaigns: totalGroups(campaignStates),
      queuedCampaigns:
        groupCount(campaignStates, "status", "QUEUED") +
        groupCount(campaignStates, "status", "SCHEDULED"),
      runningCampaigns: groupCount(campaignStates, "status", "SENDING"),
      completedCampaigns: groupCount(campaignStates, "status", "COMPLETED"),
      failedCampaigns: groupCount(campaignStates, "status", "FAILED"),
      messages,
      openSupportTickets: supportStates
        .filter((row) => !["RESOLVED", "CLOSED"].includes(row.status))
        .reduce((sum, row) => sum + row._count._all, 0),
      urgentTickets,
      criticalSecurityAlerts,
    };
    for (const payment of monthlyPayments) {
      metrics[`monthlyRevenue_${payment.currency}`] =
        Number(metrics[`monthlyRevenue_${payment.currency}`] ?? 0) +
        Number(payment._sum.amount ?? 0);
    }
    metrics.monthlyConfirmedPaymentTotal = String(
      metrics.monthlyRevenue_TRY ?? 0,
    );
    metrics.connected = metrics.connectedAccounts;
    metrics.disconnected =
      Number(metrics.accounts) - Number(metrics.connectedAccounts);

    return NextResponse.json({
      metrics,
      securityEvents,
      tickets,
      billingEvents,
      recentAdminActions,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const safe = safeAdminError(error, requestId(request));
    return NextResponse.json(safe.body, { status: safe.status });
  }
}

function groupCount<T extends Record<string, unknown>>(
  rows: Array<T & { _count: { _all: number } }>,
  key: keyof T,
  value: string,
) {
  return rows.find((row) => String(row[key]) === value)?._count._all ?? 0;
}

function totalGroups(rows: Array<{ _count: { _all: number } }>) {
  return rows.reduce((sum, row) => sum + row._count._all, 0);
}
