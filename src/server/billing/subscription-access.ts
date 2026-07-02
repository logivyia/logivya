import type { Plan, Subscription } from "@prisma/client";
import { prisma } from "@/server/db";

export const INACTIVE_SUBSCRIPTION_MESSAGE =
  "Aboneliginiz aktif degil. Mesaj gondermek veya yeni WhatsApp hesabi baglamak icin paketinizi yenileyin.";

const ACTIVE_SUBSCRIPTION_STATUSES = ["ACTIVE", "TRIALING"] as const;

type SubscriptionWithPlan = Subscription & { plan: Plan };

function newestDate(...dates: Array<Date | null | undefined>) {
  return dates.filter((date): date is Date => Boolean(date)).sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

function oldestDate(...dates: Array<Date | null | undefined>) {
  return dates.filter((date): date is Date => Boolean(date)).sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
}

function subscriptionEndDate(subscription: SubscriptionWithPlan) {
  return newestDate(subscription.currentPeriodEndsAt, subscription.endsAt, subscription.trialEndsAt);
}

function subscriptionStartDate(subscription: SubscriptionWithPlan) {
  return oldestDate(subscription.currentPeriodStartsAt, subscription.startsAt, subscription.trialStartsAt);
}

function isSubscriptionValid(subscription: SubscriptionWithPlan, now = new Date()) {
  if (!(ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(subscription.status)) return false;
  const startsAt = subscriptionStartDate(subscription);
  if (startsAt && startsAt > now) return false;
  const endsAt = subscriptionEndDate(subscription);
  return !endsAt || endsAt > now;
}

export class SubscriptionAccessService {
  async getCurrent(companyId: string) {
    const subscriptions = await prisma.subscription.findMany({
      where: { companyId },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    if (!subscriptions.length) return null;

    const now = new Date();
    const ranked = subscriptions.map((subscription) => ({
      subscription,
      plan: subscription.plan,
      valid: isSubscriptionValid(subscription, now),
    }));

    return ranked.find((item) => item.valid) ?? ranked[0];
  }

  async requireActive(companyId: string) {
    const current = await this.getCurrent(companyId);
    if (!current?.valid) throw new Error("subscription.inactive");
    return current;
  }

  async canConnectWhatsAppAccount(companyId: string) {
    const current = await this.getCurrent(companyId);
    if (!current?.valid) return { allowed: false, reason: "subscription.inactive", limit: 0 };
    return { allowed: true, reason: undefined, limit: undefined, used: 0 };
  }

  async canSendMessage(companyId: string, requestedRecipients = 0) {
    const current = await this.getCurrent(companyId);
    if (!current?.valid) return { allowed: false, reason: "subscription.inactive", limit: undefined, used: 0 };

    return { allowed: true, limit: undefined, used: requestedRecipients };
  }

  async canUseScheduledMessages(companyId: string) {
    const current = await this.getCurrent(companyId);
    return Boolean(current?.valid);
  }

  async canUseRecurringMessages(companyId: string) {
    const current = await this.getCurrent(companyId);
    return Boolean(current?.valid);
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
