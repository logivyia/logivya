import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { LOGIVYA_PLATFORM_OWNER_EMAIL } from "../src/server/auth/platform-owner";
import {
  LOGIVYA_BANK_TRANSFER,
  LOGIVYA_SELLER_DISPLAY_NAME,
} from "../src/server/billing/manual-subscription-config";
import {
  createManualSubscriptionDraft,
  listManualSubscriptionRequestsForCompany,
  submitManualSubscriptionRequest,
} from "../src/server/billing/manual-subscription-requests";
import { prisma } from "../src/server/db";
import { hashPassword } from "../src/server/security/passwords";

function assertLocalTestDatabase() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  const localDatabase = ["127.0.0.1", "localhost"].includes(database.hostname)
    && database.pathname.toLowerCase().includes("test");
  assert(localDatabase, "Refusing to run subscription integration outside a local test database.");
}

function unique(prefix: string) {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

async function createUser(input: {
  firstName: string;
  lastName: string;
  email?: string;
}) {
  const username = unique(input.firstName.toLowerCase());
  return prisma.user.create({
    data: {
      name: `${input.firstName} ${input.lastName}`,
      firstName: input.firstName,
      lastName: input.lastName,
      username,
      email: input.email ?? `${username}@example.test`,
      passwordHash: await hashPassword(
        "Subscription-Integration-42",
        process.env.PASSWORD_PEPPER ?? "",
      ),
      locale: "tr",
      status: "ACTIVE",
    },
  });
}

async function createOwnerWorkspace(label: string) {
  const owner = await createUser({ firstName: label, lastName: "Owner" });
  const company = await prisma.company.create({
    data: {
      name: unique(`${label}-company`),
      ownerId: owner.id,
      email: owner.email,
    },
  });
  await prisma.companyUser.create({
    data: {
      companyId: company.id,
      userId: owner.id,
      createdByUserId: owner.id,
      role: "OWNER",
      status: "ACTIVE",
      lifecycleState: "INDEPENDENT_OWNER",
      activationCompletedAt: new Date(),
    },
  });
  return { owner, company };
}

function context(workspace: Awaited<ReturnType<typeof createOwnerWorkspace>>) {
  return {
    company: {
      id: workspace.company.id,
      name: workspace.company.name,
      email: workspace.company.email,
      phone: workspace.company.phone,
      address: workspace.company.address,
      taxOffice: workspace.company.taxOffice,
      taxNumber: workspace.company.taxNumber,
    },
    user: {
      id: workspace.owner.id,
      name: workspace.owner.name,
      email: workspace.owner.email,
      phone: workspace.owner.phone,
      locale: workspace.owner.locale,
      country: workspace.owner.country,
    },
  };
}

function request(label: string) {
  return new Request(`http://127.0.0.1:3107/api/billing/subscription-requests/${label}/submit`, {
    method: "POST",
    headers: {
      "accept-language": "tr-TR,tr;q=0.9",
      "user-agent": "logivya-subscription-integration",
      "x-forwarded-for": "127.0.0.1",
      "x-request-id": unique("subscription-request"),
    },
  });
}

function acceptedDocuments(draft: Awaited<ReturnType<typeof createManualSubscriptionDraft>>) {
  return draft.legalDocuments.map((document) => ({
    type: document.type,
    version: document.version,
    hash: document.hash,
  }));
}

async function configureSellerAndAdmin() {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: LOGIVYA_PLATFORM_OWNER_EMAIL },
  });
  if (!existingAdmin) {
    await createUser({
      firstName: "Platform",
      lastName: "Admin",
      email: LOGIVYA_PLATFORM_OWNER_EMAIL,
    });
  }
  await prisma.billingSellerConfiguration.upsert({
    where: { id: "logivya" },
    update: {
      officialName: LOGIVYA_SELLER_DISPLAY_NAME,
      registeredAddress: "Integration test address",
      taxOffice: "Integration Tax Office",
      taxNumber: "1234567890",
      email: "support@logivya.com",
      phone: "+905520048107",
      tradeRegistryNotApplicable: true,
      mersisNotApplicable: true,
      legalDocumentsApprovedAt: new Date(),
      verifiedAt: new Date(),
    },
    create: {
      id: "logivya",
      officialName: LOGIVYA_SELLER_DISPLAY_NAME,
      registeredAddress: "Integration test address",
      taxOffice: "Integration Tax Office",
      taxNumber: "1234567890",
      email: "support@logivya.com",
      phone: "+905520048107",
      tradeRegistryNotApplicable: true,
      mersisNotApplicable: true,
      legalDocumentsApprovedAt: new Date(),
      verifiedAt: new Date(),
    },
  });
}

async function submitDraft(
  workspace: Awaited<ReturnType<typeof createOwnerWorkspace>>,
  draft: Awaited<ReturnType<typeof createManualSubscriptionDraft>>,
  label: string,
) {
  return submitManualSubscriptionRequest({
    requestId: draft.id,
    companyId: workspace.company.id,
    userId: workspace.owner.id,
    acceptedDocuments: acceptedDocuments(draft),
    immediatePerformanceConsent: true,
    correlationId: unique("subscription-correlation"),
    request: request(label),
  });
}

async function assertStoredRequest(input: {
  workspace: Awaited<ReturnType<typeof createOwnerWorkspace>>;
  draft: Awaited<ReturnType<typeof createManualSubscriptionDraft>>;
  expectedPlan: "STARTER" | "PROFESSIONAL";
  expectedAmount: string;
}) {
  const stored = await prisma.subscriptionRequest.findUniqueOrThrow({
    where: { id: input.draft.id },
    include: { consents: true, transitions: true },
  });
  assert.equal(stored.status, "AWAITING_PAYMENT");
  assert.equal(stored.planCode, input.expectedPlan);
  assert.equal(stored.amount.toFixed(2), input.expectedAmount);
  assert.equal(stored.currency, "TRY");
  assert.equal(stored.transferDescriptionEmail, input.workspace.owner.email);
  assert.equal(stored.consents.length, 3);
  assert(stored.immediatePerformanceConsentAt);
  assert.equal(stored.activationSubscriptionId, null);
  assert.equal(
    await prisma.subscription.count({ where: { companyId: input.workspace.company.id } }),
    0,
    "A request must not activate a subscription automatically.",
  );
  assert.equal(
    await prisma.notification.count({
      where: {
        companyId: input.workspace.company.id,
        userId: input.workspace.owner.id,
        type: "subscription.request_created",
      },
    }),
    1,
  );
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: LOGIVYA_PLATFORM_OWNER_EMAIL },
  });
  assert.equal(
    await prisma.notification.count({
      where: {
        companyId: input.workspace.company.id,
        userId: admin.id,
        type: "admin.subscription_request_created",
      },
    }),
    1,
  );
  return stored;
}

async function main() {
  assertLocalTestDatabase();
  await configureSellerAndAdmin();

  const starterWorkspace = await createOwnerWorkspace("StarterCheckout");
  const starterDraft = await createManualSubscriptionDraft({
    planSlug: "starter",
    billingPeriod: "MONTHLY",
    idempotencyKey: unique("starter-idempotency"),
    correlationId: unique("starter-correlation"),
    context: context(starterWorkspace),
  });
  assert.equal(starterDraft.amount, "280");
  assert.equal(starterDraft.planCode, "STARTER");
  assert.equal(starterDraft.buyerSnapshot.email, starterWorkspace.owner.email);
  assert.equal(starterDraft.buyerSnapshot.address, null);
  assert.equal(starterDraft.seller.officialName, LOGIVYA_SELLER_DISPLAY_NAME);
  assert(!("registeredAddress" in starterDraft.seller));
  assert.deepEqual(starterDraft.bank, LOGIVYA_BANK_TRANSFER);
  assert.equal(starterDraft.legalDocuments.length, 3);

  const starterSubmission = await submitDraft(starterWorkspace, starterDraft, "starter");
  assert.equal(starterSubmission.workflowStatus, "AWAITING_PAYMENT");
  assert.equal(starterSubmission.duplicate, false);
  await assertStoredRequest({
    workspace: starterWorkspace,
    draft: starterDraft,
    expectedPlan: "STARTER",
    expectedAmount: "280.00",
  });
  const duplicateSubmission = await submitDraft(starterWorkspace, starterDraft, "starter-duplicate");
  assert.equal(duplicateSubmission.duplicate, true);
  assert.equal(
    await prisma.subscriptionRequestConsent.count({ where: { requestId: starterDraft.id } }),
    3,
  );

  const professionalWorkspace = await createOwnerWorkspace("ProfessionalCheckout");
  const obsoleteStarter = await createManualSubscriptionDraft({
    planSlug: "starter",
    billingPeriod: "MONTHLY",
    idempotencyKey: unique("obsolete-starter"),
    context: context(professionalWorkspace),
  });
  const professionalKey = unique("professional-idempotency");
  const [professionalDraft, concurrentDraft] = await Promise.all([
    createManualSubscriptionDraft({
      planSlug: "professional",
      billingPeriod: "MONTHLY",
      idempotencyKey: professionalKey,
      correlationId: unique("professional-correlation"),
      context: context(professionalWorkspace),
    }),
    createManualSubscriptionDraft({
      planSlug: "professional",
      billingPeriod: "MONTHLY",
      idempotencyKey: professionalKey,
      correlationId: unique("professional-correlation"),
      context: context(professionalWorkspace),
    }),
  ]);
  assert.equal(professionalDraft.id, concurrentDraft.id);
  assert.equal(
    await prisma.subscriptionRequest.count({
      where: {
        companyId: professionalWorkspace.company.id,
        planCode: "PROFESSIONAL",
      },
    }),
    1,
  );
  assert.equal(professionalDraft.amount, "380");
  assert.equal(professionalDraft.planCode, "PROFESSIONAL");
  await submitDraft(professionalWorkspace, professionalDraft, "professional");
  await assertStoredRequest({
    workspace: professionalWorkspace,
    draft: professionalDraft,
    expectedPlan: "PROFESSIONAL",
    expectedAmount: "380.00",
  });
  const obsolete = await prisma.subscriptionRequest.findUniqueOrThrow({
    where: { id: obsoleteStarter.id },
  });
  assert.equal(obsolete.status, "CANCELLED");
  const latestOnly = await listManualSubscriptionRequestsForCompany(
    professionalWorkspace.company.id,
  );
  assert.equal(latestOnly.length, 1);
  assert.equal(latestOnly[0]?.id, professionalDraft.id);

  console.log(JSON.stringify({
    result: "passed",
    starter: {
      requestId: starterDraft.publicId,
      databaseId: starterDraft.id,
      amount: starterDraft.amount,
      status: starterSubmission.workflowStatus,
      consentCount: 3,
      userNotificationCount: 1,
      adminNotificationCount: 1,
      subscriptionCount: 0,
    },
    professional: {
      requestId: professionalDraft.publicId,
      databaseId: professionalDraft.id,
      amount: professionalDraft.amount,
      status: "AWAITING_PAYMENT",
      latestRequestOnly: latestOnly.length,
      subscriptionCount: 0,
    },
    bank: LOGIVYA_BANK_TRANSFER,
  }, null, 2));
}

main()
  .finally(async () => prisma.$disconnect());
