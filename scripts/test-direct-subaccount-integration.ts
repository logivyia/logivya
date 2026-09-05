import { randomBytes } from "node:crypto";

import { prisma } from "../src/server/db";
import { resolveCompanyEntitlements } from "../src/server/billing/company-entitlements";
import {
  completeTemporaryPasswordChange,
  issueTemporaryPasswordChangeChallenge,
} from "../src/server/auth/temporary-password";
import { hashPassword, verifyPassword } from "../src/server/security/passwords";
import {
  createDirectCompanyUser,
  resetCompanyUserTemporaryPassword,
} from "../src/server/team/direct-company-users";
import {
  deleteCompanyUser,
  rejectCompanyUserRoleMutation,
  updateCompanyUser,
} from "../src/server/team/company-users";
import { getCompanySeatUsage } from "../src/server/team/company-invitations";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertLocalTestDatabase() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  const localDatabase = ["127.0.0.1", "localhost"].includes(database.hostname)
    && database.pathname.toLowerCase().includes("test");
  if (!localDatabase) {
    throw new Error("Refusing to run direct-user integration outside a local test database.");
  }
}

function unique(prefix: string) {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

async function createUser(label: string) {
  const suffix = unique(label.toLowerCase().replace(/\W/gu, "-"));
  return prisma.user.create({
    data: {
      name: label,
      firstName: label,
      lastName: "Test",
      username: suffix,
      email: `${suffix}@example.test`,
      passwordHash: await hashPassword("Owner-Password-42", process.env.PASSWORD_PEPPER ?? ""),
      status: "ACTIVE",
      locale: "tr",
    },
  });
}

async function createWorkspace(planSlug: "trial" | "starter" | "professional", label: string) {
  const owner = await createUser(`${label} Owner`);
  const plan = await prisma.plan.findUniqueOrThrow({ where: { slug: planSlug } });
  const company = await prisma.company.create({
    data: { name: unique(label), ownerId: owner.id, email: owner.email },
  });
  const ownerMembership = await prisma.companyUser.create({
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
  const startsAt = new Date(Date.now() - 60_000);
  const endsAt = new Date(Date.now() + 30 * 86_400_000);
  const subscription = await prisma.subscription.create({
    data: {
      companyId: company.id,
      planId: plan.id,
      status: planSlug === "trial" ? "TRIALING" : "ACTIVE",
      billingPeriod: planSlug === "trial" ? "TRIAL" : "MONTHLY",
      source: planSlug === "trial" ? "TRIAL" : "MANUAL_ADMIN",
      startsAt,
      endsAt,
      trialStartsAt: planSlug === "trial" ? startsAt : null,
      trialEndsAt: planSlug === "trial" ? endsAt : null,
      currentPeriodStartsAt: startsAt,
      currentPeriodEndsAt: endsAt,
    },
  });
  return { owner, ownerMembership, company, subscription };
}

function request(operation: string) {
  return new Request(`http://127.0.0.1:3107/api/settings/users/${operation}`, {
    method: "POST",
    headers: {
      "x-forwarded-for": "127.0.0.1",
      "user-agent": "logivya-direct-user-integration",
      "x-request-id": unique("request"),
    },
  });
}

function payload(label: string, email?: string) {
  return {
    firstName: label,
    lastName: "Member",
    email: email ?? `${unique(label.toLowerCase())}@example.test`,
    temporaryPassword: "Temporary-Password-42",
  };
}

async function expectError(action: () => Promise<unknown>, expected: string) {
  try {
    await action();
  } catch (error) {
    assert(error instanceof Error && error.message === expected, `Expected ${expected}, received ${error instanceof Error ? error.message : String(error)}.`);
    return;
  }
  throw new Error(`Expected ${expected}, but the operation succeeded.`);
}

async function main() {
  assertLocalTestDatabase();

  const trial = await createWorkspace("trial", "Trial Direct");
  const trialContext = {
    companyId: trial.company.id,
    actorUserId: trial.owner.id,
    actorRole: trial.ownerMembership.role,
  };
  const trialSeats = await getCompanySeatUsage(trial.company.id);
  assert(trialSeats.used === 1 && trialSeats.limit === 1, "Trial owner must occupy its only account.");
  await expectError(
    () => createDirectCompanyUser(request("trial"), trialContext, payload("TrialBlocked")),
    "SEAT_LIMIT_REACHED",
  );

  const starter = await createWorkspace("starter", "Starter Direct");
  const starterContext = {
    companyId: starter.company.id,
    actorUserId: starter.owner.id,
    actorRole: starter.ownerMembership.role,
  };
  const starterPayload = payload("StarterMember");
  const starterCreated = await createDirectCompanyUser(request("starter"), starterContext, starterPayload);
  assert(starterCreated.capacity.used === 2 && starterCreated.capacity.limit === 2, "Starter must become 2 / 2 after one member.");
  assert(starterCreated.membership.role === "OPERATOR", "Direct members must never become OWNER.");
  assert(starterCreated.membership.lifecycleState === "PENDING_ACTIVATION", "Direct members must start in PENDING_ACTIVATION.");
  assert(starterCreated.user.mustChangePassword, "Direct members must require a first-login password change.");
  assert(starterCreated.user.passwordHash !== starterPayload.temporaryPassword, "Temporary password must be hashed.");
  assert(await verifyPassword(starterCreated.user.passwordHash, starterPayload.temporaryPassword, process.env.PASSWORD_PEPPER ?? ""), "Stored hash must verify the temporary password.");
  assert(await prisma.subscription.count({ where: { companyId: starter.company.id } }) === 1, "Direct member must not receive another subscription.");
  assert(await prisma.trialEntitlement.count({ where: { userId: starterCreated.user.id } }) === 0, "Direct member must not receive a trial.");
  assert(await prisma.company.count({ where: { ownerId: starterCreated.user.id } }) === 0, "Direct member must not receive another tenant.");

  const inherited = await resolveCompanyEntitlements(starter.company.id);
  assert(inherited?.subscription.id === starter.subscription.id, "Member access must resolve the tenant subscription.");
  assert(inherited?.subscription.currentPeriodEndsAt?.getTime() === starter.subscription.currentPeriodEndsAt?.getTime(), "Member access must preserve the tenant subscription end date.");

  await expectError(
    () => createDirectCompanyUser(request("starter-duplicate"), starterContext, starterPayload),
    "USER_ALREADY_IN_TENANT",
  );
  await expectError(
    () => createDirectCompanyUser(request("starter-full"), starterContext, payload("StarterFull")),
    "SEAT_LIMIT_REACHED",
  );
  await expectError(
    () => createDirectCompanyUser(request("member-bypass"), {
      companyId: starter.company.id,
      actorUserId: starterCreated.user.id,
      actorRole: "OPERATOR",
    }, payload("Unauthorized")),
    "FORBIDDEN",
  );

  const challenge = await issueTemporaryPasswordChangeChallenge({
    userId: starterCreated.user.id,
    companyId: starter.company.id,
    channel: "WEB",
    platform: "WEB",
  });
  const preChangeSession = await prisma.userSession.create({
    data: {
      userId: starterCreated.user.id,
      companyId: starter.company.id,
      sessionTokenHash: randomBytes(32).toString("hex"),
      ipAddress: "127.0.0.1",
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });
  const permanentPassword = "Permanent-Password-84";
  await completeTemporaryPasswordChange(request("password-change"), {
    challengeToken: challenge.token,
    temporaryPassword: starterPayload.temporaryPassword,
    newPassword: permanentPassword,
    newPasswordConfirmation: permanentPassword,
  });
  const changedUser = await prisma.user.findUniqueOrThrow({ where: { id: starterCreated.user.id } });
  const activatedMembership = await prisma.companyUser.findUniqueOrThrow({
    where: { id: starterCreated.membership.id },
  });
  assert(!changedUser.mustChangePassword && changedUser.temporaryPasswordSetAt === null, "First password change must clear temporary state.");
  assert(activatedMembership.lifecycleState === "ACTIVE_SHARED_MEMBER", "First password change must activate shared membership atomically.");
  assert(Boolean(activatedMembership.activationCompletedAt), "Activated membership must record activationCompletedAt.");
  assert(await verifyPassword(changedUser.passwordHash, permanentPassword, process.env.PASSWORD_PEPPER ?? ""), "Permanent password must verify after first-login change.");
  assert((await prisma.userSession.findUniqueOrThrow({ where: { id: preChangeSession.id } })).revokedAt, "First-login password change must revoke prior sessions.");

  await expectError(
    () => resetCompanyUserTemporaryPassword(
      request("activated-password-reset"),
      starterContext,
      starterCreated.membership.id,
      "Reset-Temporary-Password-126",
    ),
    "MEMBER_SELF_MANAGED_AFTER_ACTIVATION",
  );
  await expectError(
    () => updateCompanyUser(request("activated-suspend"), starterContext, starterCreated.membership.id, { status: "SUSPENDED" }),
    "MEMBER_SELF_MANAGED_AFTER_ACTIVATION",
  );
  await expectError(
    () => deleteCompanyUser(request("activated-remove"), starterContext, starterCreated.membership.id),
    "MEMBER_SELF_MANAGED_AFTER_ACTIVATION",
  );
  assert((await getCompanySeatUsage(starter.company.id)).used === 2, "Activated shared member must retain the occupied seat.");

  const pendingWorkspace = await createWorkspace("starter", "Pending Lifecycle");
  const pendingContext = {
    companyId: pendingWorkspace.company.id,
    actorUserId: pendingWorkspace.owner.id,
    actorRole: pendingWorkspace.ownerMembership.role,
  };
  const pendingCreated = await createDirectCompanyUser(
    request("pending-create"),
    pendingContext,
    payload("PendingMember"),
  );
  const resetSession = await prisma.userSession.create({
    data: {
      userId: pendingCreated.user.id,
      companyId: pendingWorkspace.company.id,
      sessionTokenHash: randomBytes(32).toString("hex"),
      ipAddress: "127.0.0.1",
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });
  await resetCompanyUserTemporaryPassword(
    request("password-reset"),
    pendingContext,
    pendingCreated.membership.id,
    "Reset-Temporary-Password-126",
  );
  assert((await prisma.user.findUniqueOrThrow({ where: { id: pendingCreated.user.id } })).mustChangePassword, "Pending owner reset must preserve mandatory password change.");
  assert((await prisma.userSession.findUniqueOrThrow({ where: { id: resetSession.id } })).revokedAt, "Pending owner reset must revoke member sessions.");
  await expectError(
    () => updateCompanyUser(request("owner-protection"), starterContext, starter.ownerMembership.id, { status: "SUSPENDED" }),
    "users.ownerProtected",
  );
  await deleteCompanyUser(request("pending-remove"), pendingContext, pendingCreated.membership.id);
  assert((await getCompanySeatUsage(pendingWorkspace.company.id)).used === 1, "Pending cancellation must release the seat.");
  assert(await prisma.subscription.count({ where: { companyId: pendingWorkspace.company.id } }) === 1, "Pending cancellation must not reset the subscription.");
  const replacement = await createDirectCompanyUser(request("replacement"), pendingContext, payload("Replacement"));
  assert(replacement.capacity.used === 2, "Released Starter seat must be reusable.");
  await expectError(
    () => rejectCompanyUserRoleMutation(
      request("role-escalation"),
      pendingContext,
      replacement.membership.id,
      { role: "OWNER" },
    ),
    "FORBIDDEN",
  );

  const concurrentStarter = await createWorkspace("starter", "Starter Concurrent");
  const concurrentStarterContext = {
    companyId: concurrentStarter.company.id,
    actorUserId: concurrentStarter.owner.id,
    actorRole: concurrentStarter.ownerMembership.role,
  };
  const starterRace = await Promise.allSettled([
    createDirectCompanyUser(request("starter-race-one"), concurrentStarterContext, payload("StarterRaceOne")),
    createDirectCompanyUser(request("starter-race-two"), concurrentStarterContext, payload("StarterRaceTwo")),
  ]);
  assert(starterRace.filter((result) => result.status === "fulfilled").length === 1, "Exactly one concurrent Starter request must win.");
  assert(starterRace.some((result) => result.status === "rejected" && result.reason instanceof Error && result.reason.message === "SEAT_LIMIT_REACHED"), "The losing Starter request must receive SEAT_LIMIT_REACHED.");
  assert(await prisma.companyUser.count({ where: { companyId: concurrentStarter.company.id, status: "ACTIVE" } }) === 2, "Starter race must stop at two accounts.");

  const professional = await createWorkspace("professional", "Professional Concurrent");
  const professionalContext = {
    companyId: professional.company.id,
    actorUserId: professional.owner.id,
    actorRole: professional.ownerMembership.role,
  };
  const professionalRace = await Promise.allSettled([
    createDirectCompanyUser(request("professional-race-one"), professionalContext, payload("ProfessionalRaceOne")),
    createDirectCompanyUser(request("professional-race-two"), professionalContext, payload("ProfessionalRaceTwo")),
    createDirectCompanyUser(request("professional-race-three"), professionalContext, payload("ProfessionalRaceThree")),
  ]);
  assert(professionalRace.filter((result) => result.status === "fulfilled").length === 2, "Exactly two concurrent Professional requests must win.");
  assert(professionalRace.some((result) => result.status === "rejected" && result.reason instanceof Error && result.reason.message === "SEAT_LIMIT_REACHED"), "The losing Professional request must receive SEAT_LIMIT_REACHED.");
  assert(await prisma.companyUser.count({ where: { companyId: professional.company.id, status: "ACTIVE" } }) === 3, "Professional race must stop at three accounts.");

  await expectError(
    () => createDirectCompanyUser(request("cross-tenant-email"), professionalContext, payload("CrossTenant", starterPayload.email)),
    "EMAIL_NOT_AVAILABLE",
  );
  await expectError(
    () => updateCompanyUser(request("cross-tenant-membership"), professionalContext, replacement.membership.id, { status: "SUSPENDED" }),
    "NOT_FOUND",
  );

  const requiredAuditActions = [
    "USER_CREATED_BY_OWNER",
    "USER_CREATION_REJECTED_SEAT_LIMIT",
    "USER_CREATION_REJECTED_DUPLICATE",
    "CONCURRENT_SEAT_LIMIT_REJECTION",
    "UNAUTHORIZED_USER_CREATION_ATTEMPT",
    "USER_PASSWORD_CHANGED_FIRST_LOGIN",
    "USER_TEMPORARY_PASSWORD_RESET",
    "USER_REMOVED",
    "USER_ROLE_CHANGE_ATTEMPT_REJECTED",
    "SHARED_MEMBER_ACTIVATED",
    "OWNER_ACTIVATED_MEMBER_MANAGEMENT_REJECTED",
    "OWNER_MEMBER_STATUS_CHANGE_REJECTED",
    "OWNER_MEMBER_REMOVAL_REJECTED",
  ];
  const recordedActions = new Set((await prisma.auditLog.findMany({
    where: {
      companyId: { in: [starter.company.id, pendingWorkspace.company.id, concurrentStarter.company.id, professional.company.id] },
      action: { in: requiredAuditActions },
    },
    select: { action: true },
  })).map((entry) => entry.action));
  for (const action of requiredAuditActions) {
    assert(recordedActions.has(action), `Audit action ${action} must be recorded.`);
  }

  console.log("Direct sub-account database integration passed: lifecycle activation, pending-only owner controls, activated-member self-management, Trial/Starter/Professional limits, atomic races and cross-tenant isolation.");
}

main().finally(() => prisma.$disconnect());
