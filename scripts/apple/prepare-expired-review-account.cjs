const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const fs = require("node:fs");
const argon2 = require("argon2");

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const password = String(
    process.env.POSTGRES_PASSWORD ||
      (fs.existsSync("/run/secrets/postgres_password")
        ? fs.readFileSync("/run/secrets/postgres_password", "utf8").trim()
        : ""),
  );
  if (!password) throw new Error("DATABASE_PASSWORD_REQUIRED");

  const host = process.env.POSTGRES_HOST || "localhost";
  const port = process.env.POSTGRES_PORT || "5432";
  const user = process.env.POSTGRES_USER || "logivya";
  const database = process.env.POSTGRES_DB || "logivya";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

const databaseUrl = resolveDatabaseUrl();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }, { schema: "public" }),
});

async function reviewPasswordHash() {
  const password = process.env.APPLE_REVIEW_PASSWORD;
  if (!password) return null;
  const pepper = String(
    process.env.PASSWORD_PEPPER ||
      (fs.existsSync("/run/secrets/password_pepper")
        ? fs.readFileSync("/run/secrets/password_pepper", "utf8").trim()
        : ""),
  );
  return argon2.hash(`${password}${pepper}`, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 3,
    parallelism: 1,
  });
}

const sourceEmail = String(process.env.SOURCE_REVIEW_EMAIL || "appstore-review@logivya.com")
  .trim()
  .toLowerCase();
const targetEmail = String(process.env.TARGET_REVIEW_EMAIL || "appstore-expired-review@logivya.com")
  .trim()
  .toLowerCase();

async function main() {
  const source = await prisma.user.findUnique({
    where: { email: sourceEmail },
    select: { passwordHash: true },
  });
  if (!source) throw new Error("SOURCE_REVIEW_ACCOUNT_NOT_FOUND");

  const existing = await prisma.user.findUnique({
    where: { email: targetEmail },
    select: {
      id: true,
      ownedCompanies: {
        select: {
          id: true,
          subscriptions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, status: true, provider: true, currentPeriodEndsAt: true },
          },
        },
      },
    },
  });
  if (existing) {
    const company = existing.ownedCompanies[0];
    const subscription = company?.subscriptions[0];
    if (!company || !subscription || subscription.status !== "EXPIRED" || subscription.provider !== "MANUAL") {
      throw new Error("TARGET_REVIEW_ACCOUNT_EXISTS_IN_UNEXPECTED_STATE");
    }
    const passwordHash = await reviewPasswordHash();
    if (passwordHash) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, mustChangePassword: false },
      });
    }
    console.log(JSON.stringify({
      ok: true,
      created: false,
      passwordUpdated: Boolean(passwordHash),
      email: targetEmail,
      userId: existing.id,
      companyId: company.id,
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionProvider: subscription.provider,
      currentPeriodEndsAt: subscription.currentPeriodEndsAt,
    }));
    return;
  }

  const plan = await prisma.plan.findUnique({ where: { slug: "professional" } });
  if (!plan) throw new Error("PROFESSIONAL_PLAN_NOT_FOUND");

  const now = new Date();
  const startsAt = new Date(now.getTime() - 32 * 24 * 60 * 60 * 1000);
  const endsAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    const passwordHash = (await reviewPasswordHash()) || source.passwordHash;
    const user = await tx.user.create({
      data: {
        name: "Logivya Expired Review",
        username: `appstore-expired-review-${Date.now()}`,
        email: targetEmail,
        emailVerifiedAt: now,
        passwordHash,
        locale: "en",
        timezone: "Europe/Istanbul",
        country: "TR",
        status: "ACTIVE",
        mustChangePassword: false,
        mfaRequired: false,
      },
    });

    const company = await tx.company.create({
      data: {
        name: "Logivya Expired App Review",
        ownerId: user.id,
        email: targetEmail,
      },
    });

    await tx.companyUser.create({
      data: {
        companyId: company.id,
        userId: user.id,
        role: "OWNER",
        status: "ACTIVE",
        lifecycleState: "INDEPENDENT_OWNER",
        activationCompletedAt: now,
      },
    });

    await tx.onboardingChecklist.create({ data: { companyId: company.id } });

    await tx.consentRecord.createMany({
      data: ["TERMS_OF_SERVICE", "PRIVACY_POLICY", "KVKK"].map((type) => ({
        userId: user.id,
        companyId: company.id,
        type,
        version: "2026-06-12",
        granted: true,
        collectionMethod: "ADMIN_REVIEW_ACCOUNT",
        platform: "IOS",
        appVersion: "1.0.168",
        locale: "en",
      })),
    });

    await tx.trialEntitlement.create({
      data: {
        companyId: company.id,
        userId: user.id,
        status: "CONSUMED",
        decisionCode: "APPLE_REVIEW_EXPIRED_ACCOUNT",
        startedAt: startsAt,
        endsAt,
        consumedAt: endsAt,
      },
    });

    const subscription = await tx.subscription.create({
      data: {
        companyId: company.id,
        planId: plan.id,
        status: "EXPIRED",
        billingPeriod: "YEARLY",
        startsAt,
        endsAt,
        currentPeriodStartsAt: startsAt,
        currentPeriodEndsAt: endsAt,
        expiredAt: endsAt,
        source: "MANUAL_ADMIN",
        provider: "MANUAL",
      },
    });

    await tx.subscriptionEvent.create({
      data: {
        companyId: company.id,
        subscriptionId: subscription.id,
        actorUserId: user.id,
        type: "SUBSCRIPTION_EXPIRED",
        message: "Dedicated App Review subscription expired.",
        metadata: { purpose: "APPLE_APP_REVIEW", build: 168 },
      },
    });

    await tx.subscriptionAuditLog.create({
      data: {
        companyId: company.id,
        subscriptionId: subscription.id,
        actorUserId: user.id,
        eventType: "APPLE_REVIEW_ACCOUNT_PREPARED",
        newState: {
          status: "EXPIRED",
          provider: "MANUAL",
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        },
        correlationId: `apple-review-expired-${Date.now()}`,
      },
    });

    return { user, company, subscription };
  });

  console.log(JSON.stringify({
    ok: true,
    created: true,
    email: targetEmail,
    userId: result.user.id,
    companyId: result.company.id,
    subscriptionId: result.subscription.id,
    subscriptionStatus: result.subscription.status,
    subscriptionProvider: result.subscription.provider,
    currentPeriodEndsAt: result.subscription.currentPeriodEndsAt,
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
