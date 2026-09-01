import "server-only";

import type { MembershipLifecycleState } from "@prisma/client";

import { corePlanRule } from "@/server/billing/plan-matrix";
import { resolveCompanyEntitlements } from "@/server/billing/company-entitlements";
import { prisma } from "@/server/db";

export const TENANT_CAPABILITIES = [
  "tenant.members.read",
  "tenant.members.create",
  "tenant.members.manage_pending",
  "tenant.members.manage_activated",
  "tenant.subscription.read",
  "tenant.subscription.manage",
  "personal.subscription.request",
  "membership.self_delete",
  "tenant.delete",
] as const;

export type TenantCapability = (typeof TENANT_CAPABILITIES)[number];
export type TenantCapabilities = Record<TenantCapability, boolean>;

export type MembershipAccess = {
  membershipId: string;
  companyId: string;
  userId: string;
  role: string;
  lifecycleState: MembershipLifecycleState;
  sharedAccess: boolean;
  sharedAccessExpired: boolean;
  subscriptionActive: boolean;
  subscriptionOwner: { id: string; name: string; email: string } | null;
  plan: {
    code: string;
    name: string;
    startsAt: Date | null;
    endsAt: Date | null;
    remainingDays: number;
    accountLimit: number;
  } | null;
  capabilities: TenantCapabilities;
};

const NO_CAPABILITIES: TenantCapabilities = {
  "tenant.members.read": false,
  "tenant.members.create": false,
  "tenant.members.manage_pending": false,
  "tenant.members.manage_activated": false,
  "tenant.subscription.read": false,
  "tenant.subscription.manage": false,
  "personal.subscription.request": false,
  "membership.self_delete": false,
  "tenant.delete": false,
};

function subscriptionDates(subscription: {
  startsAt: Date | null;
  endsAt: Date | null;
  currentPeriodStartsAt: Date | null;
  currentPeriodEndsAt: Date | null;
  trialStartsAt: Date | null;
  trialEndsAt: Date | null;
}) {
  return {
    startsAt: subscription.currentPeriodStartsAt
      ?? subscription.startsAt
      ?? subscription.trialStartsAt,
    endsAt: subscription.currentPeriodEndsAt
      ?? subscription.endsAt
      ?? subscription.trialEndsAt,
  };
}

function remainingDays(endsAt: Date | null, now: Date) {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000));
}

function capabilitiesFor(input: {
  role: string;
  lifecycleState: MembershipLifecycleState;
  membershipActive: boolean;
}) {
  if (!input.membershipActive) return { ...NO_CAPABILITIES };
  if (input.role === "OWNER" && input.lifecycleState === "INDEPENDENT_OWNER") {
    return {
      "tenant.members.read": true,
      "tenant.members.create": true,
      "tenant.members.manage_pending": true,
      "tenant.members.manage_activated": false,
      "tenant.subscription.read": true,
      "tenant.subscription.manage": true,
      "personal.subscription.request": false,
      "membership.self_delete": true,
      "tenant.delete": true,
    } satisfies TenantCapabilities;
  }
  if (input.lifecycleState === "ACTIVE_SHARED_MEMBER") {
    return {
      ...NO_CAPABILITIES,
      "tenant.members.read": true,
      "tenant.subscription.read": true,
      "membership.self_delete": true,
    };
  }
  if (input.lifecycleState === "SHARED_SUBSCRIPTION_EXPIRED") {
    return {
      ...NO_CAPABILITIES,
      "tenant.members.read": true,
      "tenant.subscription.read": true,
      "personal.subscription.request": true,
      "membership.self_delete": true,
    };
  }
  return { ...NO_CAPABILITIES };
}

function effectiveLifecycleState(input: {
  role: string;
  status: string;
  userStatus: string;
  current: MembershipLifecycleState;
  mustChangePassword: boolean;
  subscriptionActive: boolean;
}) {
  if (input.status === "REMOVED") {
    return input.mustChangePassword
      ? "REMOVED_BEFORE_ACTIVATION"
      : "DETACHED";
  }
  if (input.userStatus === "SUSPENDED") return "SUSPENDED_FOR_SECURITY";
  if (input.status === "SUSPENDED") return "SUSPENDED_FOR_SECURITY";
  if (input.role === "OWNER") return "INDEPENDENT_OWNER";
  if (input.current === "PENDING_ACTIVATION" || input.mustChangePassword) {
    return "PENDING_ACTIVATION";
  }
  if (input.current === "DETACHED" || input.current === "REMOVED_BEFORE_ACTIVATION") {
    return input.current;
  }
  return input.subscriptionActive
    ? "ACTIVE_SHARED_MEMBER"
    : "SHARED_SUBSCRIPTION_EXPIRED";
}

export async function resolveMembershipAccess(
  companyId: string,
  userId: string,
  options: { reconcile?: boolean; now?: Date } = {},
): Promise<MembershipAccess> {
  const now = options.now ?? new Date();
  const [membership, currentSubscription] = await Promise.all([
    prisma.companyUser.findUnique({
      where: { companyId_userId: { companyId, userId } },
      include: {
        user: { select: { mustChangePassword: true, status: true } },
        company: {
          select: {
            owner: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
    resolveCompanyEntitlements(companyId, prisma, now),
  ]);
  if (!membership) throw new Error("MEMBER_NOT_FOUND");

  const lifecycleState = effectiveLifecycleState({
    role: membership.role,
    status: membership.status,
    userStatus: membership.user.status,
    current: membership.lifecycleState,
    mustChangePassword: membership.user.mustChangePassword,
    subscriptionActive: Boolean(currentSubscription?.valid),
  });
  if (options.reconcile !== false && lifecycleState !== membership.lifecycleState) {
    await prisma.$transaction([
      prisma.companyUser.update({
        where: { id: membership.id },
        data: {
          lifecycleState,
          ...(lifecycleState === "SHARED_SUBSCRIPTION_EXPIRED"
            ? { sharedAccessExpiredAt: membership.sharedAccessExpiredAt ?? now }
            : {}),
          ...(lifecycleState === "ACTIVE_SHARED_MEMBER"
            ? { sharedAccessExpiredAt: null }
            : {}),
        },
      }),
      prisma.auditLog.create({
        data: {
          companyId,
          userId,
          actorType: "SYSTEM",
          action: "MEMBERSHIP_LIFECYCLE_RECONCILED",
          entityType: "CompanyUser",
          entityId: membership.id,
          beforeState: { lifecycleState: membership.lifecycleState },
          afterState: {
            lifecycleState,
            subscriptionActive: Boolean(currentSubscription?.valid),
          },
          metadata: { source: "request-time-entitlement-reconciliation" },
        },
      }),
    ]);
  }

  const dates = currentSubscription
    ? subscriptionDates(currentSubscription.subscription)
    : null;
  const planRule = corePlanRule(currentSubscription?.plan.slug);
  const membershipActive = membership.status === "ACTIVE";
  const sharedAccess = membership.role !== "OWNER"
    && lifecycleState === "ACTIVE_SHARED_MEMBER";
  const sharedAccessExpired = membership.role !== "OWNER"
    && lifecycleState === "SHARED_SUBSCRIPTION_EXPIRED";

  return {
    membershipId: membership.id,
    companyId,
    userId,
    role: membership.role,
    lifecycleState,
    sharedAccess,
    sharedAccessExpired,
    subscriptionActive: Boolean(currentSubscription?.valid),
    subscriptionOwner: membership.company.owner,
    plan: currentSubscription
      ? {
          code: currentSubscription.plan.slug,
          name: currentSubscription.plan.name,
          startsAt: dates?.startsAt ?? null,
          endsAt: dates?.endsAt ?? null,
          remainingDays: remainingDays(dates?.endsAt ?? null, now),
          accountLimit: Math.max(
            1,
            planRule?.totalUserSeats ?? currentSubscription.plan.maxTeamUsers,
          ),
        }
      : null,
    capabilities: capabilitiesFor({
      role: membership.role,
      lifecycleState,
      membershipActive,
    }),
  };
}

export function assertTenantCapability(
  access: MembershipAccess,
  capability: TenantCapability,
  errorCode = "FORBIDDEN",
) {
  if (!access.capabilities[capability]) throw new Error(errorCode);
}

export function serializeMembershipAccess(access: MembershipAccess) {
  return {
    membershipId: access.membershipId,
    lifecycleState: access.lifecycleState,
    sharedAccess: access.sharedAccess,
    sharedAccessExpired: access.sharedAccessExpired,
    subscriptionActive: access.subscriptionActive,
    subscriptionOwner: access.subscriptionOwner,
    plan: access.plan
      ? {
          ...access.plan,
          startsAt: access.plan.startsAt?.toISOString() ?? null,
          endsAt: access.plan.endsAt?.toISOString() ?? null,
        }
      : null,
    capabilities: access.capabilities,
  };
}
