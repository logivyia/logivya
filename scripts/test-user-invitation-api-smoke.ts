import { randomBytes } from "node:crypto";

import { prisma } from "../src/server/db";
import { SESSION_COOKIE } from "../src/server/auth/session";
import { hashOpaqueToken } from "../src/server/security/authentication";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertLocalTarget(baseUrl: string) {
  const api = new URL(baseUrl);
  const database = new URL(process.env.DATABASE_URL ?? "");
  const localApi = ["127.0.0.1", "localhost"].includes(api.hostname);
  const localDatabase = ["127.0.0.1", "localhost"].includes(database.hostname)
    && database.pathname.toLowerCase().includes("test");
  if (!localApi || !localDatabase) {
    throw new Error("Refusing to run direct-user API tests outside local API and test database targets.");
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
      passwordHash: "not-used-by-session-fixture",
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

async function sessionCookie(userId: string, companyId: string) {
  const token = randomBytes(32).toString("base64url");
  await prisma.userSession.create({
    data: {
      userId,
      companyId,
      sessionTokenHash: hashOpaqueToken(token),
      ipAddress: "127.0.0.1",
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });
  return `${SESSION_COOKIE}=${token}`;
}

async function apiRequest(baseUrl: string, route: string, cookie?: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-logivya-locale": "tr",
      "x-forwarded-for": "127.0.0.1",
      origin: baseUrl,
      ...(cookie ? { cookie } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { response, body };
}

function expectCode(
  result: Awaited<ReturnType<typeof apiRequest>>,
  status: number,
  code: string,
) {
  assert(result.response.status === status, `Expected HTTP ${status}, received ${result.response.status}.`);
  assert(result.body?.error === code, `Expected ${code}, received ${String(result.body?.error)}.`);
}

function createPayload(label: string) {
  return {
    firstName: label,
    lastName: "Member",
    email: `${unique(label.toLowerCase())}@example.test`,
    temporaryPassword: "Temporary-Password-42",
  };
}

async function main() {
  const baseUrl = (process.env.API_BASE_URL || "http://127.0.0.1:3107").replace(/\/$/u, "");
  assertLocalTarget(baseUrl);

  expectCode(await apiRequest(baseUrl, "/api/settings/users"), 401, "UNAUTHORIZED");

  const starter = await createWorkspace("starter", "Starter Direct");
  const starterCookie = await sessionCookie(starter.owner.id, starter.company.id);
  const initial = await apiRequest(baseUrl, "/api/settings/users", starterCookie);
  assert(initial.response.status === 200, `Starter user list returned ${initial.response.status}.`);
  assert(initial.body?.occupiedAccounts === 1, "Starter owner must occupy the first account.");
  assert(initial.body?.accountLimit === 2 && initial.body?.availableAccounts === 1, "Starter must expose 1 / 2 authoritative capacity.");

  const injectedAuthority = await apiRequest(baseUrl, "/api/settings/users", starterCookie, {
    method: "POST",
    body: JSON.stringify({ ...createPayload("Injected"), role: "OWNER", tenantId: "attacker-tenant" }),
  });
  expectCode(injectedAuthority, 400, "VALIDATION_ERROR");

  const starterPayload = createPayload("Starter");
  const starterCreated = await apiRequest(baseUrl, "/api/settings/users", starterCookie, {
    method: "POST",
    body: JSON.stringify(starterPayload),
  });
  assert(starterCreated.response.status === 201, `Starter user creation returned ${starterCreated.response.status}.`);
  const starterCreatedUser = starterCreated.body?.user as { id?: string; mustChangePassword?: boolean } | undefined;
  assert(starterCreatedUser?.id && starterCreatedUser.mustChangePassword === true, "Created member must require a password change.");
  assert(await prisma.subscription.count({ where: { companyId: starter.company.id } }) === 1, "Member creation must not create a subscription.");
  const createdMembership = await prisma.companyUser.findFirstOrThrow({
    where: { companyId: starter.company.id, userId: starterCreatedUser.id },
    include: { user: true },
  });
  assert(createdMembership.role === "OPERATOR" && createdMembership.status === "ACTIVE", "Created member must be an active restricted user.");
  assert(createdMembership.user.passwordHash !== starterPayload.temporaryPassword, "Temporary password must never be stored as plaintext.");
  assert(await prisma.company.count({ where: { ownerId: starterCreatedUser.id } }) === 0, "Member creation must not create another tenant.");

  const duplicate = await apiRequest(baseUrl, "/api/settings/users", starterCookie, {
    method: "POST",
    body: JSON.stringify(starterPayload),
  });
  expectCode(duplicate, 409, "USER_ALREADY_IN_TENANT");

  const starterOverLimit = await apiRequest(baseUrl, "/api/settings/users", starterCookie, {
    method: "POST",
    body: JSON.stringify(createPayload("StarterOverLimit")),
  });
  expectCode(starterOverLimit, 409, "SEAT_LIMIT_REACHED");

  const firstLogin = await apiRequest(baseUrl, "/api/auth/login", undefined, {
    method: "POST",
    body: JSON.stringify({ identifier: starterPayload.email, password: starterPayload.temporaryPassword }),
  });
  assert(firstLogin.response.status === 202 && firstLogin.body?.passwordChangeRequired === true, "Temporary credentials must return the mandatory password-change challenge.");
  const challengeToken = String(firstLogin.body?.challengeToken ?? "");
  assert(challengeToken.length >= 32, "Password-change challenge must be opaque.");

  const newPassword = "Permanent-Password-84";
  const passwordChanged = await apiRequest(baseUrl, "/api/auth/temporary-password", undefined, {
    method: "POST",
    body: JSON.stringify({
      challengeToken,
      temporaryPassword: starterPayload.temporaryPassword,
      newPassword,
      newPasswordConfirmation: newPassword,
    }),
  });
  assert(passwordChanged.response.status === 200 && passwordChanged.body?.ok === true, "First-login password change must succeed.");
  const normalLogin = await apiRequest(baseUrl, "/api/auth/login", undefined, {
    method: "POST",
    body: JSON.stringify({ identifier: starterPayload.email, password: newPassword }),
  });
  assert(normalLogin.response.status === 200 && normalLogin.body?.ok === true, "Changed password must create a normal session.");

  const memberCookie = await sessionCookie(createdMembership.userId, starter.company.id);
  const memberCreate = await apiRequest(baseUrl, "/api/settings/users", memberCookie, {
    method: "POST",
    body: JSON.stringify(createPayload("Unauthorized")),
  });
  expectCode(memberCreate, 403, "FORBIDDEN");

  const trial = await createWorkspace("trial", "Trial Direct");
  const trialCookie = await sessionCookie(trial.owner.id, trial.company.id);
  const trialCreate = await apiRequest(baseUrl, "/api/settings/users", trialCookie, {
    method: "POST",
    body: JSON.stringify(createPayload("TrialBlocked")),
  });
  expectCode(trialCreate, 409, "SEAT_LIMIT_REACHED");

  const concurrentStarter = await createWorkspace("starter", "Starter Concurrent");
  const concurrentStarterCookie = await sessionCookie(concurrentStarter.owner.id, concurrentStarter.company.id);
  const starterRace = await Promise.all([
    apiRequest(baseUrl, "/api/settings/users", concurrentStarterCookie, {
      method: "POST",
      body: JSON.stringify(createPayload("StarterRaceOne")),
    }),
    apiRequest(baseUrl, "/api/settings/users", concurrentStarterCookie, {
      method: "POST",
      body: JSON.stringify(createPayload("StarterRaceTwo")),
    }),
  ]);
  assert(starterRace.filter((result) => result.response.status === 201).length === 1, "Exactly one concurrent Starter request must win.");
  assert(starterRace.filter((result) => result.body?.error === "SEAT_LIMIT_REACHED").length === 1, "The losing Starter request must receive SEAT_LIMIT_REACHED.");
  assert(await prisma.companyUser.count({ where: { companyId: concurrentStarter.company.id, status: "ACTIVE" } }) === 2, "Starter race must stop at two total accounts.");

  const professional = await createWorkspace("professional", "Professional Concurrent");
  const professionalCookie = await sessionCookie(professional.owner.id, professional.company.id);
  const professionalRace = await Promise.all([
    apiRequest(baseUrl, "/api/settings/users", professionalCookie, {
      method: "POST",
      body: JSON.stringify(createPayload("ProfessionalRaceOne")),
    }),
    apiRequest(baseUrl, "/api/settings/users", professionalCookie, {
      method: "POST",
      body: JSON.stringify(createPayload("ProfessionalRaceTwo")),
    }),
    apiRequest(baseUrl, "/api/settings/users", professionalCookie, {
      method: "POST",
      body: JSON.stringify(createPayload("ProfessionalRaceThree")),
    }),
  ]);
  assert(professionalRace.filter((result) => result.response.status === 201).length === 2, "Exactly two concurrent Professional requests must win.");
  assert(professionalRace.filter((result) => result.body?.error === "SEAT_LIMIT_REACHED").length === 1, "The losing Professional request must receive SEAT_LIMIT_REACHED.");
  assert(await prisma.companyUser.count({ where: { companyId: professional.company.id, status: "ACTIVE" } }) === 3, "Professional race must stop at three total accounts.");

  const foreignEmail = starterPayload.email;
  const crossTenantIdentity = await apiRequest(baseUrl, "/api/settings/users", professionalCookie, {
    method: "POST",
    body: JSON.stringify({ ...createPayload("ForeignIdentity"), email: foreignEmail }),
  });
  expectCode(crossTenantIdentity, 409, "EMAIL_NOT_AVAILABLE");

  const foreignMutation = await apiRequest(baseUrl, `/api/settings/users/${createdMembership.id}`, professionalCookie, {
    method: "PATCH",
    body: JSON.stringify({ status: "SUSPENDED" }),
  });
  expectCode(foreignMutation, 404, "NOT_FOUND");

  console.log("Direct sub-account API integration passed: tenant auth, strict payloads, Trial/Starter/Professional seats, concurrent races, inheritance, first-login password change and cross-tenant isolation.");
}

main().finally(() => prisma.$disconnect());
