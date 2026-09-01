import type { Plan, Prisma, Subscription } from "@prisma/client";

import { corePlanRule } from "@/server/billing/plan-matrix";
import { prisma } from "@/server/db";

const ACTIVE_STATUSES = ["ACTIVE", "TRIALING"] as const;

type SubscriptionWithPlan = Subscription & { plan: Plan };
type SubscriptionReader = Pick<Prisma.TransactionClient, "subscription">;

export type CompanyEntitlements = {
  accountAccess: boolean;
  support: boolean;
  whatsappConnect: boolean;
  groupSync: boolean;
  categoryManagement: boolean;
  groupMessaging: boolean;
  contactMessaging: boolean;
  messageSend: boolean;
  scheduledMessages: boolean;
  recurringMessages: boolean;
  messageHistory: boolean;
  deleteForEveryone: boolean;
  deleteForMe: boolean;
  platformDelete: boolean;
  adFreeMessaging: boolean;
  advertisingEnabled: boolean;
  messageBrandingRequired: boolean;
  advancedSupport: boolean;
  teamSeats: number;
  whatsappConnections: number;
};

function latestDate(...dates: Array<Date | null | undefined>) {
  return dates.filter((date): date is Date => Boolean(date)).sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

function earliestDate(...dates: Array<Date | null | undefined>) {
  return dates.filter((date): date is Date => Boolean(date)).sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
}

export function isCompanySubscriptionActive(subscription: SubscriptionWithPlan, now = new Date()) {
  if (!(ACTIVE_STATUSES as readonly string[]).includes(subscription.status)) return false;
  const startsAt = earliestDate(subscription.currentPeriodStartsAt, subscription.startsAt, subscription.trialStartsAt);
  const endsAt = latestDate(subscription.currentPeriodEndsAt, subscription.endsAt, subscription.trialEndsAt);
  return (!startsAt || startsAt <= now) && (!endsAt || endsAt > now);
}

export function deriveCompanyEntitlements(plan: Plan | null | undefined, active: boolean): CompanyEntitlements {
  const rule = corePlanRule(plan?.slug);
  const groupMessaging = Boolean(active && (rule?.groupMessaging ?? plan?.groupMessagingEnabled !== false));
  const contactMessaging = Boolean(active && (rule?.contactMessaging ?? plan?.contactMessagingEnabled));
  const deleteForEveryone = Boolean(active && (rule?.deleteForEveryone ?? plan?.deleteForEveryoneEnabled !== false));
  const advertisingEnabled = Boolean(active && (rule?.advertisingEnabled ?? plan?.advertisingEnabled));
  const messageBrandingRequired = Boolean(active && (
    rule?.messageBrandingRequired ?? plan?.advertisingEnabled
  ));

  return {
    accountAccess: true,
    support: true,
    whatsappConnect: active,
    groupSync: active,
    categoryManagement: active,
    groupMessaging,
    contactMessaging,
    messageSend: groupMessaging || contactMessaging,
    scheduledMessages: Boolean(active && (rule?.scheduledMessaging ?? plan?.hasScheduledMessages)),
    recurringMessages: Boolean(active && (rule?.recurringMessaging ?? plan?.hasRecurringMessages)),
    messageHistory: true,
    deleteForEveryone,
    deleteForMe: true,
    platformDelete: true,
    adFreeMessaging: Boolean(active && plan && !advertisingEnabled),
    advertisingEnabled,
    messageBrandingRequired,
    advancedSupport: Boolean(active && (rule?.advancedSupport ?? true)),
    teamSeats: active ? Math.max(1, rule?.totalUserSeats ?? plan?.maxTeamUsers ?? 1) : 0,
    whatsappConnections: active ? Math.max(1, rule?.whatsappConnections ?? plan?.maxWhatsappAccounts ?? 1) : 0,
  };
}

export async function resolveCompanyEntitlementSummary(
  companyId: string,
  now = new Date(),
  actor?: { userId?: string; role?: string },
) {
  const current = await resolveCompanyEntitlements(companyId, prisma as unknown as SubscriptionReader, now);
  const [activeSeatCount, suspendedSeatCount, invitedMembershipCount, pendingInvitationCount, whatsappConnectionsUsed, trialEntitlement] = await Promise.all([
    prisma.companyUser.count({ where: { companyId, status: "ACTIVE" } }),
    prisma.companyUser.count({ where: { companyId, status: "SUSPENDED" } }),
    prisma.companyUser.count({ where: { companyId, status: "INVITED" } }),
    prisma.companyInvitation.count({ where: { companyId, status: "PENDING", reservedSeat: true, expiresAt: { gt: now } } }),
    prisma.whatsAppAccount.count({ where: { companyId, archivedAt: null } }),
    prisma.trialEntitlement.findFirst({
      where: { companyId, ...(actor?.userId ? { userId: actor.userId } : {}) },
      orderBy: { createdAt: "asc" },
      select: { status: true, decisionCode: true, startedAt: true, endsAt: true },
    }),
  ]);
  const totalSeatLimit = current?.entitlements.teamSeats ?? 0;
  const usedSeatCount = activeSeatCount + suspendedSeatCount + invitedMembershipCount + pendingInvitationCount;
  const availableSeats = Math.max(0, totalSeatLimit - usedSeatCount);
  const entitlements = current?.entitlements ?? deriveCompanyEntitlements(null, false);
  const pendingIdentityVerification = !current?.valid && trialEntitlement?.status === "PENDING_IDENTITY";
  const whatsappConnectionLimit = current?.entitlements.whatsappConnections ?? (pendingIdentityVerification ? 1 : 0);

  return {
    planCode: current?.plan.slug ?? null,
    planName: current?.plan.name ?? null,
    subscriptionStatus: current?.subscription.status ?? (pendingIdentityVerification ? "PENDING_IDENTITY" : "EXPIRED"),
    isTrial: current?.plan.slug === "trial" || current?.subscription.source === "TRIAL",
    startsAt: current?.subscription.currentPeriodStartsAt ?? current?.subscription.startsAt ?? current?.subscription.trialStartsAt ?? null,
    endsAt: current?.subscription.currentPeriodEndsAt ?? current?.subscription.endsAt ?? current?.subscription.trialEndsAt ?? null,
    isActive: current?.valid ?? false,
    totalSeatLimit,
    activeSeatCount,
    suspendedSeatCount,
    pendingInvitationCount: pendingInvitationCount + invitedMembershipCount,
    availableSeats,
    seatLimit: totalSeatLimit,
    seatsUsed: usedSeatCount,
    pendingInviteSeats: pendingInvitationCount,
    seatReconciliationRequired: usedSeatCount > totalSeatLimit,
    canInviteMembers: Boolean(current?.valid && availableSeats > 0),
    whatsappConnectionLimit,
    whatsappConnectionsUsed,
    whatsappConnectionsAvailable: Math.max(0, whatsappConnectionLimit - whatsappConnectionsUsed),
    canConnectWhatsApp: entitlements.whatsappConnect || (pendingIdentityVerification && whatsappConnectionsUsed < 1),
    canSendToGroups: entitlements.groupMessaging,
    canSendToContacts: entitlements.contactMessaging,
    canScheduleMessages: entitlements.scheduledMessages,
    canCreateRecurringMessages: entitlements.recurringMessages,
    canDeleteForEveryone: entitlements.deleteForEveryone,
    isAdvertisingEnabled: entitlements.advertisingEnabled,
    isMessageBrandingRequired: entitlements.messageBrandingRequired,
    canAccessAdvancedSupport: entitlements.advancedSupport,
    canManageBilling: actor?.role === "OWNER",
    canManageTeam: actor?.role === "OWNER",
    trialEligibilityStatus: trialEntitlement?.status ?? null,
    trialDecisionCode: trialEntitlement?.decisionCode ?? null,
    trialStartsAt: trialEntitlement?.startedAt ?? null,
    trialEndsAt: trialEntitlement?.endsAt ?? null,
  };
}

export async function resolveCompanyEntitlements(
  companyId: string,
  reader: SubscriptionReader = prisma as unknown as SubscriptionReader,
  now = new Date(),
) {
  const subscriptions = await reader.subscription.findMany({
    where: { companyId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  if (!subscriptions.length) return null;

  const ranked = subscriptions.map((subscription) => ({
    subscription,
    plan: subscription.plan,
    valid: isCompanySubscriptionActive(subscription, now),
  }));
  const current = ranked.find((item) => item.valid) ?? ranked[0];
  return {
    ...current,
    entitlements: deriveCompanyEntitlements(current.plan, current.valid),
  };
}
