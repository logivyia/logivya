import type { Plan, Subscription } from "@prisma/client";

const DAY_MS = 86_400_000;

export function remainingDaysUntil(date?: Date | null) {
  if (!date) return null;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / DAY_MS));
}

function latestDate(...dates: Array<Date | null | undefined>) {
  return dates.filter((date): date is Date => Boolean(date)).sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

export function serializePlanLimits(plan?: Plan | null) {
  if (!plan) return null;
  return {
    maxWhatsappAccounts: plan.maxWhatsappAccounts,
    maxTeamUsers: plan.maxTeamUsers,
    hasScheduledMessages: true,
    hasRecurringMessages: true,
    advancedReportingEnabled: plan.advancedReportingEnabled,
    hasNoBranding: plan.hasNoBranding,
    hasCrm: plan.hasCrm,
    hasApi: plan.hasApi,
  };
}

export function serializeSubscription(subscription?: (Subscription & { plan: Plan }) | null) {
  if (!subscription) {
    return {
      planName: null,
      status: "EXPIRED",
      billingPeriod: null,
      startsAt: null,
      endsAt: null,
      remainingDays: 0,
      isTrial: false,
      isExpired: true,
      limits: null,
      lockedFeatures: ["whatsapp_connect", "message_send", "scheduled_messages"],
      upgradeRequired: true,
    };
  }
  const end = latestDate(subscription.currentPeriodEndsAt, subscription.endsAt, subscription.trialEndsAt);
  const remainingDays = remainingDaysUntil(end) ?? 0;
  const isTrial = subscription.status === "TRIALING";
  const isExpired = remainingDays <= 0 || ["EXPIRED", "CANCELED", "SUSPENDED", "PAST_DUE"].includes(subscription.status);
  return {
    planName: subscription.plan.name,
    status: subscription.status,
    billingPeriod: subscription.billingPeriod,
    startsAt: subscription.currentPeriodStartsAt ?? subscription.startsAt,
    endsAt: end,
    remainingDays,
    isTrial,
    isExpired,
    limits: serializePlanLimits(subscription.plan),
    lockedFeatures: isExpired ? ["whatsapp_connect", "message_send", "scheduled_messages"] : [],
    upgradeRequired: isExpired,
  };
}
