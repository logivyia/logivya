import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key])
      process.env[key] = parts.join("=").replace(/^["']|["']$/gu, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));
process.env.TRIAL_IDENTITY_HASH_KEY = randomBytes(32).toString("base64url");
process.env.FIELD_ENCRYPTION_ACTIVE_VERSION = "v1";
process.env.FIELD_ENCRYPTION_KEY_V1 = randomBytes(32).toString("base64url");

function assertLocalTestDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const localHost =
    url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (!localHost || !url.pathname.toLowerCase().includes("test")) {
    throw new Error(
      "Refusing to run trial integration tests outside a local test database.",
    );
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  assertLocalTestDatabase();
  const { prisma } = await import("../src/server/db");
  const {
    activateTrialAfterVerifiedWhatsAppConnection,
    createPendingTrialEntitlement,
    reconcileConnectedPendingTrials,
    safelyEvaluateTrialAfterConnection,
  } = await import("../src/server/billing/trial-service");
  const { DAY_IN_MILLISECONDS, TRIAL_DURATION_DAYS } =
    await import("../src/server/billing/trial-policy");
  const { getSubscriptionCheckoutEligibility } =
    await import("../src/server/billing/checkout-eligibility");
  const suffix = randomUUID();
  const createdUserIds: string[] = [];

  try {
    async function createCandidate(
      label: string,
      phone: string,
      options?: { emailVerified?: boolean; connectedAt?: Date },
    ) {
      const connectedAt = options?.connectedAt ?? new Date();
      return prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: label,
            firstName: "Trial",
            lastName: "Owner",
            username: `${label}-${randomUUID()}`,
            email: `${label}-${randomUUID()}@example.test`,
            passwordHash: "not-a-login-credential",
            locale: "tr",
            emailVerifiedAt:
              options?.emailVerified === false ? null : new Date(),
          },
        });
        createdUserIds.push(user.id);
        const company = await tx.company.create({
          data: { name: label, ownerId: user.id, email: user.email },
        });
        await tx.companyUser.create({
          data: {
            companyId: company.id,
            userId: user.id,
            role: "OWNER",
            lifecycleState: "INDEPENDENT_OWNER",
          },
        });
        await createPendingTrialEntitlement(tx, {
          companyId: company.id,
          userId: user.id,
          registrationPhone: phone,
          ipAddress: "127.0.0.1",
        });
        const account = await tx.whatsAppAccount.create({
          data: {
            companyId: company.id,
            userId: user.id,
            provider: "BAILEYS",
            status: "CONNECTED",
            phoneNumber: phone,
            deviceId: `${phone.replace(/\D/gu, "")}:1@s.whatsapp.net`,
            pairedAt: connectedAt,
            lastConnectedAt: connectedAt,
          },
        });
        return { user, company, account };
      });
    }

    const firstConnectionAt = new Date(Date.now() - 5_000);
    const first = await createCandidate(
      `trial-first-${suffix}`,
      "+905551230001",
      {
        emailVerified: false,
        connectedAt: firstConnectionAt,
      },
    );
    assert(
      (await prisma.subscription.count({
        where: { companyId: first.company.id, source: "TRIAL" },
      })) === 0,
      "Registration must not start the trial clock.",
    );
    const activated = await activateTrialAfterVerifiedWhatsAppConnection(
      first.account.id,
    );
    assert(
      activated.outcome === "TRIAL_STARTED",
      "The first verified WhatsApp identity must activate the trial.",
    );
    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { companyId: first.company.id, source: "TRIAL" },
    });
    assert(
      subscription.status === "TRIALING",
      "Verified trial must be active.",
    );
    assert(
      subscription.trialStartsAt?.getTime() === firstConnectionAt.getTime(),
      "Trial must begin at the exact first WhatsApp connection time.",
    );
    assert(
      (subscription.trialEndsAt?.getTime() ?? 0) -
        (subscription.trialStartsAt?.getTime() ?? 0) ===
        TRIAL_DURATION_DAYS * DAY_IN_MILLISECONDS,
      "Verified trial must last exactly seven days.",
    );

    const replay = await activateTrialAfterVerifiedWhatsAppConnection(
      first.account.id,
    );
    assert(
      replay.outcome === "TRIAL_ALREADY_ACTIVE",
      "Repeated connection events must be idempotent.",
    );
    assert(
      (await prisma.subscription.count({
        where: { companyId: first.company.id, source: "TRIAL" },
      })) === 1,
      "Repeated events must not create duplicate trials.",
    );

    const concurrent = await createCandidate(
      `trial-concurrent-${suffix}`,
      "+905551230002",
    );
    const concurrentResults = await Promise.all([
      safelyEvaluateTrialAfterConnection(concurrent.account.id),
      safelyEvaluateTrialAfterConnection(concurrent.account.id),
    ]);
    assert(
      concurrentResults.every(
        (result) =>
          result.outcome === "TRIAL_STARTED" ||
          result.outcome === "TRIAL_ALREADY_ACTIVE",
      ),
      "Concurrent connection callbacks must complete without a silent trial activation failure.",
    );
    assert(
      (await prisma.subscription.count({
        where: { companyId: concurrent.company.id, source: "TRIAL" },
      })) === 1,
      "Concurrent connection callbacks must create exactly one trial.",
    );

    const repaired = await createCandidate(
      `trial-repair-${suffix}`,
      "+905551230004",
      { emailVerified: false },
    );
    const repairResults = await reconcileConnectedPendingTrials(500);
    assert(
      repairResults.some(
        (result) =>
          result.accountId === repaired.account.id &&
          result.outcome === "TRIAL_STARTED",
      ),
      "A connected owner whose pending entitlement was not linked must be repaired tenant-safely.",
    );
    assert(
      (await prisma.subscription.count({
        where: { companyId: repaired.company.id, source: "TRIAL" },
      })) === 1,
      "Pending trial repair must create exactly one seven-day trial.",
    );

    const second = await createCandidate(
      `trial-second-${suffix}`,
      "0090 555 123 00 01",
    );
    const rejected = await activateTrialAfterVerifiedWhatsAppConnection(
      second.account.id,
    );
    assert(
      rejected.outcome === "TRIAL_IDENTITY_ALREADY_USED",
      "A second account must not recycle the same verified WhatsApp identity.",
    );
    assert(
      (await prisma.subscription.count({
        where: { companyId: second.company.id, source: "TRIAL" },
      })) === 0,
      "Rejected identity must not receive a trial subscription.",
    );

    const { subscriptionAccess } =
      await import("../src/server/billing/subscription-access");
    const mixedTargets = await subscriptionAccess.canSendTargets(
      first.company.id,
      { contactCount: 1, groupCount: 1 },
    );
    assert(
      mixedTargets.allowed,
      "An unverified owner with missing optional billing fields must send to contacts and groups during trial.",
    );
    assert(
      await subscriptionAccess.canUseScheduledMessages(first.company.id),
      "Active trial must allow scheduled messages.",
    );
    assert(
      await subscriptionAccess.canUseRecurringMessages(first.company.id),
      "Active trial must allow recurring messages.",
    );

    const paid = await createCandidate(`trial-paid-${suffix}`, "+905551230003");
    const paidPlan = await prisma.plan.findFirstOrThrow({
      where: { slug: { in: ["starter", "professional"] }, isActive: true },
    });
    const paidSubscription = await prisma.subscription.create({
      data: {
        companyId: paid.company.id,
        planId: paidPlan.id,
        status: "ACTIVE",
        billingPeriod: "MONTHLY",
        startsAt: new Date(Date.now() - DAY_IN_MILLISECONDS),
        endsAt: new Date(Date.now() + 30 * DAY_IN_MILLISECONDS),
        currentPeriodStartsAt: new Date(Date.now() - DAY_IN_MILLISECONDS),
        currentPeriodEndsAt: new Date(Date.now() + 30 * DAY_IN_MILLISECONDS),
        source: "MANUAL_ADMIN",
        provider: "MANUAL",
      },
    });
    const paidResult = await activateTrialAfterVerifiedWhatsAppConnection(
      paid.account.id,
    );
    assert(
      paidResult.outcome === "PAID_IDENTITY_RECORDED",
      "A paid subscription must remain authoritative after first WhatsApp connection.",
    );
    assert(
      (await prisma.subscription.count({
        where: { companyId: paid.company.id, source: "TRIAL" },
      })) === 0,
      "A paid company must not receive an overlapping trial.",
    );
    assert(
      (
        await prisma.subscription.findUniqueOrThrow({
          where: { id: paidSubscription.id },
        })
      ).status === "ACTIVE",
      "Trial evaluation must not alter a paid subscription.",
    );

    const expired = await createCandidate(
      `trial-expired-${suffix}`,
      "+905551230004",
    );
    const trialPlan = await prisma.plan.findUniqueOrThrow({
      where: { slug: "trial" },
    });
    const expiredEndsAt = new Date(Date.now() - DAY_IN_MILLISECONDS);
    await prisma.$transaction([
      prisma.trialEntitlement.update({
        where: {
          companyId_userId: {
            companyId: expired.company.id,
            userId: expired.user.id,
          },
        },
        data: {
          status: "CONSUMED",
          whatsappAccountId: expired.account.id,
          decisionCode: "TRIAL_EXPIRED",
          consumedAt: expiredEndsAt,
          endsAt: expiredEndsAt,
        },
      }),
      prisma.subscription.create({
        data: {
          companyId: expired.company.id,
          planId: trialPlan.id,
          status: "EXPIRED",
          billingPeriod: "TRIAL",
          startsAt: new Date(
            expiredEndsAt.getTime() - TRIAL_DURATION_DAYS * DAY_IN_MILLISECONDS,
          ),
          endsAt: expiredEndsAt,
          trialStartsAt: new Date(
            expiredEndsAt.getTime() - TRIAL_DURATION_DAYS * DAY_IN_MILLISECONDS,
          ),
          trialEndsAt: expiredEndsAt,
          source: "TRIAL",
          provider: "MANUAL",
        },
      }),
    ]);
    const expiredResult = await activateTrialAfterVerifiedWhatsAppConnection(
      expired.account.id,
    );
    assert(
      expiredResult.outcome === "NO_PENDING_TRIAL",
      "An expired trial must never restart on reconnect.",
    );
    assert(
      (await prisma.subscription.count({
        where: { companyId: expired.company.id, source: "TRIAL" },
      })) === 1,
      "An expired company must retain exactly one historical trial.",
    );
    assert(
      !(
        await subscriptionAccess.canSendTargets(expired.company.id, {
          contactCount: 1,
          groupCount: 0,
        })
      ).allowed,
      "Expired trial must deny new sends.",
    );
    const expiredCheckout = await getSubscriptionCheckoutEligibility({
      companyId: expired.company.id,
      userId: expired.user.id,
    });
    assert(
      expiredCheckout.eligible,
      "Expired trial owner must remain eligible to purchase a paid package.",
    );

    const sharedTenant = await createCandidate(
      `trial-shared-owner-${suffix}`,
      "+905551230005",
    );
    const invitedUser = await prisma.user.create({
      data: {
        name: `trial-invited-${suffix}`,
        username: `trial-invited-${randomUUID()}`,
        email: `trial-invited-${randomUUID()}@example.test`,
        passwordHash: "not-a-login-credential",
        locale: "tr",
      },
    });
    createdUserIds.push(invitedUser.id);
    await prisma.companyUser.create({
      data: {
        companyId: sharedTenant.company.id,
        userId: invitedUser.id,
        role: "OPERATOR",
        lifecycleState: "ACTIVE_SHARED_MEMBER",
      },
    });
    const invitedAccount = await prisma.whatsAppAccount.create({
      data: {
        companyId: sharedTenant.company.id,
        userId: invitedUser.id,
        provider: "BAILEYS",
        status: "CONNECTED",
        phoneNumber: "+905551230006",
        deviceId: "905551230006:1@s.whatsapp.net",
        pairedAt: new Date(),
        lastConnectedAt: new Date(),
      },
    });
    const invitedResult = await activateTrialAfterVerifiedWhatsAppConnection(
      invitedAccount.id,
    );
    assert(
      invitedResult.outcome === "NO_PENDING_TRIAL",
      "An invited member must not receive an independent tenant trial.",
    );
    assert(
      (await prisma.subscription.count({
        where: { companyId: sharedTenant.company.id, source: "TRIAL" },
      })) === 0,
      "Invited-member connection must not start the owner company's trial.",
    );

    console.log(
      "Verified WhatsApp trial integration passed: connection-time start, unverified email, optional-profile independence, concurrent idempotency, paid-plan preservation, expired-trial denial with paid checkout eligibility, invited-member isolation, full messaging entitlements, and identity replay prevention.",
    );
  } finally {
    const companies = await prisma.company.findMany({
      where: { ownerId: { in: createdUserIds } },
      select: { id: true },
    });
    const companyIds = companies.map((company) => company.id);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SET LOCAL session_replication_role = replica",
      );
      await tx.auditLog.deleteMany({
        where: { companyId: { in: companyIds } },
      });
    });
    await prisma.$transaction([
      prisma.trialEntitlement.deleteMany({
        where: { companyId: { in: companyIds } },
      }),
      prisma.whatsAppAccount.deleteMany({
        where: { companyId: { in: companyIds } },
      }),
      prisma.notification.deleteMany({
        where: { companyId: { in: companyIds } },
      }),
      prisma.subscriptionAuditLog.deleteMany({
        where: { companyId: { in: companyIds } },
      }),
      prisma.subscriptionEvent.deleteMany({
        where: { companyId: { in: companyIds } },
      }),
      prisma.subscription.deleteMany({
        where: { companyId: { in: companyIds } },
      }),
      prisma.company.deleteMany({ where: { id: { in: companyIds } } }),
    ]);
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
