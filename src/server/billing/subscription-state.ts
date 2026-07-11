import type { Plan, Subscription } from "@prisma/client";
import { remainingDaysUntil } from "@/server/billing/trial-policy";

type SubscriptionWithPlan = Subscription & { plan: Plan };

const ACTIVE_STATUSES = ["ACTIVE", "TRIALING"] as const;
const LOCKED_FEATURES = ["whatsapp_connect", "group_sync", "message_send", "scheduled_messages", "recurring_messages", "delete_for_everyone"];

function latestDate(...dates: Array<Date | null | undefined>) {
  return dates.filter((date): date is Date => Boolean(date)).sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

function earliestDate(...dates: Array<Date | null | undefined>) {
  return dates.filter((date): date is Date => Boolean(date)).sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
}

export function serializePlanLimits(plan?: Plan | null) {
  if (!plan) return null;
  return {
    maxWhatsappAccounts: plan.maxWhatsappAccounts,
    maxTeamUsers: plan.maxTeamUsers,
    maxGroups: plan.maxGroups,
    maxMessagesPerDay: plan.maxMessagesPerDay,
    maxMessagesPerMonth: plan.maxMessagesPerMonth,
    hasScheduledMessages: true,
    hasRecurringMessages: true,
    advancedReportingEnabled: plan.advancedReportingEnabled,
    hasNoBranding: plan.hasNoBranding,
    hasCrm: plan.hasCrm,
    hasApi: plan.hasApi,
  };
}

export function serializeSubscription(subscription?: SubscriptionWithPlan | null, now = new Date()) {
  if (!subscription) {
    return {
      planName: null,
      planSlug: null,
      status: "EXPIRED",
      billingPeriod: null,
      startsAt: null,
      endsAt: null,
      trialStartsAt: null,
      trialEndsAt: null,
      trialDurationDays: 0,
      remainingDays: 0,
      isTrial: false,
      isActive: false,
      isExpired: true,
      limits: null,
      entitlements: standardEntitlements(false),
      lockedFeatures: LOCKED_FEATURES,
      upgradeRequired: true,
    };
  }

  const startsAt = earliestDate(subscription.currentPeriodStartsAt, subscription.startsAt, subscription.trialStartsAt);
  const endsAt = latestDate(subscription.currentPeriodEndsAt, subscription.endsAt, subscription.trialEndsAt);
  const remainingDays = remainingDaysUntil(endsAt, now) ?? 0;
  const hasActiveStatus = (ACTIVE_STATUSES as readonly string[]).includes(subscription.status);
  const isActive = hasActiveStatus && (!startsAt || startsAt <= now) && (!endsAt || endsAt > now);
  const isTrial = subscription.status === "TRIALING" || subscription.source === "TRIAL" || subscription.plan.slug === "trial";

  return {
    planName: subscription.plan.name,
    planSlug: subscription.plan.slug,
    status: subscription.status,
    billingPeriod: subscription.billingPeriod,
    startsAt,
    endsAt,
    trialStartsAt: subscription.trialStartsAt,
    trialEndsAt: subscription.trialEndsAt,
    trialDurationDays: isTrial ? subscription.plan.trialDays : 0,
    remainingDays,
    isTrial,
    isActive,
    isExpired: !isActive,
    limits: serializePlanLimits(subscription.plan),
    entitlements: standardEntitlements(isActive),
    lockedFeatures: isActive ? [] : LOCKED_FEATURES,
    upgradeRequired: !isActive,
  };
}

function standardEntitlements(active: boolean) {
  return {
    accountAccess: true,
    support: true,
    whatsappConnect: active,
    groupSync: active,
    categoryManagement: active,
    messageSend: active,
    scheduledMessages: active,
    recurringMessages: active,
    messageHistory: true,
    deleteForEveryone: active,
    deleteForMe: true,
    platformDelete: true,
  };
}
