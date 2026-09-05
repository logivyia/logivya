import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolveAdminSeatIntegrity } from "../src/server/billing/admin-seat-integrity";
import { performAdminSubscriptionAction } from "../src/server/billing/admin-subscription-actions";
import { isCompanySubscriptionActive } from "../src/server/billing/company-entitlements";
import { corePlanRule } from "../src/server/billing/plan-matrix";
import { activateCompanySubscription } from "../src/server/billing/subscription-activation";
import { createPendingTrialEntitlement } from "../src/server/billing/trial-service";
import { prisma } from "../src/server/db";

function assertLocalIntegrationDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  assert(local && url.pathname.toLowerCase().includes("admin_subscription_test"), "Refusing to run outside the local admin subscription integration database.");
}

assertLocalIntegrationDatabase();

type ExpectedState = {
  activePlan: string | null;
  latestStatus?: string;
  seats: string;
  integrity: string;
};

type ProofState = Awaited<ReturnType<typeof readCompanyProof>>;

const suffix = randomUUID();
const proof: Array<{ step: string; state: ProofState }> = [];

async function main() {
  try {
  const starter = await upsertPlan("starter", "Başlangıç");
  const professional = await upsertPlan("professional", "Profesyonel");
  const admin = await prisma.user.create({
    data: {
      name: "Subscription lifecycle admin",
      username: `admin-${suffix}`,
      email: `admin-${suffix}@example.test`,
      passwordHash: "integration-only",
      emailVerifiedAt: new Date(),
    },
  });

  const target = await createRegistrationFixture(`New registration ${suffix}`);
  const unrelated = await createRegistrationFixture(`Unrelated tenant ${suffix}`);
  await prisma.subscription.create({
    data: {
      companyId: unrelated.companyId,
      planId: starter.id,
      status: "ACTIVE",
      billingPeriod: "MONTHLY",
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
      endsAt: new Date("2026-09-01T00:00:00.000Z"),
      currentPeriodStartsAt: new Date("2026-08-01T00:00:00.000Z"),
      currentPeriodEndsAt: new Date("2026-09-01T00:00:00.000Z"),
      source: "MANUAL_ADMIN",
      manuallyActivatedByUserId: admin.id,
    },
  });
  const unrelatedBefore = await stableCompanySnapshot(unrelated.companyId);

  await assertAndRecord("registered-no-package", target.companyId, {
    activePlan: null,
    seats: "1/1",
    integrity: "OK",
  });

  const now = new Date();
  const activatedStarter = await activateCompanySubscription({
    companyId: target.companyId,
    planSlug: starter.slug,
    billingPeriod: "MONTHLY",
    startsAt: now,
    endsAt: new Date(now.getTime() + 30 * 86_400_000),
    source: "MANUAL_ADMIN",
    actorUserId: admin.id,
    reason: "Integration lifecycle starter activation",
    correlationId: `integration:${suffix}:starter`,
  });
  await assertAndRecord("starter-active", target.companyId, {
    activePlan: "starter",
    latestStatus: "ACTIVE",
    seats: "1/2",
    integrity: "OK",
  });

  const changed = await performAdminSubscriptionAction({
    subscriptionId: activatedStarter.subscription.id,
    actorUserId: admin.id,
    correlationId: `integration:${suffix}:professional`,
    data: { action: "CHANGE_PLAN", planSlug: professional.slug, reason: "Integration lifecycle professional change" },
  });
  await assertAndRecord("professional-active", target.companyId, {
    activePlan: "professional",
    latestStatus: "ACTIVE",
    seats: "1/3",
    integrity: "OK",
  });

  const beforeExtension = changed.subscription.currentPeriodEndsAt ?? changed.subscription.endsAt;
  assert(beforeExtension, "Professional subscription must have an end date.");
  const extended = await performAdminSubscriptionAction({
    subscriptionId: changed.subscription.id,
    actorUserId: admin.id,
    correlationId: `integration:${suffix}:extend`,
    data: { action: "EXTEND", extensionDays: 15, reason: "Integration lifecycle extension" },
  });
  const extendedEnd = extended.subscription.currentPeriodEndsAt ?? extended.subscription.endsAt;
  assert.equal(extendedEnd?.getTime(), beforeExtension.getTime() + 15 * 86_400_000, "Extension must continue from the existing future expiry.");
  await assertAndRecord("extended", target.companyId, {
    activePlan: "professional",
    latestStatus: "ACTIVE",
    seats: "1/3",
    integrity: "OK",
  });

  const suspended = await performAdminSubscriptionAction({
    subscriptionId: extended.subscription.id,
    actorUserId: admin.id,
    correlationId: `integration:${suffix}:suspend`,
    data: { action: "SUSPEND", reason: "Integration lifecycle suspension" },
  });
  await assertAndRecord("suspended", target.companyId, {
    activePlan: null,
    latestStatus: "SUSPENDED",
    seats: "1/1",
    integrity: "OK",
  });

  const reactivated = await performAdminSubscriptionAction({
    subscriptionId: suspended.subscription.id,
    actorUserId: admin.id,
    correlationId: `integration:${suffix}:reactivate`,
    data: { action: "ACTIVATE", reason: "Integration lifecycle reactivation" },
  });
  await assertAndRecord("reactivated", target.companyId, {
    activePlan: "professional",
    latestStatus: "ACTIVE",
    seats: "1/3",
    integrity: "OK",
  });

  const canceled = await performAdminSubscriptionAction({
    subscriptionId: reactivated.subscription.id,
    actorUserId: admin.id,
    correlationId: `integration:${suffix}:cancel`,
    data: { action: "CANCEL", reason: "Integration lifecycle cancellation" },
  });
  await assertAndRecord("canceled", target.companyId, {
    activePlan: null,
    latestStatus: "CANCELED",
    seats: "1/1",
    integrity: "OK",
  });

  await performAdminSubscriptionAction({
    subscriptionId: canceled.subscription.id,
    actorUserId: admin.id,
    correlationId: `integration:${suffix}:activate-again`,
    data: { action: "ACTIVATE", reason: "Integration lifecycle final activation" },
  });
  await assertAndRecord("activated-again", target.companyId, {
    activePlan: "professional",
    latestStatus: "ACTIVE",
    seats: "1/3",
    integrity: "OK",
  });

  const unrelatedAfter = await stableCompanySnapshot(unrelated.companyId);
  assert.deepEqual(unrelatedAfter, unrelatedBefore, "Subscription actions must not mutate an unrelated tenant.");

  const auditEvents = await prisma.subscriptionAuditLog.findMany({
    where: { companyId: target.companyId },
    orderBy: { createdAt: "asc" },
    select: { eventType: true, correlationId: true },
  });
  assert(auditEvents.some((event) => event.eventType === "ADMIN_EXTEND"), "Extension audit is missing.");
  assert(auditEvents.some((event) => event.eventType === "ADMIN_SUSPEND"), "Suspension audit is missing.");
  assert(auditEvents.some((event) => event.eventType === "ADMIN_CANCEL"), "Cancellation audit is missing.");

  const repairCandidate = await prisma.$transaction(async (tx) => {
    const owner = await tx.user.create({
      data: {
        name: "Repair candidate",
        username: `repair-${suffix}`,
        email: `repair-${suffix}@example.test`,
        passwordHash: "integration-only",
      },
    });
    const company = await tx.company.create({
      data: { name: `Repair candidate ${suffix}`, ownerId: owner.id, email: owner.email },
    });
    return company;
  });

    console.log(JSON.stringify({
      result: "PASS",
      registration: { companyId: target.companyId, ownerId: target.ownerId },
      states: proof,
      auditEvents,
      unrelatedTenantUnchanged: true,
      repairCandidateCompanyId: repairCandidate.id,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function upsertPlan(slug: "starter" | "professional", name: string) {
  const rule = corePlanRule(slug);
  assert(rule, `Canonical plan rule missing for ${slug}.`);
  return prisma.plan.upsert({
    where: { slug },
    create: {
      slug,
      name,
      monthlyPrice: rule.monthlyPriceTry,
      yearlyPrice: rule.yearlyPriceTry,
      currency: "TRY",
      maxWhatsappAccounts: rule.whatsappConnections,
      maxTeamUsers: rule.totalUserSeats,
      maxGroups: 2_147_483_647,
      maxMessagesPerDay: 2_147_483_647,
      maxMessagesPerMonth: 2_147_483_647,
      groupMessagingEnabled: rule.groupMessaging,
      contactMessagingEnabled: rule.contactMessaging,
      deleteForEveryoneEnabled: rule.deleteForEveryone,
      advertisingEnabled: rule.advertisingEnabled,
      hasScheduledMessages: rule.scheduledMessaging,
      hasRecurringMessages: rule.recurringMessaging,
      advancedReportingEnabled: rule.advancedSupport,
      hasNoBranding: !rule.messageBrandingRequired,
    },
    update: {
      name,
      maxTeamUsers: rule.totalUserSeats,
      isActive: true,
    },
  });
}

async function createRegistrationFixture(label: string) {
  return prisma.$transaction(async (tx) => {
    const owner = await tx.user.create({
      data: {
        name: label,
        username: `owner-${randomUUID()}`,
        email: `owner-${randomUUID()}@example.test`,
        phone: "905550000000",
        passwordHash: "integration-only",
        locale: "tr",
      },
    });
    const company = await tx.company.create({
      data: { name: `${label} company`, ownerId: owner.id, email: owner.email, phone: owner.phone },
    });
    await tx.companyUser.create({
      data: {
        companyId: company.id,
        userId: owner.id,
        role: "OWNER",
        status: "ACTIVE",
        lifecycleState: "INDEPENDENT_OWNER",
      },
    });
    await createPendingTrialEntitlement(tx, { companyId: company.id, userId: owner.id });
    await tx.companyBillingProfile.create({
      data: {
        companyId: company.id,
        billingType: "COMPANY",
        companyName: company.name,
        country: "TR",
        city: "-",
        addressLine1: "-",
        billingEmail: owner.email,
      },
    });
    await tx.onboardingChecklist.create({ data: { companyId: company.id } });
    await tx.auditLog.create({
      data: {
        companyId: company.id,
        userId: owner.id,
        action: "workspace.registered",
        entityType: "Company",
        entityId: company.id,
      },
    });
    return { ownerId: owner.id, companyId: company.id };
  });
}

async function readCompanyProof(companyId: string) {
  const now = new Date();
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    include: {
      owner: { select: { id: true, name: true, email: true, phone: true } },
      members: true,
      invitations: { where: { status: "PENDING", reservedSeat: true, expiresAt: { gt: now } } },
      trialEntitlements: { orderBy: { createdAt: "asc" }, take: 1 },
      subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" } },
      subscriptionAuditLogs: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  const activeSubscription = company.subscriptions.find((subscription) => isCompanySubscriptionActive(subscription, now));
  const latestSubscription = activeSubscription ?? company.subscriptions[0] ?? null;
  const ownerMembership = company.members.find((membership) => (
    membership.userId === company.ownerId
    && membership.role === "OWNER"
    && membership.status === "ACTIVE"
    && membership.lifecycleState === "INDEPENDENT_OWNER"
  ));
  const integrity = resolveAdminSeatIntegrity({
    companyName: company.name,
    ownerEmail: company.owner.email,
    hasOwnerMembership: Boolean(ownerMembership),
    hasActiveSubscription: Boolean(activeSubscription),
    hasAnySubscription: company.subscriptions.length > 0,
    activePlanSlug: activeSubscription?.plan.slug,
    activePlanMaxTeamUsers: activeSubscription?.plan.maxTeamUsers,
    trialEntitlementStatus: company.trialEntitlements[0]?.status,
    activeMembers: company.members.filter((membership) => membership.status === "ACTIVE").length,
    suspendedMembers: company.members.filter((membership) => membership.status === "SUSPENDED").length,
    invitedMembers: company.members.filter((membership) => membership.status === "INVITED").length,
    pendingInvitations: company.invitations.length,
  });
  assert(ownerMembership, "Company details must contain a valid owner membership.");
  assert(company.trialEntitlements[0], "Company details must contain the registration entitlement.");
  return {
    companyId: company.id,
    ownerEmail: company.owner.email,
    activePlan: activeSubscription?.plan.slug ?? null,
    latestStatus: latestSubscription?.status ?? null,
    seats: `${integrity.used}/${integrity.limit}`,
    integrity: integrity.integrityStatus,
    detailsOpenable: true,
    auditCount: company.subscriptionAuditLogs.length,
  };
}

async function assertAndRecord(step: string, companyId: string, expected: ExpectedState) {
  const state = await readCompanyProof(companyId);
  assert.equal(state.activePlan, expected.activePlan, `${step}: active plan mismatch.`);
  if (expected.latestStatus) assert.equal(state.latestStatus, expected.latestStatus, `${step}: latest status mismatch.`);
  assert.equal(state.seats, expected.seats, `${step}: seat state mismatch.`);
  assert.equal(state.integrity, expected.integrity, `${step}: integrity state mismatch.`);
  assert.equal(state.detailsOpenable, true, `${step}: details must remain openable.`);
  proof.push({ step, state });
}

async function stableCompanySnapshot(companyId: string) {
  return prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      securityStatus: true,
      billingLockedAt: true,
      campaignsPausedAt: true,
      subscriptions: {
        orderBy: { createdAt: "asc" },
        select: { id: true, planId: true, status: true, startsAt: true, endsAt: true, currentPeriodStartsAt: true, currentPeriodEndsAt: true },
      },
      members: { orderBy: { createdAt: "asc" }, select: { id: true, userId: true, role: true, status: true, lifecycleState: true } },
      trialEntitlements: { orderBy: { createdAt: "asc" }, select: { id: true, userId: true, status: true, decisionCode: true } },
    },
  });
}
