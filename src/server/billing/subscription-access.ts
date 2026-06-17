import { prisma } from "@/server/db";

export const INACTIVE_SUBSCRIPTION_MESSAGE =
  "Aboneliginiz aktif degil. Mesaj gondermek veya yeni WhatsApp hesabi baglamak icin paketinizi yenileyin.";

const BILLABLE_WHATSAPP_ACCOUNT_STATUSES = [
  "CONNECTED",
  "PENDING_QR",
  "PENDING_PAIRING",
  "QR_READY",
  "PAIRING_CODE_READY",
  "CONNECTING",
  "DISCONNECTED",
  "RECONNECT_REQUIRED",
] as const;

export class SubscriptionAccessService {
  async getCurrent(companyId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: { companyId },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });
    if (!subscription) return null;

    const now = new Date();
    const valid =
      ["ACTIVE", "TRIALING"].includes(subscription.status) &&
      (!subscription.currentPeriodEndsAt || subscription.currentPeriodEndsAt > now) &&
      (!subscription.trialEndsAt || subscription.trialEndsAt > now);

    return { subscription, plan: subscription.plan, valid };
  }

  async requireActive(companyId: string) {
    const current = await this.getCurrent(companyId);
    if (!current?.valid) throw new Error("subscription.inactive");
    return current;
  }

  async canConnectWhatsAppAccount(companyId: string) {
    const current = await this.getCurrent(companyId);
    if (!current?.valid) return { allowed: false, reason: "subscription.inactive", limit: 0 };

    const count = await prisma.whatsAppAccount.count({
      where: {
        companyId,
        archivedAt: null,
        status: { in: [...BILLABLE_WHATSAPP_ACCOUNT_STATUSES] },
      },
    });

    return {
      allowed: count < current.plan.maxWhatsappAccounts,
      reason: count >= current.plan.maxWhatsappAccounts ? "accounts.planLimit" : undefined,
      limit: current.plan.maxWhatsappAccounts,
      used: count,
    };
  }

  async canSendMessage(companyId: string, requestedRecipients = 0) {
    const current = await this.getCurrent(companyId);
    if (!current?.valid) return { allowed: false, reason: "subscription.inactive" };

    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [daily, monthly] = await Promise.all([
      prisma.messageRecipient.count({ where: { campaign: { companyId }, createdAt: { gte: dayStart } } }),
      prisma.messageRecipient.count({ where: { campaign: { companyId }, createdAt: { gte: monthStart } } }),
    ]);

    if (daily + requestedRecipients > current.plan.maxMessagesPerDay) {
      return {
        allowed: false,
        reason: "subscription.dailyMessageLimit",
        limit: current.plan.maxMessagesPerDay,
        used: daily,
      };
    }

    if (monthly + requestedRecipients > current.plan.maxMessagesPerMonth) {
      return {
        allowed: false,
        reason: "subscription.monthlyMessageLimit",
        limit: current.plan.maxMessagesPerMonth,
        used: monthly,
      };
    }

    return { allowed: true, limit: current.plan.maxMessagesPerMonth, used: monthly };
  }

  async canUseScheduledMessages(companyId: string) {
    const current = await this.getCurrent(companyId);
    return Boolean(current?.valid && current.plan.hasScheduledMessages);
  }

  async canUseRecurringMessages(companyId: string) {
    const current = await this.getCurrent(companyId);
    return Boolean(current?.valid && current.plan.hasRecurringMessages);
  }

  async canInviteUser(companyId: string) {
    const current = await this.getCurrent(companyId);
    if (!current?.valid) return { allowed: false, limit: 0 };
    const count = await prisma.companyUser.count({ where: { companyId, status: { not: "SUSPENDED" } } });
    return { allowed: count < current.plan.maxTeamUsers, limit: current.plan.maxTeamUsers };
  }

  async canUseAdvancedReports(companyId: string) {
    const current = await this.getCurrent(companyId);
    return Boolean(current?.valid && current.plan.advancedReportingEnabled);
  }

  async getAccountLimit(companyId: string) {
    return (await this.getCurrent(companyId))?.plan.maxWhatsappAccounts ?? 0;
  }

  async getTeamUserLimit(companyId: string) {
    return (await this.getCurrent(companyId))?.plan.maxTeamUsers ?? 0;
  }

  async getCurrentPlan(companyId: string) {
    return (await this.getCurrent(companyId))?.plan ?? null;
  }

  async getSubscriptionStatus(companyId: string) {
    return (await this.getCurrent(companyId))?.subscription.status ?? "EXPIRED";
  }
}

export const subscriptionAccess = new SubscriptionAccessService();
