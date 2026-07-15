import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (key && !process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/gu, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

import { prisma } from "@/server/db";
import { hashOpaqueToken } from "@/server/security/authentication";
import { verifyPassword } from "@/server/security/passwords";

const baseUrl = process.env.AUTH_TEST_BASE_URL ?? "http://127.0.0.1:3215";
const runId = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
const ipSeed = 1 + Math.floor(Math.random() * 240);

type JsonObject = Record<string, unknown>;

async function request(path: string, body: JsonObject, platform: "web" | "mobile") {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": platform === "web" ? `198.51.100.${ipSeed}` : `203.0.113.${ipSeed}`,
      "x-logivya-locale": "tr",
      "x-logivya-app-version": "auth-policy-integration",
      "user-agent": `logivya-${platform}-auth-policy-test`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as JsonObject | null;
  return { response, payload };
}

function credentials(index: number, password: string) {
  const suffix = `${runId}-${index}`;
  return {
    name: `Auth Policy ${index}`,
    email: `auth-policy-${suffix}@example.test`,
    phone: `90555${String(Date.now()).slice(-7)}${String(index).padStart(2, "0")}`,
    password,
    passwordConfirmation: password,
  };
}

function webBody(input: ReturnType<typeof credentials>, extra: JsonObject = {}) {
  return {
    ...input,
    termsAccepted: "on",
    privacyAccepted: "on",
    kvkkAccepted: "on",
    ...extra,
  };
}

function mobileBody(input: ReturnType<typeof credentials>, extra: JsonObject = {}) {
  return {
    ...input,
    termsAccepted: true,
    privacyAccepted: true,
    kvkkAccepted: true,
    deviceId: `auth-policy-device-${runId}-${input.email}`,
    platform: "ANDROID",
    appVersion: "auth-policy-integration",
    ...extra,
  };
}

async function assertRegistered(path: string, body: JsonObject, platform: "web" | "mobile") {
  const result = await request(path, body, platform);
  assert.equal(result.response.status, 201, `${platform} registration failed: ${JSON.stringify(result.payload)}`);
  const email = String(body.email);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  assert.equal(await verifyPassword(user.passwordHash, String(body.password), process.env.PASSWORD_PEPPER ?? ""), true);
  return user;
}

async function main() {
  await prisma.plan.upsert({
    where: { slug: "trial" },
    update: { isActive: true, maxTeamUsers: 20 },
    create: {
      name: "Integration Trial",
      slug: "trial",
      trialDays: 7,
      maxWhatsappAccounts: 3,
      maxTeamUsers: 20,
      maxGroups: 1_000_000,
      maxMessagesPerDay: 1_000_000,
      maxMessagesPerMonth: 1_000_000,
      groupMessagingEnabled: true,
      contactMessagingEnabled: true,
      deleteForEveryoneEnabled: true,
      hasScheduledMessages: true,
      hasRecurringMessages: true,
    },
  });
  const invitationPlan = await prisma.plan.upsert({
    where: { slug: "auth-policy-integration" },
    update: { isActive: true, maxTeamUsers: 20 },
    create: {
      name: "Auth Policy Integration",
      slug: "auth-policy-integration",
      maxWhatsappAccounts: 3,
      maxTeamUsers: 20,
      maxGroups: 1_000_000,
      maxMessagesPerDay: 1_000_000,
      maxMessagesPerMonth: 1_000_000,
      groupMessagingEnabled: true,
      contactMessagingEnabled: true,
      deleteForEveryoneEnabled: true,
      hasScheduledMessages: true,
      hasRecurringMessages: true,
    },
  });

  const webPasswords = ["abcdefgh", "12345678", "testtest", "Logivya1"];
  const mobilePasswords = ["!!!!!!!!", "+1234567", "şifre123", "пароль12"];
  const webUsers = [];
  const mobileUsers = [];

  for (const [index, password] of webPasswords.entries()) {
    const input = credentials(index + 1, password);
    webUsers.push({ input, user: await assertRegistered("/api/auth/register", webBody(input), "web") });
  }

  for (const [index, password] of mobilePasswords.entries()) {
    const input = credentials(index + 11, password);
    mobileUsers.push({ input, user: await assertRegistered("/api/mobile/auth/register", mobileBody(input), "mobile") });
  }

  const webShort = credentials(21, "abcdefg");
  const webShortResult = await request("/api/auth/register", webBody(webShort), "web");
  assert.equal(webShortResult.response.status, 400);
  assert.equal(webShortResult.payload?.error, "PASSWORD_TOO_SHORT");

  const webMismatch = credentials(22, "abcdefgh");
  const webMismatchResult = await request("/api/auth/register", webBody({ ...webMismatch, passwordConfirmation: "abcdefgh1" }), "web");
  assert.equal(webMismatchResult.response.status, 400);
  assert.equal(webMismatchResult.payload?.error, "PASSWORD_CONFIRMATION_MISMATCH");

  const mobileShort = credentials(23, "abcdefg");
  const mobileShortResult = await request("/api/mobile/auth/register", mobileBody(mobileShort), "mobile");
  assert.equal(mobileShortResult.response.status, 400);
  assert.equal((mobileShortResult.payload?.error as JsonObject | undefined)?.code, "PASSWORD_TOO_SHORT");

  const mobileMismatch = credentials(24, "abcdefgh");
  const mobileMismatchResult = await request("/api/mobile/auth/register", mobileBody({ ...mobileMismatch, passwordConfirmation: "abcdefgh1" }), "mobile");
  assert.equal(mobileMismatchResult.response.status, 400);
  assert.equal((mobileMismatchResult.payload?.error as JsonObject | undefined)?.code, "PASSWORD_CONFIRMATION_MISMATCH");

  const existingHashBeforeLogin = webUsers[1].user.passwordHash;
  const webLogin = await request("/api/auth/login", {
    identifier: webUsers[1].input.email,
    password: webUsers[1].input.password,
  }, "web");
  assert.equal(webLogin.response.status, 200, `web login failed: ${JSON.stringify(webLogin.payload)}`);
  const hashAfterLogin = (await prisma.user.findUniqueOrThrow({ where: { id: webUsers[1].user.id } })).passwordHash;
  assert.equal(hashAfterLogin, existingHashBeforeLogin, "Login must not rewrite existing password hashes");

  const mobileLogin = await request("/api/mobile/auth/login", {
    identifier: mobileUsers[0].input.email,
    password: mobileUsers[0].input.password,
    deviceId: `auth-policy-login-${runId}`,
    platform: "ANDROID",
    appVersion: "auth-policy-integration",
  }, "mobile");
  assert.equal(mobileLogin.response.status, 200, `mobile login failed: ${JSON.stringify(mobileLogin.payload)}`);

  const resetUser = webUsers[0].user;
  const resetCode = "654321";
  await prisma.passwordResetToken.create({
    data: {
      userId: resetUser.id,
      email: resetUser.email,
      tokenHash: hashOpaqueToken(`${resetUser.id}:${resetCode}:${process.env.PASSWORD_PEPPER ?? ""}`),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });

  const shortReset = await request("/api/auth/reset-password", {
    identifier: resetUser.email,
    code: resetCode,
    password: "1234567",
    passwordConfirmation: "1234567",
  }, "web");
  assert.equal(shortReset.response.status, 400);
  assert.equal(shortReset.payload?.error, "PASSWORD_TOO_SHORT");

  const reset = await request("/api/auth/reset-password", {
    identifier: resetUser.email,
    code: resetCode,
    password: "resetpass",
    passwordConfirmation: "resetpass",
  }, "web");
  assert.equal(reset.response.status, 200, `password reset failed: ${JSON.stringify(reset.payload)}`);
  const resetHash = (await prisma.user.findUniqueOrThrow({ where: { id: resetUser.id } })).passwordHash;
  assert.equal(await verifyPassword(resetHash, "resetpass", process.env.PASSWORD_PEPPER ?? ""), true);

  const inviter = webUsers[2].user;
  const inviterCompany = await prisma.company.findFirstOrThrow({ where: { ownerId: inviter.id } });
  const invitationSubscriptionStartsAt = new Date();
  const invitationSubscriptionEndsAt = new Date(invitationSubscriptionStartsAt.getTime() + 30 * 86_400_000);
  await prisma.subscription.create({
    data: {
      companyId: inviterCompany.id,
      planId: invitationPlan.id,
      status: "ACTIVE",
      billingPeriod: "MONTHLY",
      startsAt: invitationSubscriptionStartsAt,
      endsAt: invitationSubscriptionEndsAt,
      currentPeriodStartsAt: invitationSubscriptionStartsAt,
      currentPeriodEndsAt: invitationSubscriptionEndsAt,
      source: "MANUAL_ADMIN",
      provider: "MANUAL",
    },
  });
  const invitationToken = `integration-invitation-${runId}-abcdefghijklmnopqrstuvwxyz`;
  const invited = credentials(31, "qwertyui");
  await prisma.companyInvitation.create({
    data: {
      companyId: inviterCompany.id,
      invitedByUserId: inviter.id,
      email: invited.email,
      name: invited.name,
      role: "OPERATOR",
      status: "PENDING",
      tokenHash: hashOpaqueToken(invitationToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    },
  });
  const invitedUser = await assertRegistered("/api/auth/register", webBody(invited, { invitationToken }), "web");
  const invitedMembership = await prisma.companyUser.findUnique({
    where: { companyId_userId: { companyId: inviterCompany.id, userId: invitedUser.id } },
  });
  assert.equal(invitedMembership?.status, "ACTIVE");

  console.log(JSON.stringify({
    ok: true,
    database: "isolated PostgreSQL",
    webRegistrations: webUsers.length,
    mobileRegistrations: mobileUsers.length,
    webLogin: "passed without hash rewrite",
    mobileLogin: "passed",
    passwordReset: "short rejected; eight-character reset accepted",
    invitationRegistration: "qwertyui accepted and membership activated",
  }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
