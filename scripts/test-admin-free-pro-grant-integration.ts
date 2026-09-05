import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { activateSubscriptionManually } from "../src/server/billing/manual-activation";
import { resolveCompanyEntitlements } from "../src/server/billing/company-entitlements";
import { corePlanRule } from "../src/server/billing/plan-matrix";
import { prisma } from "../src/server/db";

function assertIsolatedIntegrationDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  assert(
    local && url.pathname.toLowerCase().includes("admin_subscription_test"),
    "Refusing to run outside the isolated admin subscription test database.",
  );
}

async function upsertPlan(slug: "starter" | "professional", name: string) {
  const rule = corePlanRule(slug);
  assert(rule, "Canonical plan rule missing for " + slug + ".");
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
    update: { name, isActive: true, maxTeamUsers: rule.totalUserSeats },
  });
}

async function main() {
  assertIsolatedIntegrationDatabase();
  const suffix = randomUUID();
  const startsAt = new Date("2026-01-31T12:00:00.000Z");
  const endsAt = new Date("2026-02-28T12:00:00.000Z");
  const entitlementCheckAt = new Date("2026-02-01T12:00:00.000Z");
  const plusCorrelationId = "free-plus-grant:" + suffix;
  const proCorrelationId = "free-pro-grant:" + suffix;

  try {
    const [starter, professional] = await Promise.all([
      upsertPlan("starter", "Başlangıç"),
      upsertPlan("professional", "Logivya Pro"),
    ]);
    const admin = await prisma.user.create({
      data: {
        name: "Free grant integration admin",
        username: "grant-admin-" + suffix,
        email: "grant-admin-" + suffix + "@example.test",
        passwordHash: "integration-only",
      },
    });
    const owner = await prisma.user.create({
      data: {
        name: "Free grant target",
        username: "grant-owner-" + suffix,
        email: "grant-owner-" + suffix + "@example.test",
        passwordHash: "integration-only",
      },
    });
    const company = await prisma.company.create({
      data: {
        name: "Free grant target " + suffix,
        ownerId: owner.id,
        email: owner.email,
      },
    });
    await prisma.companyUser.create({
      data: {
        companyId: company.id,
        userId: owner.id,
        role: "OWNER",
        status: "ACTIVE",
        lifecycleState: "INDEPENDENT_OWNER",
      },
    });
    const existingTrial = await prisma.subscription.create({
      data: {
        companyId: company.id,
        planId: starter.id,
        status: "TRIALING",
        billingPeriod: "MONTHLY",
        startsAt: new Date("2026-01-24T12:00:00.000Z"),
        endsAt: startsAt,
        currentPeriodStartsAt: new Date("2026-01-24T12:00:00.000Z"),
        currentPeriodEndsAt: startsAt,
        source: "TRIAL",
        provider: "MANUAL",
      },
    });

    const plusFirst = await activateSubscriptionManually({
      companyId: company.id,
      planSlug: starter.slug,
      billingPeriod: "MONTHLY",
      startsAt,
      endsAt,
      currency: "TRY",
      paymentMethod: "FREE_PROMO",
      adminUserId: admin.id,
      note: "One-month complimentary Logivya Plus integration test",
      idempotencyKey: plusCorrelationId,
    });
    const plusRetry = await activateSubscriptionManually({
      companyId: company.id,
      planSlug: starter.slug,
      billingPeriod: "MONTHLY",
      startsAt,
      endsAt,
      currency: "TRY",
      paymentMethod: "FREE_PROMO",
      adminUserId: admin.id,
      note: "One-month complimentary Logivya Plus integration test",
      idempotencyKey: plusCorrelationId,
    });
    const plusEntitlements = await resolveCompanyEntitlements(
      company.id,
      undefined,
      entitlementCheckAt,
    );

    const proFirst = await activateSubscriptionManually({
      companyId: company.id,
      planSlug: professional.slug,
      billingPeriod: "MONTHLY",
      startsAt,
      endsAt,
      currency: "TRY",
      paymentMethod: "FREE_PROMO",
      adminUserId: admin.id,
      note: "One-month complimentary Logivya Pro integration test",
      idempotencyKey: proCorrelationId,
    });
    const proRetry = await activateSubscriptionManually({
      companyId: company.id,
      planSlug: professional.slug,
      billingPeriod: "MONTHLY",
      startsAt,
      endsAt,
      currency: "TRY",
      paymentMethod: "FREE_PROMO",
      adminUserId: admin.id,
      note: "One-month complimentary Logivya Pro integration test",
      idempotencyKey: proCorrelationId,
    });
    const proEntitlements = await resolveCompanyEntitlements(
      company.id,
      undefined,
      entitlementCheckAt,
    );

    const [storedTrial, storedPlus, active, payments, invoices, audits, notification] = await Promise.all([
      prisma.subscription.findUniqueOrThrow({ where: { id: existingTrial.id } }),
      prisma.subscription.findUniqueOrThrow({ where: { id: plusFirst.subscription.id } }),
      prisma.subscription.findUniqueOrThrow({
        where: { id: proFirst.subscription.id },
        include: { plan: true },
      }),
      prisma.payment.findMany({ where: { companyId: company.id } }),
      prisma.invoice.findMany({ where: { companyId: company.id } }),
      prisma.subscriptionAuditLog.findMany({
        where: {
          companyId: company.id,
          eventType: "PLAN_ASSIGNED_BY_ADMIN",
          correlationId: { in: [plusCorrelationId, proCorrelationId] },
        },
      }),
      prisma.notification.findFirst({
        where: {
          companyId: company.id,
          userId: owner.id,
          type: "SUBSCRIPTION_ACTIVATED",
        },
      }),
    ]);

    assert.equal(plusFirst.idempotent, false);
    assert.equal(plusRetry.idempotent, true);
    assert.equal(plusRetry.subscription.id, plusFirst.subscription.id);
    assert.equal(plusEntitlements?.plan.slug, "starter");
    assert.equal(plusEntitlements?.entitlements.teamSeats, 2);
    assert.equal(proFirst.idempotent, false);
    assert.equal(proRetry.idempotent, true);
    assert.equal(proRetry.subscription.id, proFirst.subscription.id);
    assert.equal(proEntitlements?.plan.slug, "professional");
    assert.equal(proEntitlements?.entitlements.teamSeats, 3);
    assert.equal(active.status, "ACTIVE");
    assert.equal(active.plan.slug, "professional");
    assert.equal(active.startsAt.getTime(), startsAt.getTime());
    assert.equal(active.endsAt?.getTime(), endsAt.getTime());
    assert.equal(storedTrial.status, "CANCELED");
    assert.equal(storedPlus.status, "CANCELED");
    assert.equal(payments.length, 2);
    assert(payments.every((payment) => payment.status === "MANUALLY_CONFIRMED"));
    assert(payments.every((payment) => payment.paymentMethod === "FREE_PROMO"));
    assert(payments.every((payment) => payment.amount.toString() === "0"));
    assert.equal(invoices.length, 0);
    assert.equal(audits.length, 2, "Plus and Pro free grant audit records are required.");
    assert(notification?.message.includes("yönetici hediyesi"), "Free grant notification is missing.");

    console.log(JSON.stringify({
      result: "PASS",
      companyId: company.id,
      subscriptionId: active.id,
      plan: active.plan.slug,
      adminGrantSeatParity: {
        plus: plusEntitlements?.entitlements.teamSeats,
        pro: proEntitlements?.entitlements.teamSeats,
      },
      status: active.status,
      startsAt: active.startsAt.toISOString(),
      endsAt: active.endsAt?.toISOString(),
      priorTrialStatus: storedTrial.status,
      priorPlusStatus: storedPlus.status,
      paymentCount: payments.length,
      paymentStatuses: payments.map((payment) => payment.status),
      paymentMethods: payments.map((payment) => payment.paymentMethod),
      paymentAmounts: payments.map((payment) => payment.amount.toString()),
      invoiceCount: invoices.length,
      idempotentRetries: {
        plus: plusRetry.idempotent,
        pro: proRetry.idempotent,
      },
      auditCount: audits.length,
      notificationRecorded: Boolean(notification),
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
