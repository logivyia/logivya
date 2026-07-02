import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("admin.dashboard.read", request);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const month = new Date(today.getFullYear(), today.getMonth(), 1);
    const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60_000);

    const [
      companies,
      users,
      activeSubscriptions,
      trials,
      pendingSubscriptionRequests,
      expiringInSevenDays,
      confirmedPayments,
      accounts,
      connected,
      campaigns,
      messages,
      securityEvents,
      tickets,
      billingEvents,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.user.count(),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.subscription.count({ where: { status: "TRIALING" } }),
      prisma.subscription.count({ where: { status: { in: ["MANUAL_PENDING", "PAYMENT_PENDING"] } } }),
      prisma.subscription.count({
        where: {
          status: "ACTIVE",
          OR: [
            { endsAt: { gte: today, lte: inSevenDays } },
            { endsAt: null, currentPeriodEndsAt: { gte: today, lte: inSevenDays } },
          ],
        },
      }),
      prisma.payment.aggregate({
        where: { status: "MANUALLY_CONFIRMED", paidAt: { gte: month }, currency: "TRY" },
        _sum: { amount: true },
      }),
      prisma.whatsAppAccount.count({ where: { archivedAt: null } }),
      prisma.whatsAppAccount.count({ where: { status: { in: ["CONNECTED", "CONNECTING", "DISCONNECTED", "RECONNECT_REQUIRED"] }, archivedAt: null, NOT: { lastError: { in: ["WHATSAPP_LOGGED_OUT", "WHATSAPP_CREDENTIALS_MISSING"] } } } }),
      prisma.messageCampaign.count({ where: { deletedAt: null } }),
      prisma.messageRecipient.count({ where: { status: "SENT" } }),
      prisma.securityEvent.findMany({ where: { severity: { in: ["HIGH", "CRITICAL"] } }, orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.supportTicket.findMany({ orderBy: { lastMessageAt: "desc" }, take: 5 }),
      prisma.subscriptionEvent.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    ]);

    return NextResponse.json({
      metrics: {
        companies,
        users,
        activeSubscriptions,
        trials,
        pendingSubscriptionRequests,
        expiringInSevenDays,
        monthlyConfirmedPaymentTotal: confirmedPayments._sum.amount?.toString() ?? "0",
        accounts,
        connected,
        disconnected: accounts - connected,
        campaigns,
        messages,
      },
      securityEvents,
      tickets,
      billingEvents,
    });
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}
