import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { LOGIVYA_PLATFORM_OWNER_EMAIL } from "../src/server/auth/platform-owner";
import {
  completeTemporaryPasswordChange,
  issueTemporaryPasswordChangeChallenge,
} from "../src/server/auth/temporary-password";
import {
  LOGIVYA_BANK_TRANSFER,
  LOGIVYA_SELLER_DISPLAY_NAME,
} from "../src/server/billing/manual-subscription-config";
import { prisma } from "../src/server/db";
import { createMobileSession } from "../src/server/mobile/auth";
import { hashPassword, verifyPassword } from "../src/server/security/passwords";

type JsonResponse = {
  success: boolean;
  data?: {
    draft?: SubscriptionDraft;
    request?: { status?: string; workflowStatus?: string };
    duplicate?: boolean;
    requests?: unknown[];
    capacity?: SeatUsage;
    user?: { id?: string };
    seatUsage?: SeatUsage;
    users?: Array<{ user: { id: string } }>;
    requesterPermissions?: { canCreateUsers?: boolean };
    membershipAccess?: {
      sharedAccess?: boolean;
      plan?: { endsAt?: string };
    };
  };
  error?: { code?: string; message?: string; details?: unknown };
};

type SeatUsage = { used?: number; limit?: number };

type SubscriptionDraft = {
  id: string;
  planCode: string;
  amount: string;
  buyerSnapshot: { email?: string; address?: string | null };
  seller: { officialName?: string };
  bank: typeof LOGIVYA_BANK_TRANSFER;
  legalDocuments: Array<{ type: string; version: string; hash: string }>;
};

function assertLocalTestDatabase() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  const localDatabase = ["127.0.0.1", "localhost"].includes(database.hostname)
    && database.pathname.toLowerCase().includes("test");
  assert(localDatabase, "Refusing to run mobile route integration outside a local test database.");
}

function unique(prefix: string) {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

async function readJson(response: Response) {
  return await response.json() as JsonResponse;
}

async function createUser(label: string, email?: string) {
  const suffix = unique(label.toLowerCase().replace(/\W/gu, "-"));
  return prisma.user.create({
    data: {
      name: `${label} Test`,
      firstName: label,
      lastName: "Test",
      username: suffix,
      email: email ?? `${suffix}@example.test`,
      passwordHash: await hashPassword("Owner-Password-42", process.env.PASSWORD_PEPPER ?? ""),
      status: "ACTIVE",
      locale: "tr",
    },
  });
}

async function createWorkspace(label: string, planSlug?: "starter" | "professional") {
  const owner = await createUser(`${label}Owner`);
  const company = await prisma.company.create({
    data: { name: unique(`${label}-workspace`), ownerId: owner.id, email: owner.email },
  });
  const membership = await prisma.companyUser.create({
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
  let subscription = null;
  if (planSlug) {
    const plan = await prisma.plan.findUniqueOrThrow({ where: { slug: planSlug } });
    const startsAt = new Date(Date.now() - 60_000);
    const endsAt = new Date(Date.now() + 30 * 86_400_000);
    subscription = await prisma.subscription.create({
      data: {
        companyId: company.id,
        planId: plan.id,
        status: "ACTIVE",
        billingPeriod: "MONTHLY",
        source: "MANUAL_ADMIN",
        startsAt,
        endsAt,
        currentPeriodStartsAt: startsAt,
        currentPeriodEndsAt: endsAt,
      },
    });
  }
  return { owner, company, membership, subscription };
}

async function mobileToken(input: {
  userId: string;
  companyId: string;
  role: string;
  deviceId: string;
}) {
  const session = await createMobileSession({
    ...input,
    platform: "ANDROID",
    appVersion: "route-integration",
    userAgent: "logivya-mobile-route-integration",
  });
  return session.accessToken;
}

function mobileRequest(path: string, token: string, init: RequestInit = {}) {
  return new Request(`http://127.0.0.1:3107${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "accept-language": "tr-TR,tr;q=0.9",
      "content-type": "application/json",
      "user-agent": "logivya-mobile-route-integration",
      "x-forwarded-for": "127.0.0.1",
      "x-request-id": unique("mobile-route"),
      ...(init.headers ?? {}),
    },
  });
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:3107/api/health", {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status < 500) return;
    } catch {
      // The sibling Next.js process may still be compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error("The local Next.js integration server did not become ready.");
}

async function configureSellerAndAdmin() {
  await prisma.billingSellerConfiguration.upsert({
    where: { id: "logivya" },
    update: {
      officialName: LOGIVYA_SELLER_DISPLAY_NAME,
      registeredAddress: "Local integration address",
      taxOffice: "Local Integration Tax Office",
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
      registeredAddress: "Local integration address",
      taxOffice: "Local Integration Tax Office",
      taxNumber: "1234567890",
      email: "support@logivya.com",
      phone: "+905520048107",
      tradeRegistryNotApplicable: true,
      mersisNotApplicable: true,
      legalDocumentsApprovedAt: new Date(),
      verifiedAt: new Date(),
    },
  });
  const admin = await prisma.user.findUnique({ where: { email: LOGIVYA_PLATFORM_OWNER_EMAIL } });
  if (!admin) await createUser("PlatformAdmin", LOGIVYA_PLATFORM_OWNER_EMAIL);
}

async function proveSubscriptionRoutes() {
  await configureSellerAndAdmin();
  const workspace = await createWorkspace("MobileSubscription");
  const token = await mobileToken({
    userId: workspace.owner.id,
    companyId: workspace.company.id,
    role: workspace.membership.role,
    deviceId: unique("subscription-device"),
  });

  const invalidResponse = await fetch(mobileRequest(
    "/api/mobile/subscription/requests",
    token,
    { method: "POST", body: JSON.stringify({ planSlug: "starter" }) },
  ));
  const invalidBody = await readJson(invalidResponse);
  assert.equal(invalidResponse.status, 400);
  assert.equal(invalidBody.error?.code, "VALIDATION_ERROR");

  const createResponse = await fetch(mobileRequest(
    "/api/mobile/subscription/requests",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        planSlug: "starter",
        billingPeriod: "MONTHLY",
        idempotencyKey: unique("starter-idempotency"),
      }),
    },
  ));
  const createBody = await readJson(createResponse);
  assert.equal(createResponse.status, 201);
  assert.equal(createBody.success, true);
  const draft = createBody.data?.draft;
  assert(draft, "Subscription route did not return a draft.");
  assert.equal(draft.planCode, "STARTER");
  assert.equal(draft.amount, "280");
  assert.equal(draft.buyerSnapshot.email, workspace.owner.email);
  assert.equal(draft.buyerSnapshot.address, null);
  assert.equal(draft.seller.officialName, LOGIVYA_SELLER_DISPLAY_NAME);
  assert.deepEqual(draft.bank, LOGIVYA_BANK_TRANSFER);
  assert.equal(draft.legalDocuments.length, 3);

  const acceptedDocuments = draft.legalDocuments.map((document) => ({
    type: document.type,
    version: document.version,
    hash: document.hash,
  }));
  const submitResponse = await fetch(
    mobileRequest(`/api/mobile/subscription/requests/${draft.id}/submit`, token, {
      method: "POST",
      body: JSON.stringify({ acceptedDocuments, immediatePerformanceConsent: true }),
    }),
  );
  const submitBody = await readJson(submitResponse);
  assert.equal(submitResponse.status, 200);
  assert.equal(submitBody.success, true);
  assert.equal(submitBody.data?.request.status, "PENDING_PAYMENT");
  assert.equal(submitBody.data?.request.workflowStatus, "AWAITING_PAYMENT");

  const duplicateResponse = await fetch(
    mobileRequest(`/api/mobile/subscription/requests/${draft.id}/submit`, token, {
      method: "POST",
      body: JSON.stringify({ acceptedDocuments, immediatePerformanceConsent: true }),
    }),
  );
  const duplicateBody = await readJson(duplicateResponse);
  assert.equal(duplicateResponse.status, 200);
  assert.equal(duplicateBody.data?.duplicate, true);

  const listResponse = await fetch(mobileRequest(
    "/api/mobile/subscription/requests",
    token,
  ));
  const listBody = await readJson(listResponse);
  assert.equal(listResponse.status, 200);
  assert.equal((listBody.data?.requests as unknown[]).length, 1);

  const stored = await prisma.subscriptionRequest.findUniqueOrThrow({
    where: { id: draft.id },
    include: { consents: true },
  });
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: LOGIVYA_PLATFORM_OWNER_EMAIL } });
  assert.equal(stored.status, "AWAITING_PAYMENT");
  assert.equal(stored.amount.toFixed(2), "280.00");
  assert.equal(stored.transferDescriptionEmail, workspace.owner.email);
  assert.equal(stored.consents.length, 3);
  assert.equal(await prisma.subscription.count({ where: { companyId: workspace.company.id } }), 0);
  assert.equal(await prisma.notification.count({
    where: { companyId: workspace.company.id, userId: admin.id, type: "admin.subscription_request_created" },
  }), 1);

  const sessionStillValid = await prisma.mobileDeviceSession.count({
    where: { userId: workspace.owner.id, companyId: workspace.company.id, revokedAt: null },
  });
  assert.equal(sessionStillValid, 1, "A 400 feature response must not revoke the mobile session.");

  return {
    requestId: stored.id,
    publicId: stored.publicId,
    status: stored.status,
    amount: stored.amount.toFixed(2),
    newestVisibleRequests: (listBody.data?.requests as unknown[]).length,
    adminNotifications: 1,
    activeSubscriptionsCreated: 0,
    invalidFeatureStatus: invalidResponse.status,
    sessionPreserved: true,
  };
}

async function proveTeamRoutes() {
  const workspace = await createWorkspace("MobileTeam", "professional");
  const ownerToken = await mobileToken({
    userId: workspace.owner.id,
    companyId: workspace.company.id,
    role: workspace.membership.role,
    deviceId: unique("owner-team-device"),
  });
  const temporaryPassword = "Temporary-Password-42";
  const memberEmail = `${unique("mobile-member")}@example.test`;
  const createResponse = await fetch(mobileRequest(
    "/api/mobile/team/users",
    ownerToken,
    {
      method: "POST",
      body: JSON.stringify({
        firstName: "Mobile",
        lastName: "Member",
        email: memberEmail,
        temporaryPassword,
      }),
    },
  ));
  const createBody = await readJson(createResponse);
  assert.equal(createResponse.status, 201);
  assert.equal(createBody.success, true);
  assert.equal(createBody.data?.capacity.used, 2);
  assert.equal(createBody.data?.capacity.limit, 3);
  const memberId = String(createBody.data?.user.id);

  const listResponse = await fetch(mobileRequest("/api/mobile/team/users", ownerToken));
  const listBody = await readJson(listResponse);
  assert.equal(listResponse.status, 200);
  assert.equal(listBody.data?.seatUsage.used, 2);
  assert.equal(listBody.data?.seatUsage.limit, 3);
  assert.equal(
    (listBody.data?.users as Array<{ user: { id: string } }>).some(
      (membership) => membership.user.id === memberId,
    ),
    true,
  );

  const member = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
  const memberMembership = await prisma.companyUser.findUniqueOrThrow({
    where: { companyId_userId: { companyId: workspace.company.id, userId: memberId } },
  });
  assert.equal(member.mustChangePassword, true);
  assert.equal(memberMembership.lifecycleState, "PENDING_ACTIVATION");
  assert.equal(await verifyPassword(member.passwordHash, temporaryPassword, process.env.PASSWORD_PEPPER ?? ""), true);

  const challenge = await issueTemporaryPasswordChangeChallenge({
    userId: memberId,
    companyId: workspace.company.id,
    channel: "MOBILE",
    platform: "ANDROID",
  });
  const permanentPassword = "Permanent-Password-84";
  await completeTemporaryPasswordChange(
    mobileRequest("/api/mobile/auth/temporary-password/complete", ownerToken, { method: "POST" }),
    {
      challengeToken: challenge.token,
      temporaryPassword,
      newPassword: permanentPassword,
      newPasswordConfirmation: permanentPassword,
    },
  );
  const activatedMember = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
  const activatedMembership = await prisma.companyUser.findUniqueOrThrow({
    where: { companyId_userId: { companyId: workspace.company.id, userId: memberId } },
  });
  assert.equal(activatedMember.mustChangePassword, false);
  assert.equal(activatedMembership.lifecycleState, "ACTIVE_SHARED_MEMBER");
  assert.equal(await verifyPassword(activatedMember.passwordHash, permanentPassword, process.env.PASSWORD_PEPPER ?? ""), true);

  const memberToken = await mobileToken({
    userId: memberId,
    companyId: workspace.company.id,
    role: activatedMembership.role,
    deviceId: unique("member-team-device"),
  });
  const forbiddenResponse = await fetch(mobileRequest(
    "/api/mobile/team/users",
    memberToken,
    {
      method: "POST",
      body: JSON.stringify({
        firstName: "Forbidden",
        lastName: "Invite",
        email: `${unique("forbidden")}@example.test`,
        temporaryPassword,
      }),
    },
  ));
  const forbiddenBody = await readJson(forbiddenResponse);
  assert.equal(forbiddenResponse.status, 403);
  assert.equal(forbiddenBody.error?.code, "USER_MANAGEMENT_FORBIDDEN");

  const memberListResponse = await fetch(mobileRequest("/api/mobile/team/users", memberToken));
  const memberListBody = await readJson(memberListResponse);
  assert.equal(memberListResponse.status, 200);
  assert.equal(memberListBody.data?.requesterPermissions.canCreateUsers, false);
  assert.equal((memberListBody.data?.users as unknown[]).length, 2);
  assert.equal(memberListBody.data?.membershipAccess.sharedAccess, true);
  assert.equal(
    memberListBody.data?.membershipAccess.plan.endsAt,
    workspace.subscription?.currentPeriodEndsAt?.toISOString(),
  );

  const profileResponse = await fetch(mobileRequest("/api/mobile/company/profile", memberToken));
  assert.equal(profileResponse.status, 200, "Invited users must be able to view Profil Bilgileri.");
  const profileMutationResponse = await fetch(mobileRequest(
    "/api/mobile/company/profile",
    memberToken,
    {
      method: "PUT",
      body: JSON.stringify({
        name: "Forbidden Company Rename",
        email: workspace.company.email,
        country: "TR",
      }),
    },
  ));
  const profileMutationBody = await readJson(profileMutationResponse);
  assert.equal(profileMutationResponse.status, 403);
  assert.equal(profileMutationBody.error?.code, "FORBIDDEN");

  const memberSessionCount = await prisma.mobileDeviceSession.count({
    where: { userId: memberId, companyId: workspace.company.id, revokedAt: null },
  });
  assert.equal(memberSessionCount, 1, "A 403 feature response must not revoke the invited user's session.");

  return {
    ownerUserId: workspace.owner.id,
    memberUserId: memberId,
    companyId: workspace.company.id,
    seatUsage: "2/3",
    mustChangePasswordBeforeActivation: true,
    lifecycleAfterPasswordChange: activatedMembership.lifecycleState,
    inheritedEndsAt: workspace.subscription?.currentPeriodEndsAt?.toISOString(),
    invitedCreateStatus: forbiddenResponse.status,
    invitedCreateCode: forbiddenBody.error?.code,
    profileInformationVisible: profileResponse.status === 200,
    profileMutationForbidden: profileMutationResponse.status === 403,
    invitedSessionPreserved: true,
  };
}

async function main() {
  assertLocalTestDatabase();
  await waitForServer();
  const subscription = await proveSubscriptionRoutes();
  const team = await proveTeamRoutes();
  console.log(JSON.stringify({ result: "passed", subscription, team }, null, 2));
}

main().finally(async () => prisma.$disconnect());
