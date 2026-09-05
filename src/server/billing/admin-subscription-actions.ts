import type { BillingPeriod, Subscription, Plan } from "@prisma/client";

import { activateCompanySubscription } from "@/server/billing/subscription-activation";
import { prisma } from "@/server/db";

const DAY_MS = 86_400_000;

export type AdminSubscriptionAction =
  | { action: "ACTIVATE"; reason: string }
  | { action: "SUSPEND"; reason: string }
  | { action: "CANCEL"; reason: string }
  | { action: "EXTEND"; reason: string; endsAt?: Date; extensionDays?: number }
  | {
      action: "CHANGE_PLAN";
      reason: string;
      planSlug: string;
      durationMonths?: number;
    };

export class AdminSubscriptionActionError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "INVALID_EXTENSION" | "STATE_CHANGED",
  ) {
    super(code);
    this.name = "AdminSubscriptionActionError";
  }
}

type SubscriptionWithPlan = Subscription & { plan: Plan };

export type AdminSubscriptionActionResult = {
  before: SubscriptionWithPlan;
  subscription: Subscription;
  activationManagedAudit: boolean;
};

function normalizedBillingPeriod(period: BillingPeriod): BillingPeriod {
  return period === "TRIAL" ? "MONTHLY" : period;
}

export function calendarMonthsAfter(value: Date, months: number) {
  const result = new Date(value);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

export async function performAdminSubscriptionAction(input: {
  subscriptionId: string;
  actorUserId: string;
  correlationId: string;
  data: AdminSubscriptionAction;
}): Promise<AdminSubscriptionActionResult> {
  const before = await prisma.subscription.findUnique({
    where: { id: input.subscriptionId },
    include: { plan: true },
  });
  if (!before) throw new AdminSubscriptionActionError("NOT_FOUND");

  const { data } = input;
  if (data.action === "ACTIVATE" || data.action === "CHANGE_PLAN") {
    const now = new Date();
    const currentEnd =
      before.currentPeriodEndsAt ?? before.endsAt ?? before.trialEndsAt;
    const endsAt = data.action === "CHANGE_PLAN"
      ? calendarMonthsAfter(now, data.durationMonths ?? 1)
      : currentEnd && currentEnd > now
        ? currentEnd
        : new Date(now.getTime() + 30 * DAY_MS);
    const result = await activateCompanySubscription({
      companyId: before.companyId,
      planSlug:
        data.action === "CHANGE_PLAN" ? data.planSlug : before.plan.slug,
      billingPeriod: normalizedBillingPeriod(before.billingPeriod),
      startsAt: now,
      endsAt,
      source: "MANUAL_ADMIN",
      actorUserId: input.actorUserId,
      reason: data.reason,
      correlationId: input.correlationId,
      payment: {
        mode: "CREATE",
        provider: "MANUAL",
        providerPaymentId: `admin-free-grant:${input.correlationId}`,
        paymentMethod: "FREE_PROMO",
        currency: "TRY",
        metadata: { adminAction: data.action },
      },
    });
    return {
      before,
      subscription: result.subscription,
      activationManagedAudit: true,
    };
  }

  let update: Parameters<typeof prisma.subscription.update>[0]["data"];
  if (data.action === "SUSPEND") {
    update = { status: "SUSPENDED" };
  } else if (data.action === "CANCEL") {
    update = {
      status: "CANCELED",
      cancelledAt: new Date(),
      cancelAtPeriodEnd: false,
    };
  } else {
    if (!data.endsAt && !data.extensionDays)
      throw new AdminSubscriptionActionError("INVALID_EXTENSION");
    const now = new Date();
    const existingEnd =
      before.currentPeriodEndsAt ?? before.endsAt ?? before.trialEndsAt;
    const extensionBase = existingEnd && existingEnd > now ? existingEnd : now;
    const endsAt = data.extensionDays
      ? new Date(extensionBase.getTime() + data.extensionDays * DAY_MS)
      : data.endsAt!;
    if (endsAt <= extensionBase)
      throw new AdminSubscriptionActionError("INVALID_EXTENSION");
    update = {
      status: "ACTIVE",
      endsAt,
      currentPeriodEndsAt: endsAt,
      expiredAt: null,
    };
  }

  const subscription = await prisma.$transaction(async (tx) => {
    const claimed = await tx.subscription.updateMany({
      where: {
        id: input.subscriptionId,
        updatedAt: before.updatedAt,
      },
      data: update,
    });
    if (claimed.count !== 1) {
      throw new AdminSubscriptionActionError("STATE_CHANGED");
    }
    const changed = await tx.subscription.findUniqueOrThrow({
      where: { id: input.subscriptionId },
    });
    await tx.subscriptionAuditLog.create({
      data: {
        companyId: before.companyId,
        subscriptionId: input.subscriptionId,
        actorUserId: input.actorUserId,
        eventType: `ADMIN_${data.action}`,
        previousState: {
          status: before.status,
          plan: before.plan.slug,
          endsAt: before.endsAt?.toISOString() ?? null,
        },
        newState: {
          status: changed.status,
          endsAt: changed.endsAt?.toISOString() ?? null,
          reason: data.reason,
        },
        correlationId: input.correlationId,
      },
    });
    return changed;
  });

  return { before, subscription, activationManagedAudit: false };
}
