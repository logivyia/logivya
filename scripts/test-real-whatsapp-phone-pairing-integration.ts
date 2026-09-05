import { createHash, randomBytes } from "node:crypto";

import { AccountStatus } from "@prisma/client";

import { prisma } from "../src/server/db";
import { createMobileSession } from "../src/server/mobile/auth";
import { parsePhonePairingRequest } from "../src/server/whatsapp/phone-pairing-input";
import { hashPassword } from "../src/server/security/passwords";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertLocalInfrastructure() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  const redis = new URL(process.env.REDIS_URL ?? "");
  const databaseIsLocal = ["127.0.0.1", "localhost"].includes(database.hostname)
    && database.pathname.toLowerCase().includes("test");
  const redisIsLocal = ["127.0.0.1", "localhost"].includes(redis.hostname);
  if (!databaseIsLocal || !redisIsLocal) {
    throw new Error("Refusing to run real pairing integration outside isolated local infrastructure.");
  }
}

function unique(prefix: string) {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

type PairingRouteResponse = {
  success: boolean;
  data?: {
    account?: {
      id?: string;
      phoneNumber?: string;
      status?: string;
      rawStatus?: string;
      pairingCode?: string | null;
      pairingCodeExpiresAt?: string | null;
    };
  };
  error?: { code?: string; message?: string };
};

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

function pairingRequest(token: string, body: unknown) {
  return new Request("http://127.0.0.1:3107/api/mobile/whatsapp/accounts/phone-code", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "accept-language": "tr-TR,tr;q=0.9",
      "content-type": "application/json",
      "user-agent": "logivya-real-pairing-route-integration",
      "x-forwarded-for": "127.0.0.1",
      "x-request-id": unique("real-pairing-route"),
    },
    body: JSON.stringify(body),
  });
}

async function main() {
  assertLocalInfrastructure();
  await waitForServer();

  const expectedE164 = "+905393565142";
  const variants = [
    { countryIso: "TR", nationalNumber: "5393565142" },
    { countryIso: "TR", nationalNumber: "05393565142" },
    { countryIso: "TR", nationalNumber: "905393565142" },
    { countryIso: "TR", nationalNumber: "+905393565142" },
    { countryIso: "TR", nationalNumber: "0539 356 51 42" },
    { countryIso: "TR", nationalNumber: "+90 539 356 51 42" },
  ];
  for (const input of variants) {
    const parsed = parsePhonePairingRequest(input);
    assert(parsed.e164 === expectedE164, `${input.nationalNumber} did not normalize to ${expectedE164}.`);
  }

  const suffix = unique("real-pairing");
  const owner = await prisma.user.create({
    data: {
      name: "Real Pairing Owner",
      firstName: "Real",
      lastName: "Pairing",
      username: suffix,
      email: `${suffix}@example.test`,
      passwordHash: await hashPassword("Local-Only-Password-42", process.env.PASSWORD_PEPPER ?? ""),
      status: "ACTIVE",
      locale: "tr",
    },
  });
  const company = await prisma.company.create({
    data: { name: unique("Real Pairing Workspace"), ownerId: owner.id, email: owner.email },
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
  const plan = await prisma.plan.findUniqueOrThrow({ where: { slug: "professional" } });
  const startsAt = new Date(Date.now() - 60_000);
  const endsAt = new Date(Date.now() + 30 * 86_400_000);
  await prisma.subscription.create({
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
  const session = await createMobileSession({
    userId: owner.id,
    companyId: company.id,
    role: membership.role,
    deviceId: unique("real-pairing-device"),
    platform: "ANDROID",
    appVersion: "pairing-route-integration",
    userAgent: "logivya-real-pairing-route-integration",
  });

  const invalidResponse = await fetch(pairingRequest(session.accessToken, {
    countryIso: "TR",
    nationalNumber: "123",
  }));
  const invalidBody = await invalidResponse.json() as PairingRouteResponse;
  assert(invalidResponse.status === 400, `Invalid phone returned ${invalidResponse.status}, expected 400.`);
  assert(invalidBody.success === false, "Invalid phone unexpectedly succeeded.");
  assert(
    ["INVALID_WHATSAPP_PHONE", "PHONE_COUNTRY_MISMATCH", "UNSUPPORTED_PHONE_COUNTRY"].includes(invalidBody.error?.code ?? ""),
    `Unexpected invalid-phone error code: ${invalidBody.error?.code ?? "missing"}.`,
  );
  assert(
    await prisma.mobileDeviceSession.count({
      where: { userId: owner.id, companyId: company.id, revokedAt: null },
    }) === 1,
    "A phone validation failure revoked the mobile session.",
  );

  const response = await fetch(pairingRequest(session.accessToken, variants[0]));
  const body = await response.json() as PairingRouteResponse;
  assert(response.status === 201, `Pairing endpoint returned ${response.status}: ${body.error?.code ?? "unknown"}.`);
  assert(body.success === true, `Pairing endpoint failed: ${body.error?.message ?? "unknown"}.`);
  const routeAccount = body.data?.account;
  assert(routeAccount?.id, "Pairing endpoint did not return an account id.");
  assert(routeAccount.pairingCode, "The real Baileys worker did not return a pairing code through the HTTP endpoint.");
  assert(
    routeAccount.pairingCodeExpiresAt && new Date(routeAccount.pairingCodeExpiresAt) > new Date(),
    "The HTTP pairing response has no valid future expiry.",
  );

  const stored = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: routeAccount.id } });
  assert(stored.companyId === company.id && stored.userId === owner.id, "Pairing account ownership changed.");
  assert(stored.phoneNumber === expectedE164, "Stored pairing phone is not canonical E.164.");
  assert(stored.pairingCode === routeAccount.pairingCode, "Returned pairing code differs from the database record.");
  assert(stored.status === AccountStatus.PAIRING_CODE_READY, `Unexpected pairing status: ${stored.status}.`);

  const pairingCode = routeAccount.pairingCode;
  console.log(JSON.stringify({
    result: "passed",
    source: "real-mobile-http-endpoint-and-baileys-worker",
    endpoint: "POST /api/mobile/whatsapp/accounts/phone-code",
    httpStatus: response.status,
    invalidRequestStatus: invalidResponse.status,
    invalidRequestCode: invalidBody.error?.code,
    sessionPreservedAfterValidationError: true,
    accountId: stored.id,
    companyId: stored.companyId,
    userId: stored.userId,
    phoneNumber: stored.phoneNumber,
    status: stored.status,
    pairingCodeLength: pairingCode.replace(/\W/gu, "").length,
    pairingCodePreview: `${pairingCode.slice(0, 2)}****${pairingCode.slice(-2)}`,
    pairingCodeSha256: createHash("sha256").update(pairingCode).digest("hex"),
    pairingCodeExpiresAt: stored.pairingCodeExpiresAt?.toISOString(),
    normalizedVariants: variants.length,
  }, null, 2));
}

main()
  .finally(async () => prisma.$disconnect());
