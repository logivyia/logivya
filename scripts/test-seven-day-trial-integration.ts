import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/gu, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

function assertLocalTestDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (!localHost || !url.pathname.toLowerCase().includes("test")) {
    throw new Error("Refusing to run trial integration tests outside a local test database.");
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  assertLocalTestDatabase();
  const { prisma } = await import("../src/server/db");
  const { activateTrialAfterVerifiedWhatsAppConnection, createPendingTrialEntitlement } = await import("../src/server/billing/trial-service");
  const { DAY_IN_MILLISECONDS, TRIAL_DURATION_DAYS } = await import("../src/server/billing/trial-policy");
  const suffix = randomUUID();
  const createdUserIds: string[] = [];

  try {
    async function createCandidate(label: string, phone: string) {
      return prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: label,
            username: `${label}-${randomUUID()}`,
            email: `${label}-${randomUUID()}@example.test`,
            passwordHash: "not-a-login-credential",
            locale: "tr",
            emailVerifiedAt: new Date(),
          },
        });
        createdUserIds.push(user.id);
        const company = await tx.company.create({ data: { name: label, ownerId: user.id, email: user.email } });
        await tx.companyUser.create({ data: { companyId: company.id, userId: user.id, role: "OWNER" } });
        await createPendingTrialEntitlement(tx, { companyId: company.id, userId: user.id, registrationPhone: phone, ipAddress: "127.0.0.1" });
        const account = await tx.whatsAppAccount.create({
          data: {
            companyId: company.id,
            userId: user.id,
            provider: "BAILEYS",
            status: "CONNECTED",
            phoneNumber: phone,
            deviceId: `${phone.replace(/\D/gu, "")}:1@s.whatsapp.net`,
          },
        });
        return { user, company, account };
      });
    }

    const first = await createCandidate(`trial-first-${suffix}`, "+905551230001");
    assert(await prisma.subscription.count({ where: { companyId: first.company.id, source: "TRIAL" } }) === 0, "Registration must not start the trial clock.");
    const activated = await activateTrialAfterVerifiedWhatsAppConnection(first.account.id);
    assert(activated.outcome === "TRIAL_STARTED", "The first verified WhatsApp identity must activate the trial.");
    const subscription = await prisma.subscription.findFirstOrThrow({ where: { companyId: first.company.id, source: "TRIAL" } });
    assert(subscription.status === "TRIALING", "Verified trial must be active.");
    assert(
      (subscription.trialEndsAt?.getTime() ?? 0) - (subscription.trialStartsAt?.getTime() ?? 0) === TRIAL_DURATION_DAYS * DAY_IN_MILLISECONDS,
      "Verified trial must last exactly seven days.",
    );

    const replay = await activateTrialAfterVerifiedWhatsAppConnection(first.account.id);
    assert(replay.outcome === "TRIAL_ALREADY_ACTIVE", "Repeated connection events must be idempotent.");
    assert(await prisma.subscription.count({ where: { companyId: first.company.id, source: "TRIAL" } }) === 1, "Repeated events must not create duplicate trials.");

    const second = await createCandidate(`trial-second-${suffix}`, "0090 555 123 00 01");
    const rejected = await activateTrialAfterVerifiedWhatsAppConnection(second.account.id);
    assert(rejected.outcome === "TRIAL_IDENTITY_ALREADY_USED", "A second account must not recycle the same verified WhatsApp identity.");
    assert(await prisma.subscription.count({ where: { companyId: second.company.id, source: "TRIAL" } }) === 0, "Rejected identity must not receive a trial subscription.");

    console.log("Verified WhatsApp trial integration passed: delayed start, idempotency, and identity replay prevention.");
  } finally {
    const companies = await prisma.company.findMany({ where: { ownerId: { in: createdUserIds } }, select: { id: true } });
    const companyIds = companies.map((company) => company.id);
    await prisma.$transaction([
      prisma.trialEntitlement.deleteMany({ where: { companyId: { in: companyIds } } }),
      prisma.whatsAppAccount.deleteMany({ where: { companyId: { in: companyIds } } }),
      prisma.notification.deleteMany({ where: { companyId: { in: companyIds } } }),
      prisma.auditLog.deleteMany({ where: { companyId: { in: companyIds } } }),
      prisma.subscription.deleteMany({ where: { companyId: { in: companyIds } } }),
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
