import { type Prisma, type Subscription } from "@prisma/client";
import { isCompanySubscriptionActive } from "@/server/billing/company-entitlements";
import { prisma } from "@/server/db";

type Period = Pick<Subscription, "status" | "endsAt" | "currentPeriodEndsAt" | "trialEndsAt">;
export function isSubscriptionDueForExpiration(subscription: Period, now: Date) {
  if (subscription.status !== "ACTIVE" && subscription.status !== "TRIALING") return false;
  const ends = [subscription.endsAt, subscription.currentPeriodEndsAt, subscription.trialEndsAt]
    .filter((date): date is Date => date !== null);
  return ends.length > 0 && ends.every(date => date <= now);
}

export function dueSubscriptionWhere(now: Date): Prisma.SubscriptionWhereInput {
  return {
    status: { in: ["ACTIVE", "TRIALING"] },
    AND: [
      { OR: [{ endsAt: { not: null } }, { currentPeriodEndsAt: { not: null } }, { trialEndsAt: { not: null } }] },
      ...(["endsAt", "currentPeriodEndsAt", "trialEndsAt"] as const).map(field => ({
        OR: [{ [field]: null }, { [field]: { lte: now } }],
      })),
    ],
  };
}

/** Share activation's company lock so a renewal cannot race expiration. */
export async function expireCompanySubscriptions(tx: Prisma.TransactionClient, companyId: string, now: Date) {
  const companies = await tx.$queryRaw<Array<{ id: string; ownerId: string }>>`
    SELECT "id", "ownerId" FROM "Company" WHERE "id" = ${companyId} FOR UPDATE
  `;
  if (!companies.length) return { expired: 0, membersExpired: 0 };
  const due = await tx.subscription.findMany({ where: { companyId, ...dueSubscriptionWhere(now) } });
  let expired = 0;
  for (const item of due) {
    const changed = await tx.subscription.updateMany({
      where: { id: item.id, companyId, ...dueSubscriptionWhere(now) },
      data: { status: "EXPIRED", expiredAt: now },
    });
    if (!changed.count) continue;
    expired++;
    const eventType = item.status === "TRIALING" ? "TRIAL_EXPIRED" : "SUBSCRIPTION_EXPIRED";
    await tx.subscriptionEvent.create({ data: {
      companyId, subscriptionId: item.id, type: eventType,
      message: item.status === "TRIALING" ? "Deneme süresi sona erdi." : "Abonelik süresi sona erdi.",
    } });
    await tx.subscriptionAuditLog.create({ data: {
      companyId, subscriptionId: item.id, eventType,
      previousState: { status: item.status }, newState: { status: "EXPIRED", expiredAt: now.toISOString() },
    } });
    if (item.status === "TRIALING") await tx.trialEntitlement.updateMany({
      where: { companyId, status: "ACTIVE", endsAt: { lte: now } },
      data: { status: "CONSUMED", decisionCode: "TRIAL_PERIOD_ENDED" },
    });
  }
  if (!expired) return { expired: 0, membersExpired: 0 };
  const remaining = await tx.subscription.findMany({
    where: { companyId, status: { in: ["ACTIVE", "TRIALING"] } }, include: { plan: true },
  });
  if (remaining.some(subscription => isCompanySubscriptionActive(subscription, now))) {
    return { expired, membersExpired: 0 };
  }
  const members = await tx.companyUser.findMany({
    where: { companyId, role: { not: "OWNER" }, status: "ACTIVE", lifecycleState: "ACTIVE_SHARED_MEMBER" },
    select: { id: true, userId: true },
  });
  if (members.length) {
    await tx.companyUser.updateMany({
      where: { companyId, id: { in: members.map(member => member.id) }, lifecycleState: "ACTIVE_SHARED_MEMBER" },
      data: { lifecycleState: "SHARED_SUBSCRIPTION_EXPIRED", sharedAccessExpiredAt: now },
    });
    await tx.auditLog.createMany({ data: members.map(member => ({
      companyId, userId: member.userId, actorType: "SYSTEM", action: "SHARED_SUBSCRIPTION_EXPIRED",
      entityType: "CompanyUser", entityId: member.id,
      beforeState: { lifecycleState: "ACTIVE_SHARED_MEMBER" },
      afterState: { lifecycleState: "SHARED_SUBSCRIPTION_EXPIRED", expiredAt: now.toISOString() },
    })) });
    await tx.notification.createMany({ data: members.map(member => ({
      companyId, userId: member.userId, type: "SHARED_SUBSCRIPTION_EXPIRED", category: "BILLING" as const,
      title: "Paylaşılan abonelik sona erdi", message: "Abonelik bölümünden kişisel planınızı seçebilirsiniz.",
      deepLink: "/settings/subscriptions",
    })) });
  }
  await tx.notification.create({ data: {
    companyId, userId: companies[0].ownerId, type: "SUBSCRIPTION_EXPIRED", category: "BILLING",
    title: "Aboneliğiniz sona erdi", message: "Mesaj göndermek için paketinizi yenileyin.",
  } });
  return { expired, membersExpired: members.length };
}

export async function expireDueSubscriptions(now = new Date()) {
  const companies = await prisma.subscription.findMany({
    where: dueSubscriptionWhere(now), select: { companyId: true }, distinct: ["companyId"],
    orderBy: { companyId: "asc" }, take: 100,
  });
  const totals = { companiesChecked: 0, expired: 0, membersExpired: 0, batchLimit: 100 };
  for (const { companyId } of companies) {
    const result = await prisma.$transaction(tx => expireCompanySubscriptions(tx, companyId, now), { timeout: 20_000 });
    totals.companiesChecked++;
    totals.expired += result.expired;
    totals.membersExpired += result.membersExpired;
  }
  return totals;
}
